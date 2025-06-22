#include <cjson/cJSON.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

cJSON* create_json_object(){
	cJSON* root = cJSON_CreateObject();
	return root;
}


cJSON* add_array_to_json(cJSON* root, char* array_name){
	cJSON* json_array = cJSON_AddArrayToObject(root, array_name);
	return json_array;
}
void add_json_to_array(cJSON* json_array, cJSON* json_object){
	cJSON_AddItemToArray(json_array, json_object);
}
void add_number_to_json_root(cJSON* root, char* key,int value){
	cJSON_AddNumberToObject(root,key,value);
}
void add_string_to_json_root(cJSON* root,char* key,char* value){
	cJSON_AddStringToObject(root,key,value);
}

char*  get_json_as_string(cJSON* root){
	char*result  = cJSON_Print(root);
	return result;
}

float  get_float_value_from_json(char* key, char* target_json){
	cJSON *json = cJSON_Parse(target_json);
	cJSON *value = cJSON_GetObjectItem(json, key);

    if (cJSON_IsNumber(value)) {
	 float res = value->valuedouble;
	return res;
    }
}

int  get_int_value_from_json(char* key, char* target_json){
	cJSON *json = cJSON_Parse(target_json);
	cJSON *value = cJSON_GetObjectItem(json, key);

    if (cJSON_IsNumber(value)) {
	 int res = value->valueint;
	return res;
    }


}
char* get_string_value_from_json(char* key, char* target_json){
	cJSON *json = cJSON_Parse(target_json);
	cJSON *value = cJSON_GetObjectItem(json, key);

    if (cJSON_IsString(value) && (value->valuestring != NULL)) {
	    char* res = value->valuestring;
	    return res; 
    }
    printf("COULD NOT FIND %s\n", key); 
    return NULL;

}
