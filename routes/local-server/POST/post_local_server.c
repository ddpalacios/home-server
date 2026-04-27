
#include <openssl/ssl.h>
#include <cjson/cJSON.h>
#include "json_utilities.h"
#include <string.h>
#include "send_message.h"
#include <arpa/inet.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "Socket.h"
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/time.h>
#include <unistd.h>
#include <ctype.h>
#include <errno.h>
#define IPSTRLEN INET6_ADDRSTRLEN
#define ETL_BACKEND_HOST "127.0.0.1"
#define ETL_BACKEND_PORT "5000"

/* How long to wait per recv() chunk from the upstream local-server before
 * giving up. Without a timeout the proxy can hang forever if local-server
 * is slow or wedged, which freezes the user's browser request. 60s is more
 * than enough for any synchronous notebook operation; long-running cells
 * stream via SSE, which has its own (longer) per-event budget below. */
#define UPSTREAM_RECV_TIMEOUT_SEC 60

/* SSE connections are long-lived. The Spark progress sampler emits an event
 * every ~800ms; we allow up to 30s between events so a quiet Spark stage
 * doesn't trip a false timeout. */
#define UPSTREAM_SSE_RECV_TIMEOUT_SEC 30

/* Apply SO_RCVTIMEO / SO_SNDTIMEO and TCP_NODELAY to the upstream socket.
 * Without these, recv() blocks indefinitely on a hung backend, send() can
 * silently buffer, and TCP Nagle delays small SSE events by up to 40ms.
 * Returns 0 on success, -1 if any setsockopt fails (caller can ignore). */
static int set_proxy_socket_timeouts(int sfd, int recv_seconds) {
    struct timeval tv = { .tv_sec = recv_seconds, .tv_usec = 0 };
    int rc = 0;
    if (setsockopt(sfd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv)) < 0) rc = -1;
    if (setsockopt(sfd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv)) < 0) rc = -1;
    int yes = 1;
    if (setsockopt(sfd, IPPROTO_TCP, TCP_NODELAY, &yes, sizeof(yes)) < 0) rc = -1;
    return rc;
}

/* Parse the status line "HTTP/1.x NNN Reason\r\n" at the start of `response`.
   Writes status_text (caller-owned buffer of size `st_size`) and returns the
   numeric code, or -1 if parsing fails. */
static int parse_upstream_status(const char *response, char *status_text, size_t st_size) {
    if (!response) return -1;
    const char *sp = strchr(response, ' ');
    if (!sp) return -1;
    int code = atoi(sp + 1);
    if (code <= 0) return -1;
    const char *reason = strchr(sp + 1, ' ');
    const char *eol = strstr(response, "\r\n");
    if (status_text && st_size > 0) {
        if (reason && eol && reason < eol) {
            size_t n = (size_t)(eol - (reason + 1));
            if (n >= st_size) n = st_size - 1;
            memcpy(status_text, reason + 1, n);
            status_text[n] = '\0';
        } else {
            status_text[0] = '\0';
        }
    }
    return code;
}

/* Extract the value of `header_name` (case-insensitive, NUL-terminated lower
   prefix like "set-cookie:") from the response header block; copies into
   `out` (size `out_size`). Returns 1 on found, 0 otherwise. */
static int extract_header(const char *response, const char *header_name,
                          char *out, size_t out_size) {
    if (!response || !header_name || !out || out_size == 0) return 0;
    const char *eoh = strstr(response, "\r\n\r\n");
    size_t hlen = eoh ? (size_t)(eoh - response) : strlen(response);
    size_t name_len = strlen(header_name);
    const char *p = response;
    while (p < response + hlen) {
        const char *eol = strstr(p, "\r\n");
        if (!eol || eol > response + hlen) break;
        if ((size_t)(eol - p) > name_len &&
            strncasecmp(p, header_name, name_len) == 0) {
            const char *v = p + name_len;
            while (v < eol && (*v == ' ' || *v == '\t')) v++;
            size_t n = (size_t)(eol - v);
            if (n >= out_size) n = out_size - 1;
            memcpy(out, v, n);
            out[n] = '\0';
            return 1;
        }
        p = eol + 2;
    }
    return 0;
}
int connect_to_local_server(const char* host, const char* port){
	struct addrinfo hints;
	struct addrinfo *addrs_res = NULL;
	memset(&hints, 0, sizeof(hints));
	char ipstr[IPSTRLEN];
	hints.ai_family = AF_INET;
	hints.ai_socktype = SOCK_STREAM;
	hints.ai_protocol = IPPROTO_TCP;
	const int status = getaddrinfo(host, port, &hints, &addrs_res);
	if (status != 0 || addrs_res == NULL){
		fprintf(stderr, "getaddrinfo(%s:%s) failed: %s\n", host, port, gai_strerror(status));
		return -1;
	}
	int sfd = -1;
	int connected = -1;
	for (struct addrinfo *addr = addrs_res; addr != NULL; addr = addr->ai_next){
		if (addr->ai_family == AF_INET) {
			struct sockaddr_in *ipv4 = (struct sockaddr_in *)addr->ai_addr;
			void *addr4 = &(ipv4->sin_addr);
			inet_ntop(addr->ai_family, addr4, ipstr, IPSTRLEN);
		}else{
			struct sockaddr_in6 *ipv6 = (struct sockaddr_in6 *)addr->ai_addr;
			void* addr6 = &(ipv6->sin6_addr);
			inet_ntop(addr->ai_family, addr6, ipstr, IPSTRLEN);
		}
		sfd = socket(addr->ai_family, addr->ai_socktype, addr->ai_protocol);
		if (sfd < 0){
			printf("Error creating socket for host: '%s' at '%s'\n", host, ipstr);
			continue;
		}
		connected = connect(sfd, addr->ai_addr, addr->ai_addrlen);
		if (connected == 0){
			struct timeval rto = {120, 0}; /* 120s recv timeout for long previews/runs */
			struct timeval sto = {10, 0};  /* 10s send timeout */
			setsockopt(sfd, SOL_SOCKET, SO_RCVTIMEO, &rto, sizeof(rto));
			setsockopt(sfd, SOL_SOCKET, SO_SNDTIMEO, &sto, sizeof(sto));
			printf("Successfully connected to '%s'\n", host);
			break;
		}
		printf("Error connecting to host: '%s' at '%s'\n", host, ipstr);
		close(sfd);
		sfd = -1;
	}
	freeaddrinfo(addrs_res);
	if (sfd >= 0 && connected == 0){
		return sfd;
	}
	return -1;
}

/* Returns 1 if the JSON body has "preview": true, 0 otherwise. Tolerates parse errors. */
static int body_has_preview_true(const char* body){
	if (!body || !*body) return 0;
	cJSON *root = cJSON_Parse(body);
	if (!root) return 0;
	cJSON *preview = cJSON_GetObjectItem(root, "preview");
	int is_preview = (preview && cJSON_IsTrue(preview)) ? 1 : 0;
	cJSON_Delete(root);
	return is_preview;
}

void post_ctabustracker_getpredictions(struct Socket* socket,char* http_header, char*body, char* route){
    int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
    if (sfd < 0) {
        send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
        return;
    }
    set_proxy_socket_timeouts(sfd, UPSTREAM_RECV_TIMEOUT_SEC);
    char request[2048];
    snprintf(request, sizeof(request),
            "POST /CTA/ctabustracker/getpredictions/run HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "Connection: close\r\n"
            "\r\n",
            ETL_BACKEND_HOST, ETL_BACKEND_PORT);
    send(sfd,request, strlen(request),0);
    close(sfd);


 }

void post_generate_phrase(struct Socket* socket,char* http_header, char*body, char* route){
    int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
    if (sfd < 0) {
        send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
        return;
    }
    set_proxy_socket_timeouts(sfd, UPSTREAM_RECV_TIMEOUT_SEC);
    const char *safe_body = body ? body : "";
    size_t req_size = strlen(safe_body) + 2048;
    char *request = malloc(req_size);
    if (!request) {
        perror("malloc failed");
        close(sfd);
        send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
        return;
    }
    snprintf(request, req_size,
        "POST /phrase-matching/generate HTTP/1.1\r\n"
        "Host: %s:%s\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "\r\n"
        "%s",
        ETL_BACKEND_HOST, ETL_BACKEND_PORT, strlen(safe_body), safe_body);
    send(sfd,request, strlen(request),0);
    free(request);
    close(sfd);
 }

 
void post_to_local(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
		return;
	}
	set_proxy_socket_timeouts(sfd, UPSTREAM_RECV_TIMEOUT_SEC);
	const char *safe_body = body ? body : "";
	size_t req_size = strlen(safe_body) + 2048;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
		send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
		return;
	}

	snprintf(request, req_size,
		"POST %s HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Content-Type: application/json\r\n"
		"Content-Length: %zu\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		route,
		ETL_BACKEND_HOST, ETL_BACKEND_PORT, strlen(safe_body), safe_body);

	send(sfd, request, strlen(request), 0);
	free(request);
	char buf[8192];
    char *response = NULL;
    size_t total = 0;
    int recv_error = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved == 0) break;
        if (bytes_recved < 0) { perror("recv"); recv_error = 1; break; }
        char *tmp = realloc(response, total + bytes_recved + 1);
        if (!tmp) {
            perror("realloc");
            free(response);
            close(sfd);
            send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
            return;
        }
			response = tmp;
			memcpy(response + total, buf, bytes_recved);
			total += bytes_recved;
		}
		if (!response || recv_error) {
			free(response);
			close(sfd);
			send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"upstream read failure\"}");
			return;
		}

		response[total] = '\0';
		printf("Total bytes received: %zu\n", total);

		char *res_body = strstr(response, "\r\n\r\n");
		if (res_body) {
			res_body += 4;
			size_t body_len = total - (size_t)(res_body - response);

			char status_text[64] = {0};
			char content_type[128] = {0};
			char set_cookie[1024] = {0};
			int code = parse_upstream_status(response, status_text, sizeof(status_text));
			extract_header(response, "Content-Type:", content_type, sizeof(content_type));
			int has_cookie = extract_header(response, "Set-Cookie:", set_cookie, sizeof(set_cookie));
			send_proxy_response(socket->cSSL,
				code > 0 ? code : 200,
				status_text[0] ? status_text : "OK",
				content_type[0] ? content_type : "application/json",
				has_cookie ? set_cookie : NULL,
				res_body, body_len);
		} else {
			printf("No HTTP body found\n");
			send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"malformed upstream response\"}");
		}

    free(response);
    close(sfd);


 }

void post_to_local_no_reply(const char* route, const char* body){
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		return;
	}
	set_proxy_socket_timeouts(sfd, UPSTREAM_RECV_TIMEOUT_SEC);
	const char *safe_body = body ? body : "";
	size_t req_size = strlen(safe_body) + 2048;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
		return;
	}

	snprintf(request, req_size,
		"POST %s HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Content-Type: application/json\r\n"
		"Content-Length: %zu\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		route,
		ETL_BACKEND_HOST, ETL_BACKEND_PORT, strlen(safe_body), safe_body);
	send(sfd, request, strlen(request), 0);
	free(request);
	close(sfd);
}

 void get_from_local(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
		return;
	}
	set_proxy_socket_timeouts(sfd, UPSTREAM_RECV_TIMEOUT_SEC);
	size_t req_size = strlen(route) + 512;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
		send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
		return;
	}

	snprintf(request, req_size,
		"GET %s HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Connection: close\r\n"
		"\r\n",
		route,
		ETL_BACKEND_HOST, ETL_BACKEND_PORT);

	send(sfd, request, strlen(request), 0);
	free(request);
	char buf[8192];
    char *response = NULL;
    size_t total = 0;
    int recv_error = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved == 0) break;
        if (bytes_recved < 0) { perror("recv"); recv_error = 1; break; }
        char *tmp = realloc(response, total + bytes_recved + 1);
        if (!tmp) {
            perror("realloc");
            free(response);
            close(sfd);
            send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
            return;
        }
			response = tmp;
			memcpy(response + total, buf, bytes_recved);
			total += bytes_recved;
		}
		if (!response || recv_error) {
			free(response);
			close(sfd);
			send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"upstream read failure\"}");
			return;
		}

		response[total] = '\0';

		char *header_end = strstr(response, "\r\n\r\n");
		if (!header_end) {
			printf("No HTTP header end found\n");
			send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"malformed upstream response\"}");
		} else {
			char status_text[64] = {0};
			int code = parse_upstream_status(response, status_text, sizeof(status_text));
			int is_redirect = (code == 301 || code == 302 || code == 303 || code == 307 || code == 308);

			if (is_redirect) {
				char location_value[2048] = {0};
				if (extract_header(response, "Location:", location_value, sizeof(location_value))) {
					char set_cookie[1024] = {0};
					int has_cookie = extract_header(response, "Set-Cookie:", set_cookie, sizeof(set_cookie));
					char redirect_header[4096];
					if (has_cookie) {
						snprintf(redirect_header, sizeof(redirect_header),
							"HTTP/1.1 %d %s\r\n"
							"Location: %s\r\n"
							"Set-Cookie: %s\r\n"
							"Connection: close\r\n"
							"Content-Length: 0\r\n"
							"\r\n",
							code, status_text[0] ? status_text : "Found",
							location_value, set_cookie);
					} else {
						snprintf(redirect_header, sizeof(redirect_header),
							"HTTP/1.1 %d %s\r\n"
							"Location: %s\r\n"
							"Connection: close\r\n"
							"Content-Length: 0\r\n"
							"\r\n",
							code, status_text[0] ? status_text : "Found",
							location_value);
					}
					SSL_write(socket->cSSL, redirect_header, strlen(redirect_header));
				} else {
					send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"redirect without Location\"}");
				}
			} else {
				char *res_body = header_end + 4;
				size_t body_len = total - (size_t)(res_body - response);
				char content_type[128] = {0};
				char set_cookie[1024] = {0};
				extract_header(response, "Content-Type:", content_type, sizeof(content_type));
				int has_cookie = extract_header(response, "Set-Cookie:", set_cookie, sizeof(set_cookie));
				send_proxy_response(socket->cSSL,
					code > 0 ? code : 200,
					status_text[0] ? status_text : "OK",
					content_type[0] ? content_type : "application/json",
					has_cookie ? set_cookie : NULL,
					res_body, body_len);
			}
		}

    free(response);
    close(sfd);
 }


//  void post_run_pipeline(struct Socket* socket,char* http_header, char*body, char* route){
// 	int sfd  = connect_to_local_server("127.0.0.1", "5001");
// 	size_t req_size = strlen(body) + 2048;
// 	char *request = malloc(req_size);
// 	if (!request) {
// 		perror("malloc failed");
// 		return;
// 	}

// 	snprintf(request, req_size,
// 		"POST /etl/run/pipeline HTTP/1.1\r\n"
// 		"Host: %s:%s\r\n"
// 		"Content-Type: application/json\r\n"
// 		"Content-Length: %zu\r\n"
// 		"Connection: close\r\n"
// 		"\r\n"
// 		"%s",
// 		"127.0.0.1", "5001", strlen(body), body);

// 	send(sfd, request, strlen(request), 0);
// 	free(request);

//     char buf[8192]; 
//     char *response = NULL;
//     size_t total = 0;

//     for (;;) {
//         int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
//         if (bytes_recved <= 0)
//             break;
//         char *tmp = realloc(response, total + bytes_recved + 1);
//         if (!tmp) {
//             perror("realloc");
//             free(response);
//             return;
//         }
// 			response = tmp;
// 			memcpy(response + total, buf, bytes_recved);
// 			total += bytes_recved;
// 		}
// 		if (!response) {
// 			printf("No data received\n");
// 			return;
// 		}

// 		response[total] = '\0'; 
// 		printf("Total bytes received: %zu\n", total);

// 		char *res_body = strstr(response, "\r\n\r\n");
// 		if (res_body) {
// 			res_body += 4;
// 			size_t body_len = strlen(res_body);
// 			send_html_response_code(socket->cSSL, 200, body_len);
// 			SSL_write(socket->cSSL, res_body, body_len);
// 		} else {
// 			printf("No HTTP body found\n");
// 		}

//     free(response);
//     close(sfd);
//  }

/* Forward a DELETE request to the upstream backend. Mirrors post_to_local
 * but emits "DELETE" in the request line instead of "POST". The Flask
 * DELETE handlers do not read a body, but we still send Content-Length: 0
 * and forward the body if any was supplied for parity with post_to_local. */
void delete_to_local(struct Socket* socket, char* http_header, char* body, char* route){
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
		return;
	}
	set_proxy_socket_timeouts(sfd, UPSTREAM_RECV_TIMEOUT_SEC);
	const char *safe_body = body ? body : "";
	size_t req_size = strlen(safe_body) + 2048;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
		send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
		return;
	}

	snprintf(request, req_size,
		"DELETE %s HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Content-Type: application/json\r\n"
		"Content-Length: %zu\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		route,
		ETL_BACKEND_HOST, ETL_BACKEND_PORT, strlen(safe_body), safe_body);

	send(sfd, request, strlen(request), 0);
	free(request);
	char buf[8192];
	char *response = NULL;
	size_t total = 0;
	int recv_error = 0;

	for (;;) {
		int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
		if (bytes_recved == 0) break;
		if (bytes_recved < 0) { perror("recv"); recv_error = 1; break; }
		char *tmp = realloc(response, total + bytes_recved + 1);
		if (!tmp) {
			perror("realloc");
			free(response);
			close(sfd);
			send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
			return;
		}
		response = tmp;
		memcpy(response + total, buf, bytes_recved);
		total += bytes_recved;
	}
	if (!response || recv_error) {
		free(response);
		close(sfd);
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"upstream read failure\"}");
		return;
	}

	response[total] = '\0';

	char *res_body = strstr(response, "\r\n\r\n");
	if (res_body) {
		res_body += 4;
		size_t body_len = total - (size_t)(res_body - response);
		char status_text[64] = {0};
		char content_type[128] = {0};
		char set_cookie[1024] = {0};
		int code = parse_upstream_status(response, status_text, sizeof(status_text));
		extract_header(response, "Content-Type:", content_type, sizeof(content_type));
		int has_cookie = extract_header(response, "Set-Cookie:", set_cookie, sizeof(set_cookie));
		send_proxy_response(socket->cSSL,
			code > 0 ? code : 200,
			status_text[0] ? status_text : "OK",
			content_type[0] ? content_type : "application/json",
			has_cookie ? set_cookie : NULL,
			res_body, body_len);
	} else {
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"malformed upstream response\"}");
	}

	free(response);
	close(sfd);
}

/* Proxy a GET request to the upstream backend and forward the response body
 * unbuffered, chunk by chunk. Used for Server-Sent Events (text/event-stream)
 * where the upstream response is open-ended and bytes must reach the browser
 * as soon as they arrive.
 *
 * Unlike post_to_local / get_from_local (which read the entire response into
 * memory before sending), this:
 *   1. Sends headers as soon as the \r\n\r\n delimiter is seen.
 *   2. Then loops recv()->SSL_write() until upstream closes.
 */
void proxy_sse_to_local(struct Socket* socket, char* http_header, char* body, char* route){
    int sfd = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
    if (sfd < 0){
        send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
        return;
    }
    /* SSE: longer per-event recv timeout (events are sparse during quiet
     * Spark stages), and TCP_NODELAY so individual events aren't held up
     * by Nagle on the upstream socket. */
    set_proxy_socket_timeouts(sfd, UPSTREAM_SSE_RECV_TIMEOUT_SEC);

    char request[2048];
    snprintf(request, sizeof(request),
             "GET %s HTTP/1.1\r\n"
             "Host: %s:%s\r\n"
             "Accept: text/event-stream\r\n"
             "Cache-Control: no-cache\r\n"
             "Connection: close\r\n"
             "\r\n",
             route, ETL_BACKEND_HOST, ETL_BACKEND_PORT);
    send(sfd, request, strlen(request), 0);

    /* Read until we have the full header block, then forward it once. */
    char hdr[8192];
    size_t hdr_len = 0;
    int header_done = 0;
    while (!header_done && hdr_len < sizeof(hdr) - 1){
        int n = recv(sfd, hdr + hdr_len, sizeof(hdr) - 1 - hdr_len, 0);
        if (n <= 0) break;
        hdr_len += (size_t)n;
        hdr[hdr_len] = '\0';
        if (strstr(hdr, "\r\n\r\n") != NULL) header_done = 1;
    }
    if (!header_done){
        close(sfd);
        send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"upstream header timeout\"}");
        return;
    }

    /* Forward the headers up to the body delimiter, then any pre-buffered body. */
    char *body_start = strstr(hdr, "\r\n\r\n");
    body_start += 4;
    size_t header_only_len = (size_t)(body_start - hdr);
    SSL_write(socket->cSSL, hdr, (int)header_only_len);
    size_t leftover = hdr_len - header_only_len;
    if (leftover > 0){
        SSL_write(socket->cSSL, body_start, (int)leftover);
    }

    /* Stream the rest as it arrives. */
    char buf[4096];
    for (;;){
        int n = recv(sfd, buf, sizeof(buf), 0);
        if (n <= 0) break;
        int w = SSL_write(socket->cSSL, buf, n);
        if (w <= 0) break;
    }

    close(sfd);
}

void post_run_activity(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
		return;
	}
	set_proxy_socket_timeouts(sfd, UPSTREAM_RECV_TIMEOUT_SEC);
	const char *safe_body = body ? body : "";
	size_t req_size = strlen(safe_body) + 2048;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
		send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
		return;
	}

	snprintf(request, req_size,
		"POST %s HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Content-Type: application/json\r\n"
		"Content-Length: %zu\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		route,
		ETL_BACKEND_HOST, ETL_BACKEND_PORT, strlen(safe_body), safe_body);

	send(sfd, request, strlen(request), 0);
	free(request);

	/* Non-preview /etl/run posts trigger long-running pipelines. The Python
	   backend returns the run_id eagerly and finishes in a background thread;
	   read the headers + first body chunk so we capture the run_id, then
	   forward what we have and close. */
	int short_circuit = (strstr(route, "/etl/run") != NULL
		&& !body_has_preview_true(safe_body));

    char buf[8192];
    char *response = NULL;
    size_t total = 0;
    int recv_error = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved == 0) break;
        if (bytes_recved < 0) { perror("recv"); recv_error = 1; break; }
        char *tmp = realloc(response, total + bytes_recved + 1);
        if (!tmp) {
            perror("realloc");
            free(response);
            close(sfd);
            send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
            return;
        }
			response = tmp;
			memcpy(response + total, buf, bytes_recved);
			total += bytes_recved;

			if (short_circuit && total > 0) {
				char *eoh = strstr(response, "\r\n\r\n");
				if (eoh && strchr(eoh + 4, '}')) {
					/* full body fits in one chunk; Python emitted run_id and closed */
					break;
				}
			}
		}
		if (!response || recv_error) {
			free(response);
			close(sfd);
			send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"upstream read failure\"}");
			return;
		}

		response[total] = '\0';
		printf("Total bytes received: %zu\n", total);

		char *res_body = strstr(response, "\r\n\r\n");
		if (res_body) {
			res_body += 4;
			size_t body_len = total - (size_t)(res_body - response);
			char status_text[64] = {0};
			char content_type[128] = {0};
			int code = parse_upstream_status(response, status_text, sizeof(status_text));
			extract_header(response, "Content-Type:", content_type, sizeof(content_type));
			send_proxy_response(socket->cSSL,
				code > 0 ? code : 200,
				status_text[0] ? status_text : "OK",
				content_type[0] ? content_type : "application/json",
				NULL,
				res_body, body_len);
		} else {
			printf("No HTTP body found\n");
			send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"malformed upstream response\"}");
		}

    free(response);
    close(sfd);

 }
