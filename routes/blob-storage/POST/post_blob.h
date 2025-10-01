#include <openssl/ssl.h>
#include "Socket.h"
void post_blob(struct Socket *sockets,struct Socket* socket,char* http_header, char*body, char* route, int fd_count);
