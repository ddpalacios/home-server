#include <cjson/cJSON.h>


cJSON* add_array_to_json(cJSON* root, char* array_name);
void add_json_to_array(cJSON* json_array, cJSON* json_object);
void add_number_to_json_root(cJSON* root, char* key,int value);
void add_string_to_json_root(cJSON* root,char* key,char* value);

cJSON* create_json_object();
float  get_float_value_from_json(char* key, char* target_json);
int  get_int_value_from_json(char* key, char* target_json);
char* get_string_value_from_json(char* key, char* target_json);
char*  get_json_as_string(cJSON* root);

