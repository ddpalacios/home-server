#include <openssl/ssl.h>
#include <stddef.h>
#include  "Socket.h"
void process_websocket_route(char* metadata, char* data);
void process_route(struct Socket* socket,char* http_header, char* body, size_t body_len);
