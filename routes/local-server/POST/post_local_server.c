
#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include "send_message.h"
#include <arpa/inet.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "Socket.h"
#include "json_utilities.h"
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#include <sys/time.h>
#define IPSTRLEN INET6_ADDRSTRLEN
/* OpenAI/Anthropic full-post previews and AI batch generations can run
 * 60-120s on the upstream side. The proxy used to give up at 30s and
 * surface a 502/503 to the browser even though Flask was still working;
 * 180s here matches the 120s OpenAI ceiling with headroom for retries. */
#define LOCAL_RECV_TIMEOUT_SEC 180
#define LOCAL_SEND_TIMEOUT_SEC 10
#define MAX_LOCAL_RESPONSE (50 * 1024 * 1024)
int connect_to_local_server(const char* host, const char* port){
	struct addrinfo hints;
 	struct addrinfo *addrs_res;
 	memset(&hints, 0, sizeof(hints));
 	char ipstr[IPSTRLEN];
 	hints.ai_family = AF_INET;
 	hints.ai_socktype = SOCK_STREAM;
 	hints.ai_protocol = IPPROTO_TCP;
 	const int status = getaddrinfo(host, port, &hints, &addrs_res);
 	int sfd, connected;
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
			printf("Error connecting to socket with host: '%s' at '%s'\n", host, ipstr);
			break;
		}
		connected = connect(sfd, addr->ai_addr, addr->ai_addrlen);
		if (connected == 0){
			printf("Successfully connected to '%s'\n", host);
			break;
		}else{
			printf("Error connecting to host: '%s' at '%s'\n",host, ipstr);
			break;
		}
	}
	freeaddrinfo(addrs_res);
 	if (sfd>=0 && connected==0){
        return sfd;
 	}
	return -1;
 }

void post_ctabustracker_getpredictions(struct Socket* socket,char* http_header, char*body, char* route){
    int sfd  = connect_to_local_server("127.0.0.1", "5000");
    char request[2048];
    snprintf(request, sizeof(request), 
            "POST /CTA/ctabustracker/getpredictions/run HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "Connection: close\r\n"
            "\r\n",
            "127.0.0.1","5000");
    send(sfd,request, strlen(request),0);
    close(sfd);


 }

void post_generate_phrase(struct Socket* socket,char* http_header, char*body, char* route){
    int sfd  = connect_to_local_server("127.0.0.1", "5000");
    char request[2048];
	snprintf(request, sizeof(request),
		"POST /phrase-matching/generate HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Content-Type: application/json\r\n"
		"Content-Length: %zu\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		"127.0.0.1", "5000", strlen(body), body);
	printf("Request %s\n", request);
    send(sfd,request, strlen(request),0);
    close(sfd);
 }

 
void post_to_local(struct Socket* socket,char* http_header, char*body, size_t body_len, char* route, const char* port){
	int sfd  = connect_to_local_server("127.0.0.1", port);
	if (sfd < 0) {
		send_response_code(socket->cSSL, 502);
		return;
	}
	struct timeval tv_recv = { .tv_sec = LOCAL_RECV_TIMEOUT_SEC, .tv_usec = 0 };
	struct timeval tv_send = { .tv_sec = LOCAL_SEND_TIMEOUT_SEC, .tv_usec = 0 };
	setsockopt(sfd, SOL_SOCKET, SO_RCVTIMEO, &tv_recv, sizeof(tv_recv));
	setsockopt(sfd, SOL_SOCKET, SO_SNDTIMEO, &tv_send, sizeof(tv_send));
	const char *safe_body = body ? body : "";
	if (!body) body_len = 0;

	/* Forward incoming Cookie header so the upstream Flask session is
	 * preserved (admin endpoints gate on session["user_email"]). */
	char *cookie_value = NULL;
	char *content_type_value = NULL;
	char *fwd_host_value = NULL;
	char *hub_sig_value = NULL;  /* X-Hub-Signature-256 — Meta webhook HMAC */
	if (http_header) {
		const char *cookie_start = strstr(http_header, "\r\nCookie:");
		if (!cookie_start && strncmp(http_header, "Cookie:", 7) == 0) {
			cookie_start = http_header;
		}
		if (cookie_start) {
			cookie_start += (cookie_start == http_header) ? 7 : 9;
			while (*cookie_start == ' ') cookie_start++;
			const char *cookie_end = strstr(cookie_start, "\r\n");
			if (cookie_end && cookie_end > cookie_start) {
				size_t len = (size_t)(cookie_end - cookie_start);
				cookie_value = malloc(len + 1);
				if (cookie_value) {
					memcpy(cookie_value, cookie_start, len);
					cookie_value[len] = '\0';
				}
			}
		}

		/* Forward the Meta webhook signature header — Flask uses this
		 * to verify HMAC of the body against the app secret. Without
		 * this forward, every webhook delivery 401s as invalid_signature. */
		const char *sig_start = strstr(http_header, "\r\nX-Hub-Signature-256:");
		if (!sig_start && strncasecmp(http_header, "X-Hub-Signature-256:", 20) == 0) {
			sig_start = http_header;
		}
		if (sig_start) {
			sig_start += (sig_start == http_header) ? 20 : 22;
			while (*sig_start == ' ') sig_start++;
			const char *sig_end = strstr(sig_start, "\r\n");
			if (sig_end && sig_end > sig_start) {
				size_t len = (size_t)(sig_end - sig_start);
				hub_sig_value = malloc(len + 1);
				if (hub_sig_value) {
					memcpy(hub_sig_value, sig_start, len);
					hub_sig_value[len] = '\0';
				}
			}
		}

		/* Forward incoming Content-Type so form-urlencoded posts (e.g.
		 * Twilio webhooks) reach Flask intact. Default to JSON when absent
		 * — preserves the previous behavior for our internal POSTs. */
		const char *ct_start = strstr(http_header, "\r\nContent-Type:");
		if (!ct_start && strncmp(http_header, "Content-Type:", 13) == 0) {
			ct_start = http_header;
		}
		if (ct_start) {
			ct_start += (ct_start == http_header) ? 13 : 15;
			while (*ct_start == ' ') ct_start++;
			const char *ct_end = strstr(ct_start, "\r\n");
			if (ct_end && ct_end > ct_start) {
				size_t len = (size_t)(ct_end - ct_start);
				content_type_value = malloc(len + 1);
				if (content_type_value) {
					memcpy(content_type_value, ct_start, len);
					content_type_value[len] = '\0';
				}
			}
		}

		/* Forward the public-facing host so Flask can build callback URLs
		 * that Twilio (and other clients) can actually reach. Preference:
		 *   1. Incoming X-Forwarded-Host (set by an upstream proxy like
		 *      ngrok or cloudflared — this is the *original* public host).
		 *   2. Otherwise the local Host header.
		 */
		const char *xfh_start = strstr(http_header, "\r\nX-Forwarded-Host:");
		if (!xfh_start && strncasecmp(http_header, "X-Forwarded-Host:", 17) == 0) {
			xfh_start = http_header;
		}
		if (xfh_start) {
			xfh_start += (xfh_start == http_header) ? 17 : 19;
			while (*xfh_start == ' ') xfh_start++;
			const char *xfh_end = strstr(xfh_start, "\r\n");
			if (xfh_end && xfh_end > xfh_start) {
				size_t len = (size_t)(xfh_end - xfh_start);
				fwd_host_value = malloc(len + 1);
				if (fwd_host_value) {
					memcpy(fwd_host_value, xfh_start, len);
					fwd_host_value[len] = '\0';
				}
			}
		}
		if (!fwd_host_value) {
			const char *host_start = strstr(http_header, "\r\nHost:");
			if (!host_start && strncmp(http_header, "Host:", 5) == 0) {
				host_start = http_header;
			}
			if (host_start) {
				host_start += (host_start == http_header) ? 5 : 7;
				while (*host_start == ' ') host_start++;
				const char *host_end = strstr(host_start, "\r\n");
				if (host_end && host_end > host_start) {
					size_t len = (size_t)(host_end - host_start);
					fwd_host_value = malloc(len + 1);
					if (fwd_host_value) {
						memcpy(fwd_host_value, host_start, len);
						fwd_host_value[len] = '\0';
					}
				}
			}
		}
	}

	const char *content_type = content_type_value ? content_type_value : "application/json";

	char fwd_host_line[512];
	fwd_host_line[0] = '\0';
	if (fwd_host_value) {
		snprintf(fwd_host_line, sizeof(fwd_host_line),
			"X-Forwarded-Host: %s\r\nX-Forwarded-Proto: https\r\n",
			fwd_host_value);
	}

	/* If the upstream request carries an X-Hub-Signature-256 header
	 * (Meta webhook HMAC), forward it intact. Computed against the
	 * raw body — must arrive at Flask byte-identical or verification
	 * fails with 401 invalid_signature. */
	char hub_sig_line[1024];
	hub_sig_line[0] = '\0';
	if (hub_sig_value) {
		snprintf(hub_sig_line, sizeof(hub_sig_line),
			"X-Hub-Signature-256: %s\r\n", hub_sig_value);
	}

	/* Build the request HEADER as a string and send it, then send the
	 * body bytes via a separate send(). The body may contain null bytes
	 * (multipart binary uploads), so we cannot inline it via snprintf +
	 * strlen — that would truncate at the first \0 and produce a body
	 * shorter than Content-Length, hanging the upstream parser. */
	size_t header_size = 2048
		+ (cookie_value ? strlen(cookie_value) : 0)
		+ strlen(content_type)
		+ strlen(fwd_host_line)
		+ strlen(hub_sig_line)
		+ strlen(route);
	char *header_buf = malloc(header_size);
	if (!header_buf) {
		perror("malloc failed");
		if (cookie_value) free(cookie_value);
		if (content_type_value) free(content_type_value);
		if (fwd_host_value) free(fwd_host_value);
		if (hub_sig_value) free(hub_sig_value);
		close(sfd);
		return;
	}

	int header_written;
	if (cookie_value) {
		header_written = snprintf(header_buf, header_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"%s"
			"Content-Type: %s\r\n"
			"Content-Length: %zu\r\n"
			"Cookie: %s\r\n"
			"Connection: close\r\n"
			"\r\n",
			route,
			"127.0.0.1", port, fwd_host_line, hub_sig_line,
			content_type, body_len, cookie_value);
		free(cookie_value);
	} else {
		header_written = snprintf(header_buf, header_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"%s"
			"Content-Type: %s\r\n"
			"Content-Length: %zu\r\n"
			"Connection: close\r\n"
			"\r\n",
			route,
			"127.0.0.1", port, fwd_host_line, hub_sig_line,
			content_type, body_len);
	}
	if (content_type_value) free(content_type_value);
	if (fwd_host_value) free(fwd_host_value);
	if (hub_sig_value) free(hub_sig_value);

	if (header_written < 0 || (size_t)header_written >= header_size) {
		free(header_buf);
		close(sfd);
		send_response_code(socket->cSSL, 500);
		return;
	}
	send(sfd, header_buf, (size_t)header_written, 0);
	free(header_buf);
	if (body_len > 0) {
		size_t sent = 0;
		while (sent < body_len) {
			ssize_t n = send(sfd, safe_body + sent, body_len - sent, 0);
			if (n <= 0) break;
			sent += (size_t)n;
		}
	}
	char buf[8192];
    char *response = NULL;
    size_t total = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved <= 0)
            break;
        if (total + (size_t)bytes_recved > MAX_LOCAL_RESPONSE) {
            printf("post_to_local: upstream response too large, aborting\n");
            free(response);
            close(sfd);
            send_response_code(socket->cSSL, 502);
            return;
        }
        char *tmp = realloc(response, total + bytes_recved + 1);
        if (!tmp) {
            perror("realloc");
            free(response);
            close(sfd);
            return;
        }
			response = tmp;
			memcpy(response + total, buf, bytes_recved);
			total += bytes_recved;
		}
		if (!response) {
			printf("No data received\n");
			close(sfd);
			send_response_code(socket->cSSL, 502);
			return;
		}

		response[total] = '\0';

		/* Parse upstream status, Content-Type and body so the client sees
		 * the real values (admin endpoints return JSON with 200/202/400/
		 * 403/404/409/429 — forcing text/html and 200 broke them all). */
		int up_status = 200;
		if (sscanf(response, "HTTP/%*s %d", &up_status) != 1) {
			up_status = 200;
		}
		char *header_end = strstr(response, "\r\n\r\n");
		if (!header_end) {
			free(response);
			close(sfd);
			return;
		}
		size_t header_len = (size_t)(header_end - response);
		char *res_body = header_end + 4;
		size_t res_body_len = total - (size_t)(res_body - response);

		char *up_content_type = NULL;
		/* Forward Set-Cookie headers (Flask uses them to set the session
		 * cookie on /me/profile, /auth/*, /team/<aid>/auth, etc.). Without
		 * this, sessions set in any POST-handler endpoint never reach the
		 * browser and the user appears to "fail" auth even when the
		 * server accepted the password. */
		char **cookies = NULL;
		size_t cookie_count = 0;
		char *header_block = malloc(header_len + 1);
		if (header_block) {
			memcpy(header_block, response, header_len);
			header_block[header_len] = '\0';
			char *line = strtok(header_block, "\r\n");
			while (line) {
				if (strncasecmp(line, "Content-Type:", 13) == 0) {
					if (!up_content_type) {
						char *val = line + 13;
						while (*val == ' ') val++;
						up_content_type = strdup(val);
					}
				} else if (strncasecmp(line, "Set-Cookie:", 11) == 0) {
					char *val = line + 11;
					while (*val == ' ') val++;
					char **tmp = realloc(cookies, sizeof(char*) * (cookie_count + 1));
					if (tmp) {
						cookies = tmp;
						cookies[cookie_count++] = strdup(val);
					}
				}
				line = strtok(NULL, "\r\n");
			}
			free(header_block);
		}

		const char *ctype = up_content_type ? up_content_type : "application/json";
		const char *status_text = (up_status == 200) ? "OK" : get_code_message(up_status);
		char header_out[4096];
		int header_n = snprintf(header_out, sizeof(header_out),
			"HTTP/1.1 %d %s\r\n"
			"Content-Type: %s\r\n"
			"Cache-Control: no-cache, no-store, must-revalidate\r\n"
			"Access-Control-Allow-Origin: *\r\n"
			"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
			"Access-Control-Allow-Headers: Content-Type\r\n"
			"Connection: close\r\n",
			up_status, status_text, ctype);
		for (size_t i = 0; i < cookie_count; i++) {
			if (header_n < 0 || (size_t)header_n >= sizeof(header_out)) break;
			header_n += snprintf(header_out + header_n, sizeof(header_out) - header_n,
				"Set-Cookie: %s\r\n", cookies[i]);
			free(cookies[i]);
		}
		if (cookies) free(cookies);
		if (header_n > 0 && (size_t)header_n < sizeof(header_out)) {
			header_n += snprintf(header_out + header_n, sizeof(header_out) - header_n,
				"Content-Length: %zu\r\n\r\n", res_body_len);
		}
		SSL_write(socket->cSSL, header_out, header_n);
		if (res_body_len > 0) {
			SSL_write(socket->cSSL, res_body, res_body_len);
		}
		if (up_content_type) free(up_content_type);

    free(response);
    close(sfd);


 }

void delete_to_local(struct Socket* socket,char* http_header, char*body, char* route, const char* port){
	int sfd  = connect_to_local_server("127.0.0.1", port);
	if (sfd < 0) {
		send_response_code(socket->cSSL, 502);
		return;
	}
	struct timeval tv_recv = { .tv_sec = LOCAL_RECV_TIMEOUT_SEC, .tv_usec = 0 };
	struct timeval tv_send = { .tv_sec = LOCAL_SEND_TIMEOUT_SEC, .tv_usec = 0 };
	setsockopt(sfd, SOL_SOCKET, SO_RCVTIMEO, &tv_recv, sizeof(tv_recv));
	setsockopt(sfd, SOL_SOCKET, SO_SNDTIMEO, &tv_send, sizeof(tv_send));
	const char *safe_body = body ? body : "";

	/* Forward the incoming Cookie header so Flask can resolve the session.
	 * Without this the upstream sees no session and every authenticated
	 * DELETE comes back as 401 (e.g. /me/leads/imports/<id>). Mirrors
	 * post_to_local's cookie-passthrough logic. */
	char *cookie_value = NULL;
	char *fwd_host_value = NULL;
	if (http_header) {
		const char *cookie_start = strstr(http_header, "\r\nCookie:");
		if (!cookie_start && strncmp(http_header, "Cookie:", 7) == 0) {
			cookie_start = http_header;
		}
		if (cookie_start) {
			cookie_start += (cookie_start == http_header) ? 7 : 9;
			while (*cookie_start == ' ') cookie_start++;
			const char *cookie_end = strstr(cookie_start, "\r\n");
			if (cookie_end && cookie_end > cookie_start) {
				size_t len = (size_t)(cookie_end - cookie_start);
				cookie_value = malloc(len + 1);
				if (cookie_value) {
					memcpy(cookie_value, cookie_start, len);
					cookie_value[len] = '\0';
				}
			}
		}
		const char *xfh_start = strstr(http_header, "\r\nX-Forwarded-Host:");
		if (!xfh_start && strncasecmp(http_header, "X-Forwarded-Host:", 17) == 0) {
			xfh_start = http_header;
		}
		if (xfh_start) {
			xfh_start += (xfh_start == http_header) ? 17 : 19;
			while (*xfh_start == ' ') xfh_start++;
			const char *xfh_end = strstr(xfh_start, "\r\n");
			if (xfh_end && xfh_end > xfh_start) {
				size_t len = (size_t)(xfh_end - xfh_start);
				fwd_host_value = malloc(len + 1);
				if (fwd_host_value) {
					memcpy(fwd_host_value, xfh_start, len);
					fwd_host_value[len] = '\0';
				}
			}
		}
		if (!fwd_host_value) {
			const char *host_start = strstr(http_header, "\r\nHost:");
			if (!host_start && strncmp(http_header, "Host:", 5) == 0) {
				host_start = http_header;
			}
			if (host_start) {
				host_start += (host_start == http_header) ? 5 : 7;
				while (*host_start == ' ') host_start++;
				const char *host_end = strstr(host_start, "\r\n");
				if (host_end && host_end > host_start) {
					size_t len = (size_t)(host_end - host_start);
					fwd_host_value = malloc(len + 1);
					if (fwd_host_value) {
						memcpy(fwd_host_value, host_start, len);
						fwd_host_value[len] = '\0';
					}
				}
			}
		}
	}

	char fwd_host_line[512];
	fwd_host_line[0] = '\0';
	if (fwd_host_value) {
		snprintf(fwd_host_line, sizeof(fwd_host_line),
			"X-Forwarded-Host: %s\r\nX-Forwarded-Proto: https\r\n",
			fwd_host_value);
	}

	size_t req_size = strlen(safe_body) + 2048
		+ (cookie_value ? strlen(cookie_value) : 0)
		+ strlen(fwd_host_line);
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		if (cookie_value) free(cookie_value);
		if (fwd_host_value) free(fwd_host_value);
		close(sfd);
		return;
	}

	if (cookie_value) {
		snprintf(request, req_size,
			"DELETE %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"Content-Type: application/json\r\n"
			"Content-Length: %zu\r\n"
			"Cookie: %s\r\n"
			"Connection: close\r\n"
			"\r\n"
			"%s",
			route,
			"127.0.0.1", port, fwd_host_line, strlen(safe_body), cookie_value, safe_body);
		free(cookie_value);
	} else {
		snprintf(request, req_size,
			"DELETE %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"Content-Type: application/json\r\n"
			"Content-Length: %zu\r\n"
			"Connection: close\r\n"
			"\r\n"
			"%s",
			route,
			"127.0.0.1", port, fwd_host_line, strlen(safe_body), safe_body);
	}
	if (fwd_host_value) free(fwd_host_value);

	send(sfd, request, strlen(request), 0);
	free(request);
	char buf[8192];
    char *response = NULL;
    size_t total = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved <= 0)
            break;
        if (total + (size_t)bytes_recved > MAX_LOCAL_RESPONSE) {
            printf("delete_to_local: upstream response too large, aborting\n");
            free(response);
            close(sfd);
            send_response_code(socket->cSSL, 502);
            return;
        }
        char *tmp = realloc(response, total + bytes_recved + 1);
        if (!tmp) {
            perror("realloc");
            free(response);
			close(sfd);
            return;
        }
			response = tmp;
			memcpy(response + total, buf, bytes_recved);
			total += bytes_recved;
		}
		if (!response) {
			printf("No data received\n");
			close(sfd);
			send_response_code(socket->cSSL, 502);
			return;
		}

		response[total] = '\0';
		printf("Total bytes received: %zu\n", total);

		char *header_end = NULL;
		for (size_t i = 0; i + 3 < total; i++) {
			if (response[i] == '\r' && response[i + 1] == '\n'
				&& response[i + 2] == '\r' && response[i + 3] == '\n') {
				header_end = response + i + 4;
				break;
			}
		}
		if (!header_end) {
			printf("No HTTP header terminator found\n");
			free(response);
			close(sfd);
			return;
		}

		size_t header_len = (size_t)(header_end - response);
		size_t body_len = total - header_len;

		char *header_str = malloc(header_len + 1);
		if (!header_str) {
			perror("malloc");
			free(response);
			close(sfd);
			return;
		}
		memcpy(header_str, response, header_len);
		header_str[header_len] = '\0';

		int status_code = 200;
		if (sscanf(header_str, "HTTP/%*s %d", &status_code) != 1) {
			status_code = 200;
		}

		long content_length = -1;
		char *cl_start = strstr(header_str, "Content-Length:");
		if (cl_start) {
			cl_start += strlen("Content-Length:");
			while (*cl_start == ' ') {
				cl_start++;
			}
			content_length = strtol(cl_start, NULL, 10);
		}

		char content_type[128];
		snprintf(content_type, sizeof(content_type), "application/octet-stream");
		char *ct_start = strstr(header_str, "Content-Type:");
		if (ct_start) {
			ct_start += strlen("Content-Type:");
			while (*ct_start == ' ') {
				ct_start++;
			}
			char *ct_end = strstr(ct_start, "\r\n");
			if (ct_end && ct_end > ct_start) {
				size_t ct_len = (size_t)(ct_end - ct_start);
				if (ct_len >= sizeof(content_type)) {
					ct_len = sizeof(content_type) - 1;
				}
				memcpy(content_type, ct_start, ct_len);
				content_type[ct_len] = '\0';
			}
		}

		size_t send_len = body_len;
		if (content_length >= 0 && (size_t)content_length <= body_len) {
			send_len = (size_t)content_length;
		}

		const char *status_text = (status_code == 200) ? "OK" : get_code_message(status_code);
		char out_header[2048];
		snprintf(out_header, sizeof(out_header),
			"HTTP/1.1 %d %s\r\n"
			"Content-Type: %s\r\n"
			"Access-Control-Allow-Origin: *\r\n"
			"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
			"Access-Control-Allow-Headers: Content-Type\r\n"
			"Connection: close\r\n"
			"Content-Length: %zu\r\n"
			"\r\n",
			status_code, status_text, content_type, send_len);
		SSL_write(socket->cSSL, out_header, strlen(out_header));
		if (send_len > 0) {
			SSL_write(socket->cSSL, header_end, send_len);
		}

		free(header_str);

    free(response);
    close(sfd);
 }



void post_run_activity(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server("127.0.0.1", "5000");
	size_t req_size = strlen(body) + 2048;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
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
		"127.0.0.1", "5000", strlen(body), body);
	
	send(sfd, request, strlen(request), 0);
	free(request);

	/* If this is a non-preview /etl/run call, return immediately to avoid blocking the UI. */
	if (strstr(route, "/etl/run") != NULL && strstr(body, "\"preview\":true") == NULL) {
		char response_body[] = "{\"status\":\"accepted\"}";
		send_JSON_response_code(socket->cSSL, 200, response_body);
		close(sfd);
		return;
	}

    char buf[8192]; 
    char *response = NULL;
    size_t total = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved <= 0)
            break;
        char *tmp = realloc(response, total + bytes_recved + 1);
        if (!tmp) {
            perror("realloc");
            free(response);
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
		printf("Total bytes received: %zu\n", total);

		char *res_body = strstr(response, "\r\n\r\n");
		if (res_body) {
			res_body += 4;
			size_t body_len = strlen(res_body);
			send_html_response_code(socket->cSSL, 200, body_len);
			SSL_write(socket->cSSL, res_body, body_len);
		} else {
			printf("No HTTP body found\n");
		}

    free(response);
    close(sfd);

 }



/* ─── Streaming passthrough variant ──────────────────────────────────
 * For SSE / chunked endpoints (e.g. /team/.../chat-stream). The
 * regular post_to_local buffers the entire upstream response into
 * memory before writing anything to the client — that collapses
 * SSE token streams into a single batched response, defeating the
 * whole point of streaming.
 *
 * This variant: build the upstream request the same way, then on
 * the response side read until we have the full HTTP header block
 * (`\r\n\r\n`), forward those headers verbatim to the client, and
 * after that loop recv->SSL_write so each upstream byte reaches the
 * browser immediately. */
void post_to_local_stream(struct Socket* socket, char* http_header,
                           char* body, size_t body_len,
                           char* route, const char* port){
	int sfd  = connect_to_local_server("127.0.0.1", port);
	if (sfd < 0) {
		send_response_code(socket->cSSL, 502);
		return;
	}
	struct timeval tv_recv = { .tv_sec = LOCAL_RECV_TIMEOUT_SEC, .tv_usec = 0 };
	struct timeval tv_send = { .tv_sec = LOCAL_SEND_TIMEOUT_SEC, .tv_usec = 0 };
	setsockopt(sfd, SOL_SOCKET, SO_RCVTIMEO, &tv_recv, sizeof(tv_recv));
	setsockopt(sfd, SOL_SOCKET, SO_SNDTIMEO, &tv_send, sizeof(tv_send));

	const char *safe_body = body ? body : "";
	if (!body) body_len = 0;

	char *cookie_value = NULL;
	char *content_type_value = NULL;
	char *fwd_host_value = NULL;
	if (http_header) {
		const char *cookie_start = strstr(http_header, "\r\nCookie:");
		if (!cookie_start && strncmp(http_header, "Cookie:", 7) == 0) {
			cookie_start = http_header;
		}
		if (cookie_start) {
			cookie_start += (cookie_start == http_header) ? 7 : 9;
			while (*cookie_start == ' ') cookie_start++;
			const char *cookie_end = strstr(cookie_start, "\r\n");
			if (cookie_end && cookie_end > cookie_start) {
				size_t len = (size_t)(cookie_end - cookie_start);
				cookie_value = malloc(len + 1);
				if (cookie_value) {
					memcpy(cookie_value, cookie_start, len);
					cookie_value[len] = '\0';
				}
			}
		}
		const char *ct_start = strstr(http_header, "\r\nContent-Type:");
		if (!ct_start && strncmp(http_header, "Content-Type:", 13) == 0) {
			ct_start = http_header;
		}
		if (ct_start) {
			ct_start += (ct_start == http_header) ? 13 : 15;
			while (*ct_start == ' ') ct_start++;
			const char *ct_end = strstr(ct_start, "\r\n");
			if (ct_end && ct_end > ct_start) {
				size_t len = (size_t)(ct_end - ct_start);
				content_type_value = malloc(len + 1);
				if (content_type_value) {
					memcpy(content_type_value, ct_start, len);
					content_type_value[len] = '\0';
				}
			}
		}
		const char *xfh_start = strstr(http_header, "\r\nX-Forwarded-Host:");
		if (!xfh_start && strncasecmp(http_header, "X-Forwarded-Host:", 17) == 0) {
			xfh_start = http_header;
		}
		if (xfh_start) {
			xfh_start += (xfh_start == http_header) ? 17 : 19;
			while (*xfh_start == ' ') xfh_start++;
			const char *xfh_end = strstr(xfh_start, "\r\n");
			if (xfh_end && xfh_end > xfh_start) {
				size_t len = (size_t)(xfh_end - xfh_start);
				fwd_host_value = malloc(len + 1);
				if (fwd_host_value) {
					memcpy(fwd_host_value, xfh_start, len);
					fwd_host_value[len] = '\0';
				}
			}
		}
		if (!fwd_host_value) {
			const char *host_start = strstr(http_header, "\r\nHost:");
			if (!host_start && strncmp(http_header, "Host:", 5) == 0) {
				host_start = http_header;
			}
			if (host_start) {
				host_start += (host_start == http_header) ? 5 : 7;
				while (*host_start == ' ') host_start++;
				const char *host_end = strstr(host_start, "\r\n");
				if (host_end && host_end > host_start) {
					size_t len = (size_t)(host_end - host_start);
					fwd_host_value = malloc(len + 1);
					if (fwd_host_value) {
						memcpy(fwd_host_value, host_start, len);
						fwd_host_value[len] = '\0';
					}
				}
			}
		}
	}

	const char *content_type = content_type_value ? content_type_value : "application/json";
	char fwd_host_line[512];
	fwd_host_line[0] = '\0';
	if (fwd_host_value) {
		snprintf(fwd_host_line, sizeof(fwd_host_line),
			"X-Forwarded-Host: %s\r\nX-Forwarded-Proto: https\r\n",
			fwd_host_value);
	}

	size_t header_size = 2048
		+ (cookie_value ? strlen(cookie_value) : 0)
		+ strlen(content_type)
		+ strlen(fwd_host_line)
		+ strlen(route);
	char *header_buf = malloc(header_size);
	if (!header_buf) {
		if (cookie_value) free(cookie_value);
		if (content_type_value) free(content_type_value);
		if (fwd_host_value) free(fwd_host_value);
		close(sfd);
		send_response_code(socket->cSSL, 500);
		return;
	}
	int header_written;
	if (cookie_value) {
		header_written = snprintf(header_buf, header_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"Content-Type: %s\r\n"
			"Content-Length: %zu\r\n"
			"Cookie: %s\r\n"
			"Connection: close\r\n"
			"\r\n",
			route, "127.0.0.1", port, fwd_host_line,
			content_type, body_len, cookie_value);
		free(cookie_value);
	} else {
		header_written = snprintf(header_buf, header_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"Content-Type: %s\r\n"
			"Content-Length: %zu\r\n"
			"Connection: close\r\n"
			"\r\n",
			route, "127.0.0.1", port, fwd_host_line,
			content_type, body_len);
	}
	if (content_type_value) free(content_type_value);
	if (fwd_host_value) free(fwd_host_value);

	if (header_written < 0 || (size_t)header_written >= header_size) {
		free(header_buf);
		close(sfd);
		send_response_code(socket->cSSL, 500);
		return;
	}
	send(sfd, header_buf, (size_t)header_written, 0);
	free(header_buf);
	if (body_len > 0) {
		size_t sent = 0;
		while (sent < body_len) {
			ssize_t n = send(sfd, safe_body + sent, body_len - sent, 0);
			if (n <= 0) break;
			sent += (size_t)n;
		}
	}

	/* Streaming response forwarding. Read until we have the full
	 * upstream header block, forward it verbatim to the client, then
	 * loop recv->SSL_write so every chunk reaches the browser the
	 * instant it arrives. */
	#define HDR_MAX 16384
	char hdr_buf[HDR_MAX];
	size_t hdr_total = 0;
	char *header_terminator = NULL;
	while (hdr_total < HDR_MAX - 1) {
		ssize_t n = recv(sfd, hdr_buf + hdr_total, HDR_MAX - 1 - hdr_total, 0);
		if (n <= 0) break;
		hdr_total += (size_t)n;
		hdr_buf[hdr_total] = '\0';
		header_terminator = strstr(hdr_buf, "\r\n\r\n");
		if (header_terminator) break;
	}
	if (!header_terminator) {
		printf("post_to_local_stream: upstream gave no complete headers (got %zu bytes)\n", hdr_total);
		close(sfd);
		send_response_code(socket->cSSL, 502);
		return;
	}
	size_t hdr_len = (size_t)(header_terminator - hdr_buf) + 4;
	{
		size_t written = 0;
		while (written < hdr_len) {
			int n = SSL_write(socket->cSSL, hdr_buf + written,
			                  (int)(hdr_len - written));
			if (n <= 0) { close(sfd); return; }
			written += (size_t)n;
		}
	}
	if (hdr_total > hdr_len) {
		size_t leftover = hdr_total - hdr_len;
		size_t written = 0;
		while (written < leftover) {
			int n = SSL_write(socket->cSSL,
			                  hdr_buf + hdr_len + written,
			                  (int)(leftover - written));
			if (n <= 0) { close(sfd); return; }
			written += (size_t)n;
		}
	}
	char chunk_buf[4096];
	for (;;) {
		ssize_t n = recv(sfd, chunk_buf, sizeof(chunk_buf), 0);
		if (n <= 0) break;
		size_t written = 0;
		while (written < (size_t)n) {
			int w = SSL_write(socket->cSSL, chunk_buf + written,
			                  (int)((size_t)n - written));
			if (w <= 0) { close(sfd); return; }
			written += (size_t)w;
		}
	}
	close(sfd);
}
