#include  <cjson/cJSON.h>

typedef struct Frame {
	char* Id;
	char* name;
	char* ip_addr;
	char* type;
}frames;

int string_property_exists( cJSON *item, char* prop_name);
int number_property_exists( cJSON *item, char* prop_name);
int is_valid_frame(cJSON* root);
