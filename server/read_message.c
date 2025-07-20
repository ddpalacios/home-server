#include  <cjson/cJSON.h>
#include <sys/socket.h>
#include "Socket.h"
#include "send_message.h"
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
#include <stdint.h>
#include <string.h>
#include <netdb.h>
#define BUFFER_SIZE 4096

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


int read_websocket_message(SSL*cSSL,int payload_length, char** payload){
	if (payload_length < 126){
		unsigned char*masking_key = malloc(4);
		int nbytes = read_exact_bytes(cSSL, 4, masking_key);

		char* coded_payload = malloc(payload_length);
		if (!coded_payload){
			perror("malloc");
			return 0;
		}
		nbytes = read_exact_bytes(cSSL, payload_length, coded_payload);
		*payload = malloc(payload_length+1);

		for (int i=0; i<payload_length; i++){
			int val = coded_payload[i] ^ masking_key[i%4];
			(*payload)[i] = val; 
		}
		if (masking_key != NULL){
			free(masking_key);
			masking_key = NULL;
		}
		if (coded_payload != NULL){
			free(coded_payload);
			coded_payload = NULL;
		}
		return payload_length+1;
	}else if (payload_length == 126){
		 unsigned char*extended_length = malloc(2);
		 int nbytes = read_exact_bytes(cSSL, 2, extended_length);
		 unsigned int p1 = extended_length[0];
		 unsigned int p2 = extended_length[1];
		 unsigned int new_length = (p1 << 8) | p2;

		unsigned char*masking_key = malloc(4);
		nbytes = read_exact_bytes(cSSL, 4, masking_key);


		char* coded_payload = malloc(new_length);
		nbytes = read_exact_bytes(cSSL, new_length, coded_payload);
		*payload = malloc(new_length+1);

		for (int i=0; i<new_length; i++){
			int val = coded_payload[i] ^ masking_key[i%4];
			(*payload)[i] = val; 
		}

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
		return new_length+1;
	}else if (payload_length == 127){

		 uint64_t new_length = 0;
		 unsigned char*extended_length = malloc(8);
		 int nbytes = read_exact_bytes(cSSL, 8, extended_length);
		 for (int i = 0; i < 8; i++) {
		    new_length = (new_length << 8) | extended_length[i];
		}
		unsigned char*masking_key = malloc(4);
		nbytes = read_exact_bytes(cSSL, 4, masking_key);

		char* coded_payload = malloc(new_length);
		nbytes = read_exact_bytes(cSSL, new_length, coded_payload);
		*payload = malloc(new_length+1);

		for (int i=0; i<new_length; i++){
			int val = coded_payload[i] ^ masking_key[i%4];
			(*payload)[i] = val; 
		}
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
		return new_length+1;

	}
	return 0;
}

int is_websocket_buffer(unsigned char* buf){
	int finVal = buf[0] & 0x80;
	int opcode = buf[0] & 0x0F;
	int mask = buf[1] & 0x80;
	if ((opcode == 0x0 || opcode == 0x1 || opcode == 0x2 || opcode == 0x8) && mask  == 128){
		//printf("FIN %d OP %d MASK %d\n", finVal, opcode, mask);
		if (finVal == 128 && (opcode != 0x0 & opcode != 0x8)){
			//printf("Read Entire Websocket Message\n");
		}else if (finVal == 0 && (opcode != 0x0 && opcode != 0x8)){
			//printf("waiting to read next segment\n");
		}else if (finVal == 128 && (opcode == 0x0 )){
			//printf("Finished reading segmented message\n");
		}
		return 1;
	}else{
		return 0;
	}
}

void concatenate(char *dest, char *src) {
   printf("Concatenating message\n");
    while (*dest) {
        dest++; // Move to the end of the destination string
    }
    while (*src) {
        *dest = *src; // Copy each character
        dest++;
        src++;
    }
    //*dest = '\0'; // Null-terminate the result
}

void process_bytes(struct Socket *sockets,struct Socket *socket, char* buf, int fd_count){
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
			//printf("Read %d\n", nbytes);

			int message_length = nbytes;
			// check if has continuation
			if (finVal == 0 && (opcode != 0x0 && opcode != 0x8)){
				while(1){
					char* continuation_buf = malloc(2);
					nbytes = read_exact_bytes(socket->cSSL, 2, continuation_buf);
					finVal = continuation_buf[0] & 0x80;
					opcode = continuation_buf[0] & 0x0F;
			//		printf("FIN VAL %d OPCODE %d\n", finVal, opcode);
					payload_length = continuation_buf[1] & 0x7F;
					char* continuation_message = NULL;
					nbytes = read_websocket_message(socket->cSSL, payload_length, &continuation_message);
					char* temp_message = realloc(message, message_length + nbytes);
					if (temp_message == NULL) {
					    free(continuation_message);
					    free(continuation_buf);
					    free(message);
					    printf("ERROR\n");
					    break;
					}
					message = temp_message;
					memcpy(message + message_length, continuation_message, nbytes);
					message_length += nbytes;
					free(continuation_message);
					free(continuation_buf);
					if (finVal == 128 && opcode == 0x0){
						break;
					}
				}
			}

			if (nbytes == 0){
				printf("Could not determine bytes...\n");
				exit(1);
			}
			if (message != NULL){
				//message[message_length] = '\0';
				send_to_all_clients(sockets, *socket, message,message_length, fd_count);
				free(message);
				message = NULL;
			}
		}
		if (websocket_buf != NULL) {
			free(websocket_buf);
			websocket_buf = NULL;
		}
	}
	
	if (buf != NULL && strstr(buf, "HTTP/1.1")!=NULL){
			char* peeked_http_header = malloc(1024);
			if (!peeked_http_header) { /* handle error */ }
			memset(peeked_http_header, 0, 1024);
			int header_length = get_http_header(buf, peeked_http_header);
			char* http_header = malloc(header_length+4+1);
			int nbytes = read_exact_bytes(socket->cSSL, header_length+4, http_header);
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
			process_route(socket, http_header, body);
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
