#include <openssl/ssl.h>
#include "Socket.h"

void get_websocket_protocol(struct Socket* socket,char* http_header, char*body);