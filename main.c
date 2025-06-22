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
	add_string_to_json_root(root, "frame_name", "home-server");
	cJSON* json_array = add_array_to_json(root, "values");
	cJSON* json_record =  create_defined_frame_value("FLAG","INT",0,0
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

int main(){
	int server_size = sizeof(struct Server) * MAX_SERVERS;
	struct Server* servers = (struct Server*)malloc(server_size);
	int total_servers = 0;
	connect_to_server(&servers, "10.0.0.213", "9036", &total_servers);
	for (int i=0; i<total_servers; i++){
		struct Server server = servers[i];
		printf("Server Name: %s\n", server.hostname);
		post_defined_frame(server.cSSL, server.hostname);
	}

	return 0;
}
