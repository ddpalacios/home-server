#include <stdio.h>
#include <stdlib.h>
#include "cjson/cJSON.h"

int main() {
    // JSON string
    const char *json_string = "{\"name\":\"Alice\",\"age\":25,\"is_student\":true}";

    // Parse JSON string
    cJSON *json = cJSON_Parse(json_string);
    if (json == NULL) {
        printf("Error parsing JSON!\n");
        return 1;
    }

    // Access "name" (string)
    cJSON *name = cJSON_GetObjectItem(json, "name");
    if (cJSON_IsString(name)) {
        printf("Name: %s\n", name->valuestring);
    }

    // Access "age" (integer)
    cJSON *age = cJSON_GetObjectItem(json, "age");
    if (cJSON_IsNumber(age)) {
        printf("Age: %d\n", age->valueint);
    }

    // Access "is_student" (boolean)
    cJSON *is_student = cJSON_GetObjectItem(json, "is_student");
    if (cJSON_IsBool(is_student)) {
        printf("Is Student: %s\n", cJSON_IsTrue(is_student) ? "true" : "false");
    }

    // Clean up
    cJSON_Delete(json);

    return 0;
}

