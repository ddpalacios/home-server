#include <openssl/ssl.h>
#include "Socket.h"

void post_browser_session(struct Socket* socket,char* http_header, char*body, char* route);