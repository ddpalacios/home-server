#include <openssl/ssl.h>
#include <cjson/cJSON.h>
#include "Invitation.h"
#include "WebsocketClient.h"
#include "Websocket_Message.h"
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "local-server/POST/post_local_server.h"
#include <fcntl.h>
#include "session.h"
#include "User.h"
#include "Socket.h"
#include "websocket.h"

void start_websocket_session(struct Socket* socket,char* http_header, char*body, char* route){
	SSL *cSSL = socket->cSSL;
		char* websocket_key = get_header_value(http_header,"Sec-WebSocket-Key");
		if ( strlen(websocket_key) > 0){
			char* wss_accp_key = generate_websocket_accptKey(websocket_key);
			if (wss_accp_key != NULL){
				int res = switch_to_websocket_protocol(cSSL,  wss_accp_key);
				if (res <=0){
					send_response_code(cSSL, 400);
					socket->keep_alive = 0x0;
				}else{
					socket->keep_alive = 0x1;
					cJSON* root = cJSON_CreateObject();
					cJSON_AddStringToObject(root,"request","new_connection");
					cJSON_AddStringToObject(root,"value",socket->Id);
					char*result  = cJSON_Print(root);
					int payload_length = strlen(result);
					size_t total_bytes = payload_length + 2;
					char* frame = malloc(total_bytes);
					frame[0] = 0x81;
					frame[1] = payload_length & 0x7f;
					memcpy(frame + 2, result,payload_length);
					if (!SSL_write(cSSL, frame, total_bytes)){
						printf("Error sending message.\n");
					}
					cJSON_Delete(root);
					if (frame != NULL){
						free(frame);
						frame = NULL;
					}
					int flags = fcntl(socket->fd, F_GETFL, 0);
					if (flags != -1) {
						fcntl(socket->fd, F_SETFL, flags | O_NONBLOCK);
					}
					SSL_set_mode(cSSL, SSL_MODE_ENABLE_PARTIAL_WRITE | SSL_MODE_ACCEPT_MOVING_WRITE_BUFFER);

				}
			}else{
				send_response_code(cSSL, 400);
				socket->keep_alive = 0x0;
			}
	}
}
