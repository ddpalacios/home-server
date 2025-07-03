#include  <cjson/cJSON.h>
#include <sys/socket.h>
#include "Socket.h"
#include "route.h"
#include "FrameField.h"
#include "http_utilities.h"
#include <sys/types.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include "Frame.h"
#include <openssl/bio.h>
#include <stdio.h>
#include <string.h>
#include <netdb.h>

int peek_exact_bytes(SSL *cSSL, int nbytes, char* buf){
    int total_bytes_retrieved = 0;
    while (total_bytes_retrieved < nbytes) {
        int to_read = nbytes - total_bytes_retrieved;
        int bytes_read = SSL_peek(cSSL, buf, to_read);
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


int read_exact_bytes(SSL *cSSL, int nbytes, char* buf){
    int total_bytes_retrieved = 0;
    while (total_bytes_retrieved < nbytes) {
        int to_read = nbytes - total_bytes_retrieved;
        int bytes_read = SSL_read(cSSL, buf, to_read);
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

			unsigned char* buf = malloc(byte_length);
			int fbytes = read_exact_bytes(cSSL,byte_length, buf);
			if (is_length_prefix->valueint){
				prefix_length = (buf[0] << 24) + (buf[1] << 16) + (buf[2] << 8) + (buf[3]);
			}else if (strcmp(name->valuestring , "PAYLOAD")==0){
				*payload = malloc(byte_length + 1);
					memcpy(*payload, buf, byte_length);
					(*payload)[byte_length] = '\0';
					free(buf);
					break;
			}
		free(buf);
	}
}


int read_websocket_message(unsigned char* buf, char* message){
	int finVal = buf[0] & 0x80;
	int opcode = buf[0] & 0x0F;
	int mask = buf[1] & 0x80;
	int payload_length = buf[1] & 0x7F;
	if (payload_length < 126){
		if (mask){
			int offset = 2;
			unsigned char* masking_key;
			masking_key = malloc(4);
			for (int i=0; i<4; i++){
				masking_key[i] = buf[2+i];
				offset = 2 + i;
			}
			offset++;
			 unsigned char payload[payload_length+1];
			for (int i=0; i<payload_length; i++){
				payload[i] = buf[offset+i];
			}
			for (int i=0; i<payload_length; i++){
				int val = payload[i] ^ masking_key[i%4];
				message[i] = val; 
			}
			if (masking_key != NULL){
				free(masking_key);
				masking_key = NULL;
			}
			return payload_length;
		}
	}else if (payload_length == 126){
		if (mask){
			unsigned int p1 = buf[2];
			unsigned int p2 = buf[3];
			unsigned int extended_payload_length = (p1 <<8) | p2;
			unsigned char* masking_key;

			masking_key = malloc(4);
			int offset = 4;
			for (int i=0; i<4; i++){
				masking_key[i] = buf[4+i];
				offset = 4 + i;
			}
			offset++;
			unsigned char payload[extended_payload_length+1];
			for (int i=0; i<extended_payload_length; i++){
				payload[i] = buf[offset+i];
			}
			for (int i=0; i<extended_payload_length; i++){
				int val = payload[i] ^ masking_key[i%4];
				message[i] = val; 
			}
			if (masking_key != NULL){
				free(masking_key);
				masking_key = NULL;
			}
			return extended_payload_length;

		}
	}
}
void process_bytes(struct Socket *socket, char* buf){
	if (buf != NULL && strstr(buf, "HTTP/1.1")!=NULL){
		char* peeked_http_header = malloc(1024);
		int header_length = get_http_header(buf, peeked_http_header);
		char* http_header = malloc(header_length+4);
		char* body = NULL; 
		read_exact_bytes(socket->cSSL, header_length+4, http_header);
		http_header[header_length+4] = '\0';
		int content_length = 0;
		char* value_start = strstr(peeked_http_header,"Content-Length: ");
		if (value_start != NULL){
			char* content_length_val = strchr(value_start, ' ');
			content_length_val++;
			content_length = atoi(content_length_val);
		}
		if (content_length > 0){
			body = malloc(content_length);
			read_exact_bytes(socket->cSSL, content_length, body);
			body[content_length] = '\0';
		}
		process_route(socket, http_header, body);
		if (body != NULL){
			free(body);
		}
		if (peeked_http_header != NULL){
			free(peeked_http_header);
			peeked_http_header = NULL;
		}
		if (http_header != NULL){
			free(http_header);
			http_header = NULL;
		}
	}else{
	
		char* websocket_buf = malloc(2056);
		int bytes_read = SSL_read(socket->cSSL, websocket_buf, 2056);
		if (bytes_read <= 0){
			socket->keep_alive = 0x0;
		}else{
			websocket_buf[bytes_read] = '\0';
			char* message = malloc(bytes_read);
			int message_length = read_websocket_message(websocket_buf, message);
			message[message_length] = '\0';
			printf("%s\n", message);
			if (message != NULL){
				free(message);
				message = NULL;
			}
		}
		if (websocket_buf != NULL){
			free(websocket_buf);
			websocket_buf = NULL;
		}
	}
}

