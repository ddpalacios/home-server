#include "server.h"
#include "json_utilities.h"
#include <cjson/cJSON.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <netdb.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <openssl/err.h>
#include <unistd.h>
#include <resolv.h>
#include <openssl/ssl.h>
#include <openssl/sha.h>
#include <openssl/evp.h>

#define IPSTRLEN INET6_ADDRSTRLEN
#define MAX_SERVERS 10

cJSON* create_defined_frame_value(char* name, char*datatype, int byte_offset, int byte_length, char* description, int position, int is_length_prefix){
	cJSON* json_record = create_json_object();
	add_string_to_json_root(json_record, "name", name);
	add_string_to_json_root(json_record, "datatype", datatype);
	add_number_to_json_root(json_record, "byte_offset", byte_offset);
	add_number_to_json_root(json_record, "byte_length", byte_length);
	add_string_to_json_root(json_record, "description",description);
	add_number_to_json_root(json_record, "position", position);
	add_number_to_json_root(json_record, "is_length_prefix", is_length_prefix);
	return  json_record;
}

void post_defined_frame(SSL* cSSL, const char*hostname){
	cJSON* root = create_json_object();
	char main_hostname[HOST_NAME_MAX + 1]; 
	if (gethostname(main_hostname, sizeof(main_hostname)) == 0) {
		add_string_to_json_root(root, "frame_name", main_hostname);
	    } else {
		perror("gethostname"); 
	    }
	cJSON* json_array = add_array_to_json(root, "values");
	cJSON* json_record =  create_defined_frame_value("FLAG","INT",0,1
						      	,"Indicates if an error has occured on the source side",0,0);
	add_json_to_array(json_array, json_record);
	json_record =  create_defined_frame_value("SOURCE_LEN","INT",1,4
						      	,"The prefix length of the next proceeding byte(s) of the source",1,1);
	add_json_to_array(json_array, json_record);
	json_record =  create_defined_frame_value("SOURCE","TEXT",5,-1
						      	,"The name of the actual source that sent the message",2,0);
	add_json_to_array(json_array, json_record);
	json_record =  create_defined_frame_value("DEST_LEN","INT",-1,4
						      	,"The prefix length of the next proceeding byte(s) of the dest",3,1);
	add_json_to_array(json_array, json_record);
	json_record =  create_defined_frame_value("DEST","TEXT",-1,-1
						      	,"The name of the actual source that send the message",4,0);
	add_json_to_array(json_array, json_record);
	json_record =  create_defined_frame_value("OPCODE","INT",-1,1
						      	,"Data type of the actual payload. i.e. 1=text & 2=binary",5,0);
	add_json_to_array(json_array, json_record);
	json_record =  create_defined_frame_value("PAYLOAD_LENGTH","INT",-1,4
						      	,"The length in bytes of the next proceeding bytes for the payload",6,1);
	add_json_to_array(json_array, json_record);
	json_record =  create_defined_frame_value("PAYLOAD","TEXT",-1,-1
						      	,"The actual payload that the machine has sent",7,0);
	add_json_to_array(json_array, json_record);
	
	char* result = get_json_as_string(root);
	size_t body_len = strlen(result);

	printf("Sent %ld bytes\n",body_len);
        char request[2048];
        char body[2048];
	int header_len = snprintf(request, sizeof(request),
			    "POST /database-server/frame HTTP/1.1\r\n"
			    "Host: %s\r\n"
			    "Content-Type: application/json\r\n"
			    "Content-length: %zu\r\n"
			    "\r\n",
			    hostname, strlen(result)); 
   SSL_write(cSSL,request, header_len);
   SSL_write(cSSL,result, body_len);
}
void realloc_frame(char** frame,int*frame_size, int bytes_added, int byte_length, int*frame_size_remaining){
	 char* tmp = realloc(*frame, bytes_added+byte_length);
	 if (tmp == NULL){
		 printf("Failed to realloc memory\n");
	 }else{
		 *frame = tmp;
		 *frame_size = bytes_added +byte_length;
		 *frame_size_remaining += byte_length;
	 }
}

void add_str_to_byte(char**frame,const char* data,int byte_length, int*bytes_added, int* frame_size){

	int frame_size_remaining = (*frame_size) - (*bytes_added);	
	if (byte_length >  frame_size_remaining){
		realloc_frame(frame,frame_size, *bytes_added, byte_length, &frame_size_remaining);
	}
	 memcpy(&(*frame)[*bytes_added], data,byte_length);
	frame_size_remaining -= byte_length;
	*bytes_added +=byte_length;
}

void add_int_to_byte(char**frame, int data,int byte_length, int*bytes_added, int* frame_size){
	int frame_size_remaining = (*frame_size) - (*bytes_added);	

	if (byte_length >  frame_size_remaining){
		realloc_frame(frame,frame_size, *bytes_added, byte_length, &frame_size_remaining);
	}
	if (byte_length > 1){
		int total_bits = (8 * byte_length) - 8;
		for (int i=0; i<byte_length; i++){
			if (total_bits == 0){
				(*frame)[*bytes_added + i] = data &0xFF;
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

void send_buffer_to_socket(struct Server server,int opcode, const char*buf){
	int payload_length = strlen(buf);
	int frame_size = 1;
	char* frame = malloc(frame_size);

	int bytes_added = 0;

	add_int_to_byte(&frame, 0x0, 1, &bytes_added, &frame_size);

	const char* h = server.hostname;
	int source_length = strlen(h);
	add_int_to_byte(&frame,source_length, 4, &bytes_added, &frame_size);
	add_str_to_byte(&frame,h, source_length, &bytes_added, &frame_size);


	const char* d = "10.0.0.213";
	int dest_len = strlen(d);
	add_int_to_byte(&frame,dest_len, 4, &bytes_added, &frame_size);
	add_str_to_byte(&frame,d, dest_len, &bytes_added, &frame_size);


	add_int_to_byte(&frame, 0x1, 1, &bytes_added, &frame_size);

	add_int_to_byte(&frame,payload_length, 4, &bytes_added, &frame_size);
	add_str_to_byte(&frame,buf, payload_length, &bytes_added, &frame_size);

	SSL_write(server.cSSL, frame, bytes_added);
}



int main(){
	int server_size = sizeof(struct Server) * MAX_SERVERS;
	struct Server* servers = (struct Server*)malloc(server_size);
	int total_servers = 0;
	connect_to_server(&servers, "10.0.0.213", "9036", &total_servers);
	post_defined_frame(servers[0].cSSL, servers[0].hostname);


	for (int i=0; i<total_servers; i++){
		struct Server server = servers[i];
		printf("SENDING TO Server Name: %s\n", server.hostname);
		const char* buf = "Hello, from Daniel Palacios. There is a shit ton to do.";
		send_buffer_to_socket(server,1, buf);
	}

	return 0;
}




