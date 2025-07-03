#include <openssl/ssl.h>
#include  "Socket.h"
void process_websocket_route(char* metadata, char* data);
void process_route(struct Socket* socket,char* http_header, char* body);
