#include  <cjson/cJSON.h>
#include <sys/socket.h>
#include "Socket.h"
#include "json_utilities.h"
#include "send_message.h"
#include "route.h"
#include "WebsocketClient.h"
#include "life-of-sounds/POST/post_websocket_client.h"
#include "FrameField.h"
#include "http_utilities.h"
#include <sys/types.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include "Websocket_Message.h"
#include "websocket.h"
#include "local-server/POST/post_local_server.h"
#include <unistd.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include "Frame.h"
#include <openssl/bio.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <netdb.h>
#define BUFFER_SIZE 16384

int peek_exact_bytes(SSL *cSSL, int nbytes, char* buf){
    int bytes_read = SSL_peek(cSSL, buf, nbytes);
    if (bytes_read <= 0) {
        if (bytes_read == 0) {
            printf("SSL connection closed\n");
        } else {
            printf("SSL read error\n");
        }
        return 0;
    }

    return bytes_read;
}


int read_exact_bytes(SSL *cSSL, int nbytes, char* buf){
    int total_bytes_retrieved = 0;
    while (total_bytes_retrieved < nbytes) {
        int to_read = nbytes - total_bytes_retrieved;
        int bytes_read = SSL_read(cSSL, buf+ total_bytes_retrieved, to_read);
        if (bytes_read <= 0) {
            if (bytes_read == 0) {
                printf("SSL connection closed\n");
                return 0;
            } else {
                printf("SSL read error\n");
                return 0;
            }
        }

        total_bytes_retrieved += bytes_read;
    }

    return total_bytes_retrieved;
}


int read_tcp_message(SSL *cSSL, char** payload){
	char* frame_json = get_file_buffer("../frame.json");
	cJSON* root = cJSON_Parse(frame_json);
	if (!is_valid_frame(root)){
		printf("Not a valid FRAME");
			return 0;
		}
	unsigned int prefix_length = 0;
	int byte_length = 0;
	cJSON *item = cJSON_GetObjectItem(root,"values");
	for (int i = 0 ; i < cJSON_GetArraySize(item) ; i++){
			cJSON* subitem = cJSON_GetArrayItem(item, i);
			cJSON* name = cJSON_GetObjectItem(subitem, "name");
			cJSON* byte_length_json = cJSON_GetObjectItem(subitem, "byte_length");
			cJSON* is_length_prefix = cJSON_GetObjectItem(subitem, "is_length_prefix");
			if (byte_length_json->valueint == -1 && prefix_length > 0){
					byte_length = prefix_length;
			}else{
					byte_length = byte_length_json->valueint;
			}

			unsigned char* buf = malloc(byte_length+1);
			int fbytes = read_exact_bytes(cSSL,byte_length, buf);
			// printf("READ BYTES: %d\n", fbytes);
			if (is_length_prefix->valueint){
				prefix_length = (buf[0] << 24) + (buf[1] << 16) + (buf[2] << 8) + (buf[3]);
			}else if (strcmp(name->valuestring , "PAYLOAD")==0){
				*payload = malloc(byte_length + 1);
					memcpy(*payload, buf, byte_length);
					(*payload)[byte_length] = '\0';
					free(buf);
					return byte_length;
			}
		free(buf);
	}
	cJSON_Delete(root);
	return 0;
}


int read_websocket_message(SSL*cSSL,int payload_length, char** payload){
	if (payload_length < 126){
		unsigned char*masking_key = malloc(4);
		int nbytes = read_exact_bytes(cSSL, 4, masking_key);

		char* coded_payload = malloc(payload_length+1);
		if (!coded_payload){
			perror("malloc");
			return 0;
		}
		nbytes = read_exact_bytes(cSSL, payload_length, coded_payload);
		coded_payload[payload_length] = '\0';
		*payload = malloc(payload_length+1);

		for (int i=0; i<payload_length; i++){
			int val = coded_payload[i] ^ masking_key[i%4];
			(*payload)[i] = val; 
		}
		(*payload)[payload_length] = '\0';


		if (masking_key != NULL){
			free(masking_key);
			masking_key = NULL;
		}
		if (coded_payload != NULL){
			free(coded_payload);
			coded_payload = NULL;
		}
		return payload_length;
	}else if (payload_length == 126){
		 unsigned char*extended_length = malloc(2);
		 int nbytes = read_exact_bytes(cSSL, 2, extended_length);
		 unsigned int p1 = extended_length[0];
		 unsigned int p2 = extended_length[1];
		 unsigned int new_length = (p1 << 8) | p2;
		//  printf("NEW LENGTH: %d\n", new_length);

		unsigned char*masking_key = malloc(4);
		nbytes = read_exact_bytes(cSSL, 4, masking_key);

		char* coded_payload = malloc(new_length+1);
		nbytes = read_exact_bytes(cSSL, new_length, coded_payload);

		coded_payload[new_length] = '\0';

		*payload = malloc(new_length+1);

		for (int i=0; i<new_length; i++){
			int val = coded_payload[i] ^ masking_key[i%4];
			(*payload)[i] = val; 
		}
		(*payload)[new_length] = '\0';

		if (masking_key != NULL){
			free(masking_key);
			masking_key = NULL;
		}
		if (extended_length != NULL){
			free(extended_length);
			extended_length = NULL;
		}
		if (coded_payload != NULL){
			free(coded_payload);
			coded_payload = NULL;
		}
		return new_length;
	}else if (payload_length == 127){

		 uint64_t new_length = 0;
		 unsigned char*extended_length = malloc(8);
		 int nbytes = read_exact_bytes(cSSL, 8, extended_length);
		 for (int i = 0; i < 8; i++) {
		    new_length = (new_length << 8) | extended_length[i];
		}
		unsigned char*masking_key = malloc(4);
		nbytes = read_exact_bytes(cSSL, 4, masking_key);

		char* coded_payload = malloc(new_length+1);
		nbytes = read_exact_bytes(cSSL, new_length, coded_payload);
		coded_payload[new_length] = '\0';
		*payload = malloc(new_length+1);

		for (int i=0; i<new_length; i++){
			int val = coded_payload[i] ^ masking_key[i%4];
			(*payload)[i] = val; 
		}
		(*payload)[payload_length] = '\0';
		if (masking_key != NULL){
			free(masking_key);
			masking_key = NULL;
		}
		if (extended_length != NULL){
			free(extended_length);
			extended_length = NULL;
		}
		if (coded_payload != NULL){
			free(coded_payload);
			coded_payload = NULL;
		}
		return new_length;

	}
	return 0;
}

int is_tcp_buffer(unsigned char* buf){
	int finVal = buf[0];
	int opcode = buf[1];
	if (opcode == 0x1 && finVal == 0x1){
		return 1;
	}else{
		return 0;
	}

}

int is_websocket_buffer(unsigned char* buf){
	int finVal = buf[0] & 0x80;
	int opcode = buf[0] & 0x0F;
	int mask = buf[1] & 0x80;
	if ((opcode == 0x0 || opcode == 0x1 || opcode == 0x2 || opcode == 0x8) && mask  == 128){
		return 1;
	}else{
		return 0;
	}
}
char* get_value(cJSON *json, const char* key) {
    if (!json || !key) {
        return NULL;
    }

    cJSON *value = cJSON_GetObjectItem(json, key);
    if (value && cJSON_IsString(value) && value->valuestring) {
        return value->valuestring;
    }

    printf("COULD NOT FIND %s\n", key);
    return NULL;
}


int get_int_value(cJSON *json, char* key){
	cJSON *value = cJSON_GetObjectItem(json, key);
    if (cJSON_IsNumber(value)) {
	    int res = value->valueint;
	    return res; 
    }
    printf("COULD NOT FIND %s\n", key); 
    return 0;
}

char* get_optional_value(cJSON *json, char* key){
    if (!json || !key) {
        return NULL;
    }
    cJSON *value = cJSON_GetObjectItem(json, key);
    if (value && cJSON_IsString(value) && value->valuestring) {
        return value->valuestring;
    }
    return NULL;
}
void free_message(struct Websocket_Message* msg) {
    free(msg->sessionId);
    free(msg->content);
    free(msg->timestamp);
    free(msg->username);
    free(msg->userid);
}

static int get_broadcast_flag(cJSON *json) {
    int broadcast = 0;
    cJSON *broadcast_item = cJSON_GetObjectItem(json, "broadcast");
    if (cJSON_IsNumber(broadcast_item)) {
        broadcast = broadcast_item->valueint;
    } else if (cJSON_IsBool(broadcast_item)) {
        broadcast = cJSON_IsTrue(broadcast_item) ? 1 : 0;
    }
    return broadcast;
}

static void send_tcp_to_websocket_clients(struct Socket *sockets, int fd_count,
                                          int payload_length, int nbytes,
                                          char *tcp_buf) {
    for (int i = 0; i < fd_count; i++) {
        struct Socket *s = &sockets[i];
        if (!s->is_listener && !s->is_tcp) {
            send_message_as_websocket(s, fd_count, payload_length, nbytes, tcp_buf);
        }
    }
}

static void send_tcp_to_socket_id(struct Socket *sockets, int fd_count,
                                  const char *socket_id, int payload_length,
                                  int nbytes, char *tcp_buf) {
    for (int i = 0; i < fd_count; i++) {
        struct Socket *s = &sockets[i];
        if (strcmp(s->Id, socket_id) == 0) {
            send_message_as_websocket(s, fd_count, payload_length, nbytes, tcp_buf);
            return;
        }
    }
}

void process_websocket_message(struct Socket* sockets,struct Socket* socket,int fd_count, char* message,int payload_length,int nbytes ){
	cJSON *json = cJSON_Parse(message);
	if (json) {
		char* jobId = get_optional_value(json, "jobId");
		if (jobId  != NULL) {

			for (int i=0; i<fd_count;i++){
				struct Socket* s = &sockets[i];
				if (!s->jobId) {
					continue;
				}
				if (strcmp(s->jobId, jobId) == 0){
					send_tcp_message(s->cSSL, 0x1, 0x1, nbytes, message);
				}
			}
		}



		cJSON_Delete(json);
		if (message != NULL){
	  		free(message);
			message = NULL;
		}
	}
		// char* request = get_value(json,"request");
		// char* send_to = get_optional_value(json,"send_to");
		// char* socketId = get_optional_value(json,"socketId");
		// printf("WEBSOCKET %s %s %s\n", operation, request, send_to);

		// if (request && operation) {
		// 	if (strcmp(request, "POST")==0 &&strcmp(operation, "client")==0){
		// 		post_websocket_client(socket,NULL, message, NULL, 0);
		// 	}else if (strcmp(request, "POST")==0 &&strcmp(operation, "message")==0){
		// 		char* content = get_value(json,"content");
		// 		char* userid = get_value(json,"userid");
		// 		char* username = get_value(json,"username");
		// 		char* sessionId = get_value(json,"sessionId");
		// 		char* timestamp = get_value(json,"timestamp");
		// 		int is_notification = get_int_value(json,"is_notification");
		// 		struct Websocket_Message ws_message = create_message(sessionId,content, timestamp,username,userid, is_notification);
		// 		insert_message(ws_message);
		// 		free_message(&ws_message);

		// 	}else if (strcmp(request, "initialize")==0 && strcmp(operation, "rtneat")==0){
		// 		cJSON *content = cJSON_GetObjectItem(json, "content");
		// 		if (content) {
		// 			cJSON *payload = cJSON_CreateObject();
		// 			cJSON_AddStringToObject(payload, "socketId", socket->Id);
		// 			cJSON_AddItemToObject(payload, "data", cJSON_Duplicate(content, 1));
		// 			char *payload_text = cJSON_PrintUnformatted(payload);
		// 			if (payload_text) {
		// 				post_to_local_no_reply("/rtneat/initialize", payload_text);
		// 				free(payload_text);
		// 			}
		// 			cJSON_Delete(payload);
		// 		}
		// 	}

		// 	if (send_to && strcmp(send_to, "tcp")==0){
				// for (int i=0; i<fd_count;i++){
				// 	struct Socket* s = &sockets[i];
		// 			if (s->is_tcp){
		// 			printf("FOUND TCP SOCKET\n");
		// 			send_tcp_message(s->cSSL, 0x1, 0x1, nbytes, message);
		// 		}
		// 	}
		// }
		// 	// }else{
		// 	// 	send_websocket_message(sockets,socket,fd_count, payload_length, nbytes, message);
		// 	// }
		// }
	
}
			
			/*
			send_websocket_message(sockets,socket,fd_count, payload_length, nbytes, message);
			}
			cJSON_Delete(json);
		if (message != NULL){
			free(message);
			message = NULL;
			}
		if (nbytes == 0){
			printf("Could not determine bytes...\n");
			exit(1);
			}
				

	}

			if (strcmp(request, "POST")==0 &&strcmp(operation, "client")==0){
				post_websocket_client(socket,NULL, message, NULL, 0);
				send_websocket_message(sockets,socket,fd_count, payload_length, nbytes, message);
			}else if (strcmp(request, "POST")==0 &&strcmp(operation, "message")==0){
				send_websocket_message(sockets,socket,fd_count, payload_length, nbytes, message);
				char* content = get_value(json,"content");
				char* userid = get_value(json,"userid");
				char* username =  "";//get_value(json,"username");
				char* sessionId = get_value(json,"sessionId");
				char* timestamp = get_value(json,"timestamp");
				int is_notification = get_int_value(json,"is_notification");
				struct Websocket_Message ws_message = create_message(sessionId,content, timestamp,username,userid, is_notification);
				insert_message(ws_message);
				free_message(&ws_message);
			}else if (strcmp(request, "DELETE")==0 &&strcmp(operation, "session")==0){
				send_websocket_message(sockets,socket,fd_count, payload_length, nbytes, message);
				char* sessionId = get_value(json,"sessionId");
				delete_messages_by_sessionid(sessionId);
			}else if (strcmp(request, "PATCH")==0 &&strcmp(operation, "session")==0){
				send_websocket_message(sockets,socket,fd_count, payload_length, nbytes, message);
			}else if (strcmp(request, "MOUSE")==0 && strcmp(operation, "coordinates")==0){
				send_websocket_message(sockets,socket,fd_count, payload_length, nbytes, message);
			}else if (strcmp(request, "PAYLOAD")==0 && strcmp(operation, "send")==0){
				send_websocket_message(sockets,socket,fd_count, payload_length, nbytes, message);
			}else if (strcmp(request, "CTA")==0 && strcmp(operation, "request")==0){
				size_t total_clients=0;
				struct WebsocketClient* clients =  get_websocketclients(&total_clients);
				for (int i=0; i<fd_count; i++){
					struct Socket* s = &sockets[i];
					int isClient = 0;
					for (int j=0; j<total_clients;j++){
						struct WebsocketClient c = clients[j];
						if (strcmp(c.socketId, s->Id) ==0){
							isClient = 1;
							break;
						}
					}
					if (!isClient && !s->is_listener){
						send_tcp_message(s->cSSL, 0x1, 0x1, nbytes, message);
					}else{
					}
				}
				*/
void process_bytes(struct Socket *sockets, struct Socket *socket, char* buf, int fd_count){
		if (is_tcp_buffer(buf)){

			char* tcp_buf = malloc(BUFFER_SIZE);
			int nbytes =  read_tcp_message(socket->cSSL, &tcp_buf);
			// printf("TCP Buf %s\n", tcp_buf);
			socket->is_tcp = 0x1;
			socket->keep_alive = 0x1;
			int payload_length = 0;
			if (nbytes <= 125){
				payload_length = nbytes;
			}else if (nbytes <= 65535){
				payload_length = 126;
			}else{
				payload_length = 127;
			}

			cJSON *json = cJSON_Parse(tcp_buf);
			
			if (json) {
				char* socketId = get_optional_value(json, "socketId");
				int broadcast = get_broadcast_flag(json);
				char* jobId = get_optional_value(json, "jobId");
				if (jobId) {
					printf("Message %s\n", tcp_buf);
					socket->jobId = strdup(jobId);
				}
				if (broadcast || !socketId) {
					// printf("Sending Websocket Message %s\n",tcp_buf);
					send_tcp_to_websocket_clients(sockets, fd_count, payload_length, nbytes, tcp_buf);
				} else {
					send_tcp_to_socket_id(sockets, fd_count, socketId, payload_length, nbytes, tcp_buf);
				}
				cJSON_Delete(json);
			}else{
				send_tcp_message(socket->cSSL, 0x1, 0x1, nbytes, tcp_buf);
				// send_message_as_websocket(socket, fd_count, payload_length, nbytes, tcp_buf);
			}
			if (tcp_buf != NULL){
				free(tcp_buf);
				tcp_buf = NULL;
			}
		}
		if (is_websocket_buffer(buf)){
			unsigned char* websocket_buf = malloc(2);
			if (!websocket_buf){perror("error"); exit(1);}
			int nbytes = read_exact_bytes(socket->cSSL, 2, websocket_buf);
			int finVal = websocket_buf[0] & 0x80;
			int opcode = websocket_buf[0] & 0x0F;
			if (nbytes <= 0 || opcode == 0x8){
				printf("Killing off Socket %d\n", socket->fd);
				socket->keep_alive = 0x0;
			}else{
				int payload_length = websocket_buf[1] & 0x7F;
				char* message = NULL;
				nbytes = read_websocket_message(socket->cSSL, payload_length, &message);
				int message_length = nbytes;
				message[nbytes] = '\0';
				printf("WEBSOCKET MESSAGE %s\n", message);
				process_websocket_message(sockets,socket, fd_count, message,payload_length, nbytes);
				if (websocket_buf != NULL) {
					free(websocket_buf);
					websocket_buf = NULL;
				}

			}
		}
		if (buf != NULL && strstr(buf, "HTTP/1.1")!=NULL){
			size_t header_buf_size = 32768;
			char* peeked_http_header = malloc(header_buf_size);
			memset(peeked_http_header, 0, header_buf_size);
			int header_length = get_http_header(buf, peeked_http_header, header_buf_size);
			if (header_length <= 0) {
				free(peeked_http_header);
				return;
			}
			char* http_header = malloc(header_length+4+1);
			int nbytes = read_exact_bytes(socket->cSSL, header_length+4, http_header);
			if (nbytes <= 0) {
				free(peeked_http_header);
				free(http_header);
				return;
			}
			http_header[nbytes] = '\0';
			int content_length = 0;
			char* value_start = strstr(peeked_http_header,"Content-Length: ");
			char* body = NULL; 
			if (value_start != NULL){
				char* content_length_val = strchr(value_start, ' ');
				content_length_val++;
				content_length = atoi(content_length_val);
			}
			if (content_length > 0){
				body = malloc(content_length+1);
				read_exact_bytes(socket->cSSL, content_length, body);
				body[content_length] = '\0';
			}
			process_route(socket, http_header, body, (size_t)content_length);

			if (peeked_http_header != NULL){
				free(peeked_http_header);
				peeked_http_header = NULL;
			}
			if (http_header != NULL){
				free(http_header);
				http_header = NULL;
			}
			if (body != NULL){
				free(body);
				body = NULL;
			}
		}
	}
/*


	if (is_tcp_buffer(buf)){
		printf("Detected TCP Buffer\n");
		char* tcp_buf = malloc(BUFFER_SIZE);
		int nbytes =  read_tcp_message(socket->cSSL, &tcp_buf);
		int payload_length = 0;
		if (nbytes <= 125){
			payload_length = 125;
		}else{
			payload_length = 126;
		}
		cJSON* root = cJSON_Parse(tcp_buf);
		if (root !=NULL){
			cJSON *value = cJSON_GetObjectItem(root, "client_type");
			if (cJSON_IsString(value) && (value->valuestring != NULL) ) {
				char* res = value->valuestring;
				printf("CLIENT TYPE: %s\n", res);
				if (strcmp(res,"email")==0){
					socket->isEmail = 0x1;
					socket->keep_alive = 0x1;
				}else{
					// socket->keep_alive = 0x0;
				}
			}else{
				printf("NO CLIENT TYPE\n");
				// socket->keep_alive = 0x0;
			}
			cJSON_Delete(root);
		}else{
			printf("INVALID JSON\n");
			// socket->keep_alive = 0x0;

		}
		if (tcp_buf != NULL){
			free(tcp_buf);
			tcp_buf = NULL;
		}
 
		// // send_tcp_message(socket->cSSL,0x1, 0x1,nbytes, tcp_buf);
		// size_t total_sessions = 0;
		// struct Websocket* websockets =  get_websocket_session_by_name("chicago-transits", &total_sessions);
		// for (int i=0; i<total_sessions; i++){
		// 	struct Websocket ws = websockets[i];
		// 	for (int j=0; j<fd_count; j++){
		// 		struct Socket socket = sockets[j];
		// 		if (strcmp(socket.Id, ws.socketId) == 0){
		// 			send_websocket_message(sockets,socket, fd_count,payload_length, nbytes, tcp_buf);
		// 		}
		// 	}
		// }
		// if (websockets != NULL){
		// 	free(websockets);
		// 	websockets = NULL;
		// }
	if (is_websocket_buffer(buf)){
		unsigned char* websocket_buf = malloc(2);
		if (!websocket_buf){perror("error"); exit(1);}
		int nbytes = read_exact_bytes(socket->cSSL, 2, websocket_buf);
		int finVal = websocket_buf[0] & 0x80;
		int opcode = websocket_buf[0] & 0x0F;
		if (nbytes <= 0 || opcode == 0x8){
			printf("Killing off Socket %d\n", socket->fd);
			socket->keep_alive = 0x0;
		}else{
			int payload_length = websocket_buf[1] & 0x7F;
			char* message = NULL;
			nbytes = read_websocket_message(socket->cSSL, payload_length, &message);
			int message_length = nbytes;
			message[nbytes] = '\0';
			// printf("MESSAGE: %s\n", message);
			cJSON *json = cJSON_Parse(message);
			if (json) {
				char* operation = get_value(json,"operation");
				char* request = get_value(json,"request");

				if (request && operation) {
					if (strcmp(request, "POST")==0 &&strcmp(operation, "client")==0){
						post_websocket_client(socket,NULL, message, NULL, 0);
						send_websocket_message(sockets,*socket, fd_count,payload_length, nbytes, message);
					}else if (strcmp(request, "POST")==0 &&strcmp(operation, "message")==0){
						send_websocket_message(sockets,*socket, fd_count,payload_length, nbytes, message);
						char* content = get_value(json,"content");
						char* userid = get_value(json,"userid");
						char* username =  "";//get_value(json,"username");
						char* sessionId = get_value(json,"sessionId");
						char* timestamp = get_value(json,"timestamp");
						int is_notification = get_int_value(json,"is_notification");
						struct Websocket_Message ws_message = create_message(sessionId,content, timestamp,username,userid, is_notification);
						insert_message(ws_message);
						free_message(&ws_message);
					}else if (strcmp(request, "DELETE")==0 &&strcmp(operation, "session")==0){
						send_websocket_message(sockets,*socket, fd_count,payload_length, nbytes, message);
						char* sessionId = get_value(json,"sessionId");
						delete_messages_by_sessionid(sessionId);
					}else if (strcmp(request, "PATCH")==0 &&strcmp(operation, "session")==0){
						send_websocket_message(sockets,*socket, fd_count,payload_length, nbytes, message);
					}else if (strcmp(request, "MOUSE")==0 && strcmp(operation, "coordinates")==0){
						send_websocket_message(sockets,*socket, fd_count,payload_length, nbytes, message);
					}else if (strcmp(request, "PAYLOAD")==0 && strcmp(operation, "send")==0){
						send_websocket_message(sockets,*socket, fd_count,payload_length, nbytes, message);
					}else if (strcmp(request, "CTA")==0 && strcmp(operation, "request")==0){
						size_t total_clients=0;
						struct WebsocketClient* clients =  get_websocketclients(&total_clients);
						for (int i=0; i<fd_count; i++){
							struct Socket* s = &sockets[i];
							int isClient = 0;
							for (int j=0; j<total_clients;j++){
								struct WebsocketClient c = clients[j];
								if (strcmp(c.socketId, s->Id) ==0){
									isClient = 1;
									break;
								}
							}
							if (!isClient && !s->is_listener){
								send_tcp_message(s->cSSL, 0x1, 0x1, nbytes, message);
							}else{
							}
						}
					}
			}
			cJSON_Delete(json);
		}
			if (message != NULL){
					free(message);
					message = NULL;
				}
			if (nbytes == 0){
					printf("Could not determine bytes...\n");
					exit(1);
				}
					
			}
			if (websocket_buf != NULL) {
				free(websocket_buf);
				websocket_buf = NULL;
			}
	
*/
