
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
=======
#include "json_utilities.h"
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <netinet/in.h>
#include <unistd.h>
#include <ctype.h>
#define IPSTRLEN INET6_ADDRSTRLEN

#define LOCAL_SERVER_HOST "127.0.0.1"
#define LOCAL_SERVER_PORT "5000"

=======
#define ETL_BACKEND_HOST "127.0.0.1"
#define ETL_BACKEND_PORT "5000"

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
		printf("getaddrinfo failed for host '%s': %s\n", host, gai_strerror(status));
		return -1;
	}
	int sfd = -1;
=======
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
			printf("Error opening socket for host: '%s' at '%s'\n", host, ipstr);
			continue;
		}
		if (connect(sfd, addr->ai_addr, addr->ai_addrlen) == 0){
			printf("Successfully connected to '%s'\n", host);
			freeaddrinfo(addrs_res);
			return sfd;
		}
=======
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
    int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
    if (sfd < 0) {
        printf("post_ctabustracker_getpredictions: failed to connect to local server\n");
=======
	if (sfd >= 0 && connected == 0){
		return sfd;
	}
	return -1;
}

void post_ctabustracker_getpredictions(struct Socket* socket,char* http_header, char*body, char* route){
    int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
    if (sfd < 0) {
        send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
        return;
    }
    char request[2048];
    snprintf(request, sizeof(request),
            "POST /CTA/ctabustracker/getpredictions/run HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "Connection: close\r\n"
            "\r\n",
            LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
=======
            ETL_BACKEND_HOST, ETL_BACKEND_PORT);
    send(sfd,request, strlen(request),0);
    close(sfd);


 }

void post_generate_phrase(struct Socket* socket,char* http_header, char*body, char* route){
    int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
    if (sfd < 0) {
        printf("post_generate_phrase: failed to connect to local server\n");
        return;
    }
    const char *safe_body = body ? body : "";
    size_t req_size = strlen(safe_body) + 2048;
    char *request = malloc(req_size);
    if (!request) {
        perror("malloc failed");
        close(sfd);
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
        LOCAL_SERVER_HOST, LOCAL_SERVER_PORT, strlen(safe_body), safe_body);
=======
    int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
    if (sfd < 0) {
        send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
        return;
    }
    char request[2048];
	snprintf(request, sizeof(request),
		"POST /phrase-matching/generate HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Content-Type: application/json\r\n"
		"Content-Length: %zu\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		ETL_BACKEND_HOST, ETL_BACKEND_PORT, strlen(body), body);
	printf("Request %s\n", request);
    send(sfd,request, strlen(request),0);
    free(request);
    close(sfd);
 }

 
void post_to_local(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
	if (sfd < 0) {
		printf("post_to_local: failed to connect to local server\n");
=======
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
		return;
	}
	const char *safe_body = body ? body : "";
	size_t req_size = strlen(safe_body) + 2048;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
=======
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
		LOCAL_SERVER_HOST, LOCAL_SERVER_PORT, strlen(safe_body), safe_body);
=======
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
	int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
=======
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		return;
	}
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
		LOCAL_SERVER_HOST, LOCAL_SERVER_PORT, strlen(safe_body), safe_body);
=======
		ETL_BACKEND_HOST, ETL_BACKEND_PORT, strlen(safe_body), safe_body);
	send(sfd, request, strlen(request), 0);
	free(request);
	close(sfd);
}

 void get_from_local(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
	if (sfd < 0) {
		printf("get_from_local: failed to connect to local server\n");
=======
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
		return;
	}
	size_t req_size = strlen(route) + 512;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
=======
		send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
		return;
	}

	snprintf(request, req_size,
		"GET %s HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Connection: close\r\n"
		"\r\n",
		route,
		LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
	
	send(sfd, request, strlen(request), 0);
	free(request);
	char buf[8192]; 
    char *response = NULL;
    size_t total = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved <= 0)
            break;
=======
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
=======
            close(sfd);
            send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
            return;
        }
			response = tmp;
			memcpy(response + total, buf, bytes_recved);
			total += bytes_recved;
		}
		if (!response) {
			printf("No data received\n");
			return;
		}

		response[total] = '\0'; 
=======
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
		} else {
			char *status_line_end = strstr(response, "\r\n");
			int is_redirect = 0;
			if (status_line_end) {
				if (strstr(response, "HTTP/1.1 302") || strstr(response, "HTTP/1.0 302")) {
					is_redirect = 1;
				}
			}
			if (is_redirect) {
				char *location = strstr(response, "Location: ");
				if (location) {
					location += strlen("Location: ");
					char *location_end = strstr(location, "\r\n");
					if (location_end) {
						size_t location_len = location_end - location;
						char location_value[2048];
						if (location_len >= sizeof(location_value)) {
							location_len = sizeof(location_value) - 1;
						}
						strncpy(location_value, location, location_len);
						location_value[location_len] = '\0';

						char redirect_header[4096];
						snprintf(redirect_header, sizeof(redirect_header),
							"HTTP/1.1 302 Found\r\n"
=======
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
							location_value);
						SSL_write(socket->cSSL, redirect_header, strlen(redirect_header));
					}
				}
			} else {
				char *res_body = header_end + 4;
				send_JSON_response_code(socket->cSSL, 200, res_body);
=======
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

void post_run_activity(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
	if (sfd < 0) {
		printf("post_run_activity: failed to connect to local server\n");
=======
	int sfd  = connect_to_local_server(ETL_BACKEND_HOST, ETL_BACKEND_PORT);
	if (sfd < 0) {
		send_JSON_response_code(socket->cSSL, 502, "{\"error\":\"backend unavailable\"}");
		return;
	}
	const char *safe_body = body ? body : "";
	size_t req_size = strlen(safe_body) + 2048;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
=======
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
		LOCAL_SERVER_HOST, LOCAL_SERVER_PORT, strlen(safe_body), safe_body);
=======
		ETL_BACKEND_HOST, ETL_BACKEND_PORT, strlen(safe_body), safe_body);

	send(sfd, request, strlen(request), 0);
	free(request);

	/* For non-preview /etl/run/ calls, return 200 immediately so the UI doesn't block on
	 * long Spark jobs. The client polls /etl/pipeline/runs for status. */
	int is_etl_run = (strcmp(route, "/etl/run/") == 0) || (strcmp(route, "/etl/run") == 0);
	if (is_etl_run && !body_has_preview_true(safe_body)) {
		char response_body[] = "{\"status\":\"accepted\"}";
		send_JSON_response_code(socket->cSSL, 200, response_body);
		close(sfd);
		return;
	}

    char buf[8192]; 
=======
	/* Non-preview /etl/run posts trigger long-running pipelines. The Python
	   backend now returns the run_id eagerly (see L1 /etl/run/ handler), but
	   we still don't want to keep this connection open for the entire job;
	   read the headers + first body chunk so we capture the run_id, then
	   forward what we have and let Python finish in a background thread. */
	int short_circuit = (strstr(route, "/etl/run") != NULL
		&& strstr(safe_body, "\"preview\":true") == NULL);

    char buf[8192];
    char *response = NULL;
    size_t total = 0;
    int recv_error = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved <= 0)
            break;
=======
        if (bytes_recved == 0) break;
        if (bytes_recved < 0) { perror("recv"); recv_error = 1; break; }
        char *tmp = realloc(response, total + bytes_recved + 1);
        if (!tmp) {
            perror("realloc");
            free(response);
=======
            close(sfd);
            send_JSON_response_code(socket->cSSL, 500, "{\"error\":\"out of memory\"}");
            return;
        }
			response = tmp;
			memcpy(response + total, buf, bytes_recved);
			total += bytes_recved;
		}
		if (!response) {
			printf("No data received\n");
			return;
		}
=======

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
