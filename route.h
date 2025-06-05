#include <openssl/ssl.h>
void process_websocket_route(char* metadata, char* data);
void process_route(char* buf, char* request_type, char* route,char* cookie ,char* request_body, SSL* cSSL, int ready_fd);

