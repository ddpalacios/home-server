#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include "send_message.h"
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "Socket.h"
void post_blob(struct Socket *sockets,struct Socket* socket,char* http_header, char*body, char* route, int fd_count){
	SSL* cSSL = socket->cSSL;
	char path[2048];
	char write_path[2048];

	if (strstr(route, "/set_appointment")){
		snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/bronze_portfolio_appointments.json");
		snprintf(path, sizeof(path),"../blob-storage/bronze_portfolio_appointments.json");
		for (int i=0; i<fd_count; i++){
			struct Socket target_socket = sockets[i];
			if (target_socket.isEmail){
				send_tcp_message(target_socket.cSSL,0x1, 0x1, strlen(body), body);
			}
		}
	}else{
		char* rt = get_query_parameter(route, "rt");
		snprintf(write_path, sizeof(write_path),"/home/dpalacios/home-server/blob-storage/bronze_CTA_ctabustracker_%s_predictions.json", rt);
		snprintf(path, sizeof(path),"../blob-storage/bronze_CTA_ctabustracker_%s_predictions.json", rt);
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
