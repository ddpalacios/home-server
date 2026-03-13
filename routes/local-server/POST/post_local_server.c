
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
