#include <openssl/ssl.h>
void process_websocket_route(char* metadata, char* data);
void process_route(SSL* cSSL, char* request, char* request_type, char* route, int fd);

