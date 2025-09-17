#include <openssl/ssl.h>
#include "Socket.h"

void patch_websocket_client(struct Socket* socket,char* http_header, char*body, char* route);