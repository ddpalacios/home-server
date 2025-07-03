#include  <cjson/cJSON.h>
#include <sys/socket.h>
#include "Socket.h"
#include "FrameField.h"
#include "Frame.h"
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
				// printf("Sending %d as last byte\n", data & 0xFF);
				(*frame)[*bytes_added + i] = (data & 0xFF);

			}else{
				(*frame)[*bytes_added + i] = (data >> total_bits) &0xFF;
			}
			frame_size_remaining -=1;
			total_bits -=8;
		}
		*bytes_added+=4;
	}else{
		(*frame)[*bytes_added] = data;
		*bytes_added+=1;
		frame_size_remaining -=1;
	}

} 


int send_tcp_message(SSL *cSSL, int opcode, int payload_length, char* payload){
	char* frame_json = get_file_buffer("../frame.json");
    cJSON* root = cJSON_Parse(frame_json);
    if (!is_valid_frame(root)){
            return 0;
         }
    cJSON *item = cJSON_GetObjectItem(root,"values");
    int frame_size = 1;
    unsigned char* frame = malloc(frame_size);
    int bytes_added = 0;
    for (int i = 0 ; i < cJSON_GetArraySize(item) ; i++){
        cJSON * subitem = cJSON_GetArrayItem(item, i);
        cJSON* name = cJSON_GetObjectItem(subitem, "name");
        cJSON* byte_length = cJSON_GetObjectItem(subitem, "byte_length");
        cJSON* byte_offset = cJSON_GetObjectItem(subitem, "byte_offset");
        if (strcmp(name->valuestring , "OPCODE")==0){
                add_int_to_byte(&frame,opcode, byte_length->valueint, &bytes_added, &frame_size);
        }else if (strcmp(name->valuestring , "PAYLOAD_LENGTH")==0){
                add_int_to_byte(&frame,payload_length, byte_length->valueint, &bytes_added, &frame_size);
        }
        else if (strcmp(name->valuestring , "PAYLOAD")==0){
	            add_str_to_byte(&frame,payload, payload_length, &bytes_added, &frame_size);
        }
    }
    // printf("\n\nSENDING | %s\n\n", payload);
    if (!SSL_write(cSSL, frame, bytes_added)){
        printf("Error sending message.\n");
        return 0;
    }
	free(frame);
    return 1;
}