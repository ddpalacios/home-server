#include <stdio.h>
#include <openssl/ssl.h>
#include <cjson/cJSON.h>
#include "Socket.h"
#include "http_utilities.h"
#include "json_utilities.h"
#include "FrameField.h"
#include "Frame.h"
#include <time.h>

// void send_response(struct Socket socket,int code,char* message, char* route){
// 	  time_t rawtime;
// 	  struct tm * timeinfo;
// 	  time ( &rawtime );
// 	  timeinfo = localtime ( &rawtime );
// 	  cJSON* root = create_json_object();
// 	  char* error_message = get_code_message(code);
// 	  add_number_to_json_root(root, "status", code);
// 	  if (code != 200 && code != 201){
// 	  	add_string_to_json_root(root, "error", error_message);
// 	  }
// 	  add_string_to_json_root(root, "message", message);
// 	  add_string_to_json_root(root, "path", route);
// 	  add_string_to_json_root(root, "timestamp", asctime(timeinfo));
// 	  char* result = get_json_as_string(root);
// 	  send_JSON_response_code(socket.cSSL,code, result);
// }

// int string_property_exists(struct Socket socket, cJSON *item, char* prop_name, char*route){
// 	if (item == NULL || !cJSON_IsString(item)){
// 		  char message[255];
// 		  snprintf(message, sizeof(message), "Property '%s' does not exists or is not a string", prop_name);
// 		  send_response(socket, 400, message, route);
// 		  return 0;
// 	}else{
// 		return 1;
// 	}
// }
// int number_property_exists(struct Socket socket, cJSON *item, char* prop_name, char*route){
// 	if (item == NULL || !cJSON_IsNumber(item)){
// 		  char message[255];
// 		  snprintf(message, sizeof(message), "Property '%s' does not exists or is not a number", prop_name);
// 		  send_response(socket, 400, message, route);
// 		  return 0;
// 	}else{ 
// 		return 1;
// 	}	
// }

// int parse_object(cJSON *root, struct Socket socket,char* route)
// {
// 	if (!cJSON_IsObject(root)){
// 		send_response(socket, 400, "Malformed JSON. Please check the body and try again.", route);
// 		return -1;
// 	}
//         cJSON* frame_name = cJSON_GetObjectItem(root,"frame_name");
// 	if (!string_property_exists(socket, frame_name, "frame_name", route)){
// 		return -1;
// 	}
//        int frame_exists = frame_exists_by_name(frame_name->valuestring);
//        if (frame_exists){
// 	       send_response(socket, 409, "Frame already exists!", route);
// 	       return -1;
//        }
//         struct Frame frame = create_frame(frame_name->valuestring, socket.ip_addr);
//         char* frame_Id = frame.Id;
// 	cJSON *item = cJSON_GetObjectItem(root,"values");
// 	if (item != NULL && cJSON_IsArray(item)){
//           struct FrameField *frameFields = malloc(sizeof(struct FrameField) * 10);
// 	  for (int i = 0 ; i < cJSON_GetArraySize(item) ; i++){
// 	     cJSON * subitem = cJSON_GetArrayItem(item, i);
// 		if (cJSON_IsObject(subitem)){
// 			cJSON* name = cJSON_GetObjectItem(subitem, "name");
// 			if (!string_property_exists(socket, name, "name", route)){
// 				return -1;
// 			}
// 			cJSON* datatype = cJSON_GetObjectItem(subitem, "datatype");
// 			if (!string_property_exists(socket, datatype, "datatype", route)){
// 				return -1;
// 			}
// 		        cJSON* byte_offset = cJSON_GetObjectItem(subitem, "byte_offset");
// 			if (!number_property_exists(socket, byte_offset, "byte_offset", route)){
// 				return -1;
// 			}
// 			cJSON* byte_length = cJSON_GetObjectItem(subitem, "byte_length");
// 			if (!number_property_exists(socket, byte_length, "byte_length", route)){
// 				return -1;
// 			}
// 			cJSON* description = cJSON_GetObjectItem(subitem, "description");
// 			if (!string_property_exists(socket, description, "description", route)){
// 				return -1;
// 			}
// 			cJSON* position = cJSON_GetObjectItem(subitem, "position");
// 			if (!number_property_exists(socket, position, "position", route)){
// 				return -1;
// 			}
// 			cJSON* is_length_prefix = cJSON_GetObjectItem(subitem, "is_length_prefix");
// 			if (!number_property_exists(socket, is_length_prefix, "is_length_prefix", route)){
// 				return -1;
// 			}

// 			struct FrameField frameField = create_frameField(frame_Id
// 					     ,name->valuestring
// 					     ,datatype->valuestring
// 					     ,byte_offset->valueint
// 					     ,byte_length->valueint
// 					     ,description->valuestring
// 					     ,position->valueint
// 					     ,is_length_prefix->valueint
// 					     );

// 			     insert_frameField(frameField);    
// 			     frameFields[i] = frameField;
// 		}else{
// 			send_response(socket, 400, "Malformed JSON item. Please check the body and try again.", route);
// 			return -1;
// 		}
// 	  }
//         insert_frame(frame);
// 		// insert(map, socket.ip_addr, frameFields); 
// 		send_response(socket, 201, "New TCP Frame Created!", route);
// 	}else{
// 		send_response(socket, 400, "Array property 'values' is required and is not found.", route);
// 		return -1;
// 	}
// }

void post_frame(struct Socket socket, char* body,char* route) {
    // SSL *cSSL = socket.cSSL;
    // int fd =socket.Id;
    // if (body != NULL){
	//    cJSON* json = cJSON_Parse(body);
	//    if (!json) {
	// 	send_response(socket, 400, "Parsing Error. Malformed JSON. Please check the json object in the body.", route);
	// 	fprintf(stderr, "Parse failed: %s\n", cJSON_GetErrorPtr());
	//    }else{
	// 	  parse_object(json,socket, route);
	//    }
    // }else{
	// send_response(socket, 400, "Body is missing from request", route);
    // }
}
