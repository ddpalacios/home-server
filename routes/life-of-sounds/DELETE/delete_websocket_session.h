#include <openssl/ssl.h>
#include "Socket.h"
void delete_websocket_session(struct Socket* socket,char* http_header, char*body, char* route);