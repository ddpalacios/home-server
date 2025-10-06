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
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#define IPSTRLEN INET6_ADDRSTRLEN
void connect_to_server(const char* host, const char* port, char*body){
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
		char request[2048];
		snprintf(request, sizeof(request), 
				"POST /blob-storage/email HTTP/1.1\r\n"
				"Host: %s:%s\r\n"
				"Content-Type: application/json\r\n"
            	"Content-Length: %ld\r\n"
				"Connection: close\r\n"
				"\r\n"
             	"%s",
				host,port, strlen(body), body);

		send(sfd,request, strlen(request),0);
 	}
 }

void post_blob(struct Socket* socket,char* http_header, char*body, char* route, int fd_count){
	SSL* cSSL = socket->cSSL;
	char path[2048];
	char write_path[2048];

	if (strstr(route, "/blob-storage/email")){
		connect_to_server("127.0.0.1", "5000", body);
		snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/bronze_portfolio_appointments.json");
		snprintf(path, sizeof(path),"blob-storage/bronze_portfolio_appointments.json");

	}else{
		char* rt = get_query_parameter(route, "rt");
		snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/bronze_CTA_ctabustracker_%s_predictions.json", rt);
		snprintf(path, sizeof(path),"blob-storage/bronze_CTA_ctabustracker_%s_predictions.json", rt);
	}
	
	char* frame_json = get_file_buffer(path);

	if (frame_json == NULL){
		FILE *file = fopen(write_path, "w");
		if (!file) {
			perror("Failed to open file");
			send_response_code(cSSL, 500);
			return;
		}

		if (fputs(body, file) == EOF) {
			perror("Failed to write to file");
			fclose(file);
			return;
		}
		fclose(file);
		send_response_code(cSSL, 200);
	}else{
		cJSON* root = cJSON_Parse(frame_json);
		cJSON* old_values = cJSON_GetObjectItem(root, "values");
		cJSON *json = cJSON_Parse(body);
		cJSON* new_values = cJSON_GetObjectItem(json, "values");
		for (int i = 0 ; i < cJSON_GetArraySize(new_values) ; i++){
			cJSON *subitem = cJSON_GetArrayItem(new_values, i);
			cJSON_AddItemToArray(old_values, subitem);
			}

		FILE *file = fopen(write_path, "w");
		char *r = cJSON_Print(root);
		if (!file) {
			perror("Failed to open file");
			send_response_code(cSSL, 500);
			return;
		}

		if (fputs(r, file) == EOF) {
			perror("Failed to write to file");
			send_response_code(cSSL, 500);
			fclose(file);
			return;
		}

		fclose(file);

		free(r);
		cJSON_Delete(root);
		send_response_code(cSSL, 200);

	}
}
