#include <openssl/ssl.h>
#include "Invitation.h"
#include "WebsocketClient.h"
#include "Websocket_Message.h"
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"
#include "Socket.h"
#include "websocket.h"

void activate_websocket_session(char* sessionId, char* http_header, struct Socket *socket){
	int exists = websocket_session_exists(sessionId);
	SSL *cSSL = socket->cSSL;
	if (exists){
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
				}
			}else{
				send_response_code(cSSL, 400);
				socket->keep_alive = 0x0;
			}
		}else{
			char* messages_json = get_messages_by_sessionid_json(sessionId);
			printf("%s\n", messages_json);
			send_JSON_response_code(cSSL, 200, messages_json);
		}
	}
}


void get_websocket_protocol(struct Socket* socket,char* http_header, char*body, char* route){
            SSL *cSSL = socket->cSSL;

			if (strstr(http_header, "/live_studio/join?connect=true&Id=")){
				  char* sessionId = get_query_parameter(route, "Id");
				  char* username = get_query_parameter(route, "username");
				//   struct WebsocketClient websocketclient = create_websocketclient(sessionId,socket->Id, username, 0x0);
				//   insert_websocketclient(websocketclient);
				//   activate_websocket_session(sessionId, http_header, socket);
			  }
			  else if (strstr(http_header, "/live_studio/session?Id=")){
					char* sessionId = get_query_parameter(route, "Id"); // TODO Search for sessionID and validate that it exists to start the protocol
					activate_websocket_session(sessionId, http_header, socket);
				}else{
					send_response_code(cSSL, 400);
					socket->keep_alive = 0x0;
				}
    }	


			// 		printf("Creating new session...\n");
			// 		struct Websocket websocket_session = create_websocket_session();
			// 		insert_websocket_session(websocket_session);
					// struct WebsocketClient ws_client =  create_websocketclient(websocket_session.sessionid, socket->Id, 0x1);
					// insert_websocketclient(ws_client);
			// 		struct Invitation invitation = create_invitation(websocket_session.sessionid);
			// 		insert_invitation(invitation);
			// 		cJSON *root = create_json_object();
			// 		add_string_to_json_root(root,"invitationId",invitation.Id);
			// 		add_string_to_json_root(root,"sessionId",websocket_session.sessionid);
			// 		char* ws_info = get_json_as_string(root);
			// 		printf("%s\n", ws_info);
			// 		size_t total_bytes = strlen(ws_info) +2;
			// 		char* frame = malloc(total_bytes);
			// 		frame[0] = 0x81;
			// 		frame[1] = strlen(ws_info) & 0x7f;
			// 		memcpy(frame +2, ws_info, strlen(ws_info)); 
					// if (!SSL_write(cSSL, frame, total_bytes)){
					// 	printf("Error sending message.\n");
					// }else{
					// 	printf("Done sending.\n");
					// }
			// 		if (frame != NULL){
			// 			free(frame);
			// 			frame = NULL;
			// 		}

      
