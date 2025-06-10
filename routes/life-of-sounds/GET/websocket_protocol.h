#include <openssl/ssl.h>

void get_websocket_protocol(SSL* cSSL,char*route, char* request, int fd);