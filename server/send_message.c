#include  <cjson/cJSON.h>
#include <sys/socket.h>
#include "Socket.h"
#include "FrameField.h"
#include "Frame.h"
#include "WebsocketClient.h"
#include "http_utilities.h"
#include "json_utilities.h"
#include <sys/types.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>
#include <stdio.h>
#include <string.h>
#include <netdb.h>

void realloc_frame(unsigned char** frame,int*frame_size, int bytes_added, int byte_length, int*frame_size_remaining){
	 char* tmp = realloc(*frame, bytes_added+byte_length);
	 if (tmp == NULL){
		 printf("Failed to realloc memory\n");
	 }else{
		 *frame = tmp;
		 *frame_size = bytes_added +byte_length;
		 *frame_size_remaining += byte_length;
	 }
}

void add_str_to_byte(unsigned char**frame,const char* data,int byte_length, int*bytes_added, int* frame_size){

	int frame_size_remaining = (*frame_size) - (*bytes_added);	
	if (byte_length >  frame_size_remaining){
		realloc_frame(frame,frame_size, *bytes_added, byte_length, &frame_size_remaining);
	}
	 memcpy(&(*frame)[*bytes_added], data,byte_length);
	frame_size_remaining -= byte_length;
	*bytes_added +=byte_length;
}

void add_int_to_byte(unsigned char**frame, int data,int byte_length, int*bytes_added, int* frame_size){
	int frame_size_remaining = (*frame_size) - (*bytes_added);	

	if (byte_length >  frame_size_remaining){
		realloc_frame(frame,frame_size, *bytes_added, byte_length, &frame_size_remaining);
	}
	if (byte_length > 1){
		int total_bits = (8 * byte_length) - 8;
		for (int i=0; i<byte_length; i++){
			if (total_bits == 0){
				(*frame)[*bytes_added + i] = (data & 0xFF);

			}else{
				(*frame)[*bytes_added + i] = (data >> total_bits) &0xFF;
			}
			frame_size_remaining -=1;
			total_bits -=8;
		}
		*bytes_added+=byte_length;
	}else{
		(*frame)[*bytes_added] = data;
		*bytes_added+=1;
		frame_size_remaining -=1;
	}

}

void send_to_clients(char* frame, struct Socket *sockets, struct Socket socket, int total_bytes, int fd_count){
		struct WebsocketClient wsc =  get_websocketclientBySocketId(socket.Id);
		char* sessionId = wsc.sessionId;
		size_t total_clients;
		struct WebsocketClient *ws_clients = get_websocketclientsBySessionId(sessionId, &total_clients);
		int count = 0;
		for (int i=0; i<total_clients; i++){
			if (strcmp(ws_clients[i].socketId,socket.Id) == 0){ // TODO MAKE SURE TO NOT SEND TO SELF.  UNCOMMENT THIS TO ENSURE REGULAR FUNCTIONALITY
				continue;
			}
			for (int j=0; j<fd_count; j++){
				struct Socket client_socket = sockets[j];
				if (strcmp(client_socket.Id,ws_clients[i].socketId)==0){
				   SSL* cSSL = client_socket.cSSL;
				   if (!SSL_write(cSSL, frame, total_bytes)){
					printf("Error sending message.\n");
					break;
				    }else{
					}
				   break;
				}
			}
		}
}

int send_websocket_message(struct Socket *sockets,struct Socket socket,int fd_count,int protocol_length ,int actual_payload_length, char* payload){
	SSL* cSSL = socket.cSSL;
	if (protocol_length < 126){
		size_t total_bytes = actual_payload_length + 2;
		char* frame = malloc(total_bytes); 
		frame[0] = 0x81;
		frame[1] = actual_payload_length & 0x7f;
		memcpy(frame + 2, payload,actual_payload_length);

		if (!SSL_write(cSSL, frame, total_bytes)){
			printf("Error sending message.\n");
			return 0;
		}
		// send_to_clients(frame, sockets, socket,total_bytes,fd_count);
		if (frame != NULL){
			free(frame);
			frame = NULL;
		}
		return total_bytes;
	}else if (protocol_length == 126){
		size_t total_bytes = actual_payload_length + 4;
		char* frame = malloc(total_bytes); 
		frame[0] = 0x81;
		frame[1] = 0x7E & 0x7f;
		frame[2] = (actual_payload_length >> 8) & 0xFF;
		frame[3] = actual_payload_length & 0xFF;
		memcpy(frame + 4, payload,actual_payload_length);

		if (!SSL_write(cSSL, frame, total_bytes)){
			printf("Error sending message.\n");
			return 0;
		}
		// send_to_clients(frame, sockets, socket,total_bytes,fd_count);
	
		if (frame != NULL){
			free(frame);
			frame = NULL;
		}
		return total_bytes;
	}else if (protocol_length == 127){
		size_t total_bytes = actual_payload_length + 10;
		char* frame = malloc(total_bytes); 
		frame[0] = 0x81;
		frame[1] = 0x7F & 0x7f;
		 for (int i = 0; i < 8; i++) {
			frame[i+2] = (actual_payload_length >> (56 - 8 * i)) & 0xFF;
		    }
		memcpy(frame + 10, payload,actual_payload_length);
		if (!SSL_write(cSSL, frame, total_bytes)){
			printf("Error sending message.\n");
			return 0;
		}
		// send_to_clients(frame, sockets, socket,total_bytes,fd_count);
	
		if (frame != NULL){
			free(frame);
			frame = NULL;
		}
		return total_bytes;
	}
}
int send_tcp_message(SSL *cSSL,int fin, int opcode, int payload_length, char* payload){
    char* frame_json = get_file_buffer("../frame.json");
    cJSON* root = cJSON_Parse(frame_json);
    free(frame_json);
    if (!is_valid_frame(root)){
            return 0;
         }
    cJSON *item = cJSON_GetObjectItem(root,"values");
    int frame_size = 17384;
    unsigned char* frame = malloc(frame_size);
    memset(frame, 0, frame_size);
    int bytes_added = 0;
    for (int i = 0 ; i < cJSON_GetArraySize(item) ; i++){
        cJSON * subitem = cJSON_GetArrayItem(item, i);
        cJSON* name = cJSON_GetObjectItem(subitem, "name");
        cJSON* byte_length = cJSON_GetObjectItem(subitem, "byte_length");
        cJSON* byte_offset = cJSON_GetObjectItem(subitem, "byte_offset");

        if (strcmp(name->valuestring , "FIN")==0){
                add_int_to_byte(&frame,fin, byte_length->valueint, &bytes_added, &frame_size);
	}else if (strcmp(name->valuestring , "OPCODE")==0){
                add_int_to_byte(&frame,opcode, byte_length->valueint, &bytes_added, &frame_size);
        }else if (strcmp(name->valuestring , "PAYLOAD_LENGTH")==0){
                add_int_to_byte(&frame,payload_length, byte_length->valueint, &bytes_added, &frame_size);
        }
        else if (strcmp(name->valuestring , "PAYLOAD")==0){
	            add_str_to_byte(&frame,payload, payload_length, &bytes_added, &frame_size);
        }
    }
    cJSON_Delete(root);
    if (!SSL_write(cSSL, frame, bytes_added)){
        printf("Error sending message.\n");
        return 0;
    }
	if (frame != NULL){
		free(frame);
		frame = NULL;
	}
    return 1;
}

void send_message_to_socket(struct Socket *sockets,struct Socket socket,int fd_count,int protocol_length ,int actual_payload_length, char* payload){
	printf("Protocol Length %d | Actual Length: %d\n", protocol_length, actual_payload_length);

	if (protocol_length < 126){
		size_t total_bytes = actual_payload_length + 2;
		char* frame = malloc(total_bytes); 
		frame[0] = 0x81;
		frame[1] = actual_payload_length & 0x7f;
		memcpy(frame + 2, payload,actual_payload_length);
		SSL* cSSL = socket.cSSL;
		printf("Sending %s\n", payload);
		if (!SSL_write(cSSL, frame, total_bytes)){
			printf("Error sending message.\n");
			}
		
		if (frame != NULL){
			free(frame);
			frame = NULL;
		}
		
	}else if (protocol_length == 126){
		size_t total_bytes = actual_payload_length + 4;
		char* frame = malloc(total_bytes); 
		frame[0] = 0x81;
		frame[1] = 0x7E & 0x7f;
		frame[2] = (actual_payload_length >> 8) & 0xFF;
		frame[3] = actual_payload_length & 0xFF;
		memcpy(frame + 4, payload,actual_payload_length);
		SSL* cSSL = socket.cSSL;
		if (!SSL_write(cSSL, frame, total_bytes)){
			printf("Error sending message.\n");
			}
		if (frame != NULL){
			free(frame);
			frame = NULL;
			}
		}
	}
