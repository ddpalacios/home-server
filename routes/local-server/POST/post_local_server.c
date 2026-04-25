
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
#include <unistd.h>
#define IPSTRLEN INET6_ADDRSTRLEN

#define LOCAL_SERVER_HOST "127.0.0.1"
#define LOCAL_SERVER_PORT "5000"

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
        return;
    }
    char request[2048];
    snprintf(request, sizeof(request),
            "POST /CTA/ctabustracker/getpredictions/run HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "Connection: close\r\n"
            "\r\n",
            LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
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
    send(sfd,request, strlen(request),0);
    free(request);
    close(sfd);
 }

 
void post_to_local(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
	if (sfd < 0) {
		printf("post_to_local: failed to connect to local server\n");
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

void post_to_local_no_reply(const char* route, const char* body){
	int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
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
	send(sfd, request, strlen(request), 0);
	free(request);
	close(sfd);
}

 void get_from_local(struct Socket* socket,char* http_header, char*body, char* route){
	int sfd  = connect_to_local_server(LOCAL_SERVER_HOST, LOCAL_SERVER_PORT);
	if (sfd < 0) {
		printf("get_from_local: failed to connect to local server\n");
		return;
	}
	size_t req_size = strlen(route) + 512;
	char *request = malloc(req_size);
	if (!request) {
		perror("malloc failed");
		close(sfd);
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
