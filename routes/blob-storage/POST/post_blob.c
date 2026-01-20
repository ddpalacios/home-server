#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include "send_message.h"
#include <arpa/inet.h>
#include <stdlib.h>
#include <stdio.h>
#include <dirent.h>
#include "http_utilities.h"
#include "session.h"
#include "Socket.h"
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <sys/stat.h>
#include <errno.h>
#define IPSTRLEN INET6_ADDRSTRLEN

static int ensure_dir(const char *dir_path){
	char tmp[2048];
	if (!dir_path || !dir_path[0]){
		return -1;
	}
	snprintf(tmp, sizeof(tmp), "%s", dir_path);
	for (char *p = tmp + 1; *p; p++){
		if (*p == '/'){
			*p = '\0';
			if (mkdir(tmp, 0755) != 0 && errno != EEXIST){
				return -1;
			}
			*p = '/';
		}
	}
	if (mkdir(tmp, 0755) != 0 && errno != EEXIST){
		return -1;
	}
	return 0;
}
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






 void post_blob(struct Socket* socket,char* http_header, char*body, char* route){
	SSL* cSSL = socket->cSSL;
	char path[2048];
	char write_path[2048];
	int overwrite = 0;

	if (strstr(route, "/blob-storage/email")){
		connect_to_server("127.0.0.1", "5000", body);
		const char *home = getenv("HOME");
		if (!home || !home[0]){
			send_response_code(cSSL, 500);
			return;
		}
		snprintf(write_path, sizeof(write_path),"%s/home-server/blob-storage/bronze_portfolio_appointments.json", home);
		snprintf(path, sizeof(path),"blob-storage/bronze_portfolio_appointments.json");

	}
	else if (strstr(route, "/blob-storage/etl/pipeline/save")!= NULL){
		char* pipelineId = get_query_parameter(route, "pipelineId");
		if (pipelineId == NULL){
			send_response_code(cSSL, 400);
			return;
		}
		const char *home = getenv("HOME");
		if (!home || !home[0]){
			send_response_code(cSSL, 500);
			return;
		}
		if (!body){
			send_response_code(cSSL, 400);
			return;
		}
		char dir_path[2048];
		snprintf(dir_path, sizeof(dir_path), "%s/home-server/blob-storage/raw/etl/pipeline", home);
		if (ensure_dir(dir_path) != 0){
			send_response_code(cSSL, 500);
			return;
		}
		snprintf(write_path, sizeof(write_path),"%s/home-server/blob-storage/raw/etl/pipeline/%s.json", home, pipelineId);
		FILE *file = fopen(write_path, "w");
		if (!file) {
			perror("Failed to open file");
			send_response_code(cSSL, 500);
			return;
		}
		if (fputs(body, file) == EOF) {
			perror("Failed to write to file");
			fclose(file);
			send_response_code(cSSL, 500);
			return;
		}
		fclose(file);
		send_response_code(cSSL, 200);
		return;
	}
	else if (strstr(route, "/blob-storage/etl/trigger/save")!= NULL){
		char* triggerId = get_query_parameter(route, "triggerId");
		if (triggerId == NULL){
			send_response_code(cSSL, 400);
			return;
		}
		const char *home = getenv("HOME");
		if (!home || !home[0]){
			send_response_code(cSSL, 500);
			return;
		}
		if (!body){
			send_response_code(cSSL, 400);
			return;
		}
		char dir_path[2048];
		snprintf(dir_path, sizeof(dir_path), "%s/home-server/blob-storage/raw/etl/trigger", home);
		if (ensure_dir(dir_path) != 0){
			send_response_code(cSSL, 500);
			return;
		}
		snprintf(write_path, sizeof(write_path),"%s/home-server/blob-storage/raw/etl/trigger/%s.json", home, triggerId);
		FILE *file = fopen(write_path, "w");
		if (!file) {
			send_response_code(cSSL, 500);
			return;
		}
		if (fputs(body, file) == EOF) {
			fclose(file);
			send_response_code(cSSL, 500);
			return;
		}
		fclose(file);
		send_response_code(cSSL, 200);
		return;
	}
	else if (strstr(route, "/blob-storage/etl/pipeline/delete")!= NULL){
		char* pipelineId = get_query_parameter(route, "pipelineId");
		if (pipelineId == NULL){
			send_response_code(cSSL, 400);
			return;
		}
		const char *home = getenv("HOME");
		if (!home || !home[0]){
			send_response_code(cSSL, 500);
			return;
		}
		snprintf(write_path, sizeof(write_path),"%s/home-server/blob-storage/raw/etl/pipeline/%s.json", home, pipelineId);
		if (remove(write_path) != 0){
			send_response_code(cSSL, 404);
			return;
		}
		char trigger_dir[2048];
		snprintf(trigger_dir, sizeof(trigger_dir), "%s/home-server/blob-storage/raw/etl/trigger", home);
		DIR *dir = opendir(trigger_dir);
		if (dir != NULL){
			struct dirent *entry;
			while ((entry = readdir(dir)) != NULL){
				if (entry->d_type != DT_REG){
					continue;
				}
				if (strncmp(entry->d_name, "triggers_", 9) != 0){
					continue;
				}
				char trigger_path[2048];
				snprintf(trigger_path, sizeof(trigger_path), "%s/home-server/blob-storage/raw/etl/trigger/%s", home, entry->d_name);
				char* content = get_file_buffer(trigger_path);
				if (content == NULL){
					continue;
				}
				cJSON* parsed = cJSON_Parse(content);
				free(content);
				if (parsed == NULL){
					continue;
				}
				cJSON* stored_pipeline = cJSON_GetObjectItem(parsed, "pipeline_id");
				if (cJSON_IsString(stored_pipeline) && stored_pipeline->valuestring != NULL &&
					strcmp(stored_pipeline->valuestring, pipelineId) == 0) {
					remove(trigger_path);
				}
				cJSON_Delete(parsed);
			}
			closedir(dir);
		}
		send_response_code(cSSL, 200);
		return;
	}
	else if (strstr(route, "/blob-storage/etl/trigger/delete")!= NULL){
		char* triggerId = get_query_parameter(route, "triggerId");
		if (triggerId == NULL){
			send_response_code(cSSL, 400);
			return;
		}
		const char *home = getenv("HOME");
		if (!home || !home[0]){
			send_response_code(cSSL, 500);
			return;
		}
		snprintf(write_path, sizeof(write_path),"%s/home-server/blob-storage/raw/etl/trigger/%s.json", home, triggerId);
		if (remove(write_path) != 0){
			send_response_code(cSSL, 404);
			return;
		}
		send_response_code(cSSL, 200);
		return;
	}
	else if (strstr(route, "/blob-storage/raw/")!= NULL || strstr(route, "/blob-storage/processed/")!= NULL){
		const char *raw_start = strstr(route, "/blob-storage/raw/");
		if (!raw_start){
			raw_start = strstr(route, "/blob-storage/processed/");
		}
		if (!raw_start){
			send_response_code(cSSL, 400);
			return;
		}
		if (!body){
			send_response_code(cSSL, 400);
			return;
		}
		const char *home = getenv("HOME");
		if (!home || !home[0]) {
			send_response_code(cSSL, 500);
			return;
		}
		char full_path[2048];
		snprintf(full_path, sizeof(full_path), "%s/home-server%s", home, raw_start);
		char *query = strchr(full_path, '?');
		if (query){
			*query = '\0';
		}
		char dir_path[2048];
		snprintf(dir_path, sizeof(dir_path), "%s", full_path);
		char *last_slash = strrchr(dir_path, '/');
		if (!last_slash){
			send_response_code(cSSL, 400);
			return;
		}
		*last_slash = '\0';
		for (char *p = dir_path + 1; *p; p++){
			if (*p == '/'){
				*p = '\0';
				if (mkdir(dir_path, 0755) != 0 && errno != EEXIST){
					send_response_code(cSSL, 500);
					return;
				}
				*p = '/';
			}
		}
		if (mkdir(dir_path, 0755) != 0 && errno != EEXIST){
			send_response_code(cSSL, 500);
			return;
		}
		FILE *file = fopen(full_path, "w");
		if (!file) {
			send_response_code(cSSL, 500);
			return;
		}
		if (fputs(body, file) == EOF) {
			fclose(file);
			send_response_code(cSSL, 500);
			return;
		}
		fclose(file);
		send_response_code(cSSL, 200);
		return;
	}



	// else if (strstr(route, "/blob-storage/bronze/CTA/ctabustracker/predictions?rt")!= NULL){
	// 	char* rt = get_query_parameter(route, "rt");
	// 	snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/bronze_CTA_ctabustracker_%s_predictions.json", rt);
	// 	snprintf(path, sizeof(path)," ");
	// }
	// else if (strstr(route, "/blob-storage/bronze/etl/pipeline?")!= NULL){
	// 	char* userId = get_query_parameter(route, "userId");
	// 	snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/bronze_etl_%s_pipelines.json", userId);
	// 	snprintf(path, sizeof(path),"../blob-storage/bronze_etl_%s_pipelines.json", userId);
	// 	overwrite =1;
	// }
	// else if (strstr(route, "/blob-storage/silver/CTA/ctabustracker/predictions")){
	// 	snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/silver_CTA_ctabustracker_predictions.json");
	// 	snprintf(path, sizeof(path),"../blob-storage/silver_CTA_ctabustracker_predictions.json");
	// }
	// else if (strstr(route, "/blob-storage/gold/CTA/ctabustracker/delays")){
	// 	snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/gold_CTA_ctabustracker_delays.json");
	// 	snprintf(path, sizeof(path),"../blob-storage/gold_CTA_ctabustracker_delays.json");
	// }
	// else if (strstr(route, "/blob-storage/gold/CTA/ctabustracker/route_delays")){
	// 	snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/gold_CTA_ctabustracker_route_delays.json");
	// 	snprintf(path, sizeof(path)," ");
	// }
	// else if (strstr(route, "/blob-storage/gold/CTA/ctabustracker/direction_delays")){
	// 	snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/gold_CTA_ctabustracker_direction_delays.json");
	// 	snprintf(path, sizeof(path)," ");
	// }
	// else if (strstr(route, "/blob-storage/gold/CTA/ctabustracker/stop_delays")){
	// 	snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/gold_CTA_ctabustracker_stop_delays.json");
	// 	snprintf(path, sizeof(path)," ");
	// }
	
	printf("GETTING FILE...\n");
	char* frame_json = get_file_buffer(path);
	if (frame_json == NULL){
		printf("CREATING PATH...\n");
		FILE *file = fopen(write_path, "w");
		if (!file) {
			perror("Failed to open file");
			send_response_code(cSSL, 500);
		}

		if (fputs(body, file) == EOF) {
			perror("Failed to write to file");
			fclose(file);
		}
		printf("Closing File...\n");
		fclose(file);
		printf("Sending Response...\n");

		send_response_code(cSSL, 200);
		printf("Response Sent\n");
	}
	
	else{
		cJSON* root = cJSON_Parse(frame_json);
		cJSON* old_values = cJSON_GetObjectItem(root, "values");
		cJSON *json = cJSON_Parse(body);
		cJSON* new_values = cJSON_GetObjectItem(json, "values");

		if (!overwrite){
			for (int i = 0 ; i < cJSON_GetArraySize(new_values) ; i++){
				cJSON *subitem = cJSON_GetArrayItem(new_values, i);
				cJSON_AddItemToArray(old_values, subitem);
			}
		
		}else{
			for (int i = 0 ; i < cJSON_GetArraySize(new_values) ; i++){
				cJSON *subitem = cJSON_GetArrayItem(new_values, i);
				cJSON *value = cJSON_GetObjectItem(subitem, "Id");
				if (cJSON_IsString(value) && (value->valuestring != NULL)) {
					printf("SubItem ID: %s\n",value->valuestring);
					char* target_id = value->valuestring;
					for (int j = 0 ; j < cJSON_GetArraySize(old_values) ; j++){
						cJSON *old_subitem = cJSON_GetArrayItem(old_values, j);
						cJSON *old_value = cJSON_GetObjectItem(subitem, "Id");
						if (cJSON_IsString(old_value) && (old_value->valuestring != NULL)) {
							if (strcmp(old_value->valuestring, target_id) ==0){
								cJSON_DeleteItemFromArray(old_values, j);
								break;

							}

						}
					}
					cJSON_AddItemToArray(old_values, subitem);
				}
			}
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
		printf("Done\n");
	}
}
