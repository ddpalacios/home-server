#include <cjson/cJSON.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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