#include "Blob.h"
#include <cjson/cJSON.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include <string.h>
#include <openssl/sha.h>
#include <openssl/ssl.h>
#include <sys/socket.h>

// bronze,etl,user_abccc, pipeline_avdvd
// bronze,CTA,ctabustracker, 201_predictions.json
char* get_blob_by_path(char*container,char* source, char*database, char*tableName, char*fileType){
    if (strcmp(fileType, "json") ==0){
        char path[2048];
        snprintf(path, sizeof(path),"../blob-storage/%s_%s_%s_%s.json", container, source, database, tableName);
        char* result = get_file_buffer(path);
        
        // char *r = cJSON_Print(root);
        return result;
    }
}



