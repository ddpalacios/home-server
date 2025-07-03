#include "Frame.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <uuid/uuid.h>
#include  <cjson/cJSON.h>


int string_property_exists( cJSON *item, char* prop_name){
	if (item == NULL || !cJSON_IsString(item)){
		  char message[255];
		  snprintf(message, sizeof(message), "Property '%s' does not exists or is not a string", prop_name);
		  printf("%s\n",message);
		  return 0;
	}else{
		return 1;
	}
}
int number_property_exists( cJSON *item, char* prop_name){
	if (item == NULL || !cJSON_IsNumber(item)){
		  char message[255];
		  snprintf(message, sizeof(message), "Property '%s' does not exists or is not a number", prop_name);
		  printf("%s\n",message);
		  return 0;
	}else{ 
		return 1;
	}	
}


int is_valid_frame(cJSON* root){
    if (!cJSON_IsObject(root)){
        printf("Malformed JSON. Please check the body and try again.\n");
        return 0;
    }
    cJSON *item = cJSON_GetObjectItem(root,"values");
    if (item == NULL || !cJSON_IsArray(item)){
        printf("Array property 'values' is required and is not found.\n");
        return 0;
    }
    for (int i = 0 ; i < cJSON_GetArraySize(item) ; i++){
            cJSON * subitem = cJSON_GetArrayItem(item, i);
            if (!cJSON_IsObject(subitem)){ return 0; }

            cJSON* name = cJSON_GetObjectItem(subitem, "name");
            if (!string_property_exists(name, "name")){
                return 0;
            }
            cJSON* datatype = cJSON_GetObjectItem(subitem, "datatype");
            if (!string_property_exists(datatype, "datatype")){
                return 0;
            }
            cJSON* byte_offset = cJSON_GetObjectItem(subitem, "byte_offset");
            if (!number_property_exists(byte_offset, "byte_offset")){
                return 0;
            }
            cJSON* byte_length = cJSON_GetObjectItem(subitem, "byte_length");
            if (!number_property_exists(byte_length, "byte_length")){
                return 0;
            }
            cJSON* description = cJSON_GetObjectItem(subitem, "description");
            if (!string_property_exists(description, "description")){
                return 0;
            }
            cJSON* position = cJSON_GetObjectItem(subitem, "position");
            if (!number_property_exists(position, "position")){
                return 0;
            }
            cJSON* is_length_prefix = cJSON_GetObjectItem(subitem, "is_length_prefix");
            if (!number_property_exists(is_length_prefix, "is_length_prefix")){
                return 0;
            }
        }
    return 1;
}
