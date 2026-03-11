#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"

void get_gol_script(SSL* cSSL, char* request, char* template_name);
void get_video_file(SSL* cSSL, char* request, char* template_name);
void get_image_file(SSL* cSSL, char* request, char* template_name);