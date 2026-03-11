#include <cjson/cJSON.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include <string.h>
#include <openssl/sha.h>
#include <openssl/ssl.h>
#include <sys/socket.h>
typedef struct Blob {
	char* Id;
	int exists;

} blobs;

char* get_blob_by_path(char*container,char* source, char*database, char*tableName, char*fileType);