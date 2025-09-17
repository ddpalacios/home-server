#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "Socket.h"
void get_websocket_client(struct Socket* socket,char* http_header, char*body, char* route);
