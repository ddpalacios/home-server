
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
#define IPSTRLEN INET6_ADDRSTRLEN
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

 
void post_to_local(struct Socket* socket,char* http_header, char*body, char* route, const char* port){
	int sfd  = connect_to_local_server("127.0.0.1", port);
	if (sfd < 0) {
		send_response_code(socket->cSSL, 502);
		return;
	}
	const char *safe_body = body ? body : "";

	/* Forward incoming Cookie + Host so the upstream Flask sees the user's
	 * session and the original public host (for redirect URI building). */
	char *cookie_value = NULL;
	char *fwd_host = NULL;
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
				fwd_host = malloc(len + 1);
				if (fwd_host) {
					memcpy(fwd_host, host_start, len);
					fwd_host[len] = '\0';
				}
			}
		}
	}

	size_t req_size = strlen(safe_body) + 2048
		+ (cookie_value ? strlen(cookie_value) : 0)
		+ (fwd_host ? strlen(fwd_host) : 0);
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		if (cookie_value) free(cookie_value);
		if (fwd_host) free(fwd_host);
		close(sfd);
		return;
	}

	if (cookie_value && fwd_host) {
		snprintf(request, req_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"X-Forwarded-Host: %s\r\n"
			"X-Forwarded-Proto: https\r\n"
			"Content-Type: application/json\r\n"
			"Content-Length: %zu\r\n"
			"Cookie: %s\r\n"
			"Connection: close\r\n"
			"\r\n"
			"%s",
			route, "127.0.0.1", port, fwd_host, strlen(safe_body), cookie_value, safe_body);
	} else if (fwd_host) {
		snprintf(request, req_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"X-Forwarded-Host: %s\r\n"
			"X-Forwarded-Proto: https\r\n"
			"Content-Type: application/json\r\n"
			"Content-Length: %zu\r\n"
			"Connection: close\r\n"
			"\r\n"
			"%s",
			route, "127.0.0.1", port, fwd_host, strlen(safe_body), safe_body);
	} else if (cookie_value) {
		snprintf(request, req_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"Content-Type: application/json\r\n"
			"Content-Length: %zu\r\n"
			"Cookie: %s\r\n"
			"Connection: close\r\n"
			"\r\n"
			"%s",
			route, "127.0.0.1", port, strlen(safe_body), cookie_value, safe_body);
	} else {
		snprintf(request, req_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"Content-Type: application/json\r\n"
			"Content-Length: %zu\r\n"
			"Connection: close\r\n"
			"\r\n"
			"%s",
			route, "127.0.0.1", port, strlen(safe_body), safe_body);
	}
	if (cookie_value) free(cookie_value);
	if (fwd_host) free(fwd_host);
	
	send(sfd, request, strlen(request), 0);
	free(request);
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

void delete_to_local(struct Socket* socket,char* http_header, char*body, char* route, const char* port){
	int sfd  = connect_to_local_server("127.0.0.1", port);
	if (sfd < 0) {
		send_response_code(socket->cSSL, 502);
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
		"DELETE %s HTTP/1.1\r\n"
		"Host: %s:%s\r\n"
		"Content-Type: application/json\r\n"
		"Content-Length: %zu\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		route,
		"127.0.0.1", port, strlen(safe_body), safe_body);
	
	send(sfd, request, strlen(request), 0);
	free(request);
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
			close(sfd);
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
