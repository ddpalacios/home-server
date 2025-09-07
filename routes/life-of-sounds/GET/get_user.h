#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "User.h"
#include "Socket.h"
void get_user(struct Socket* socket,char* http_header, char*body, char* route);