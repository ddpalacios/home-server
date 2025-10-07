#include <openssl/ssl.h>
#include "Socket.h"
int peek_exact_bytes(SSL *cSSL, int nbytes, char* buf);
int read_exact_bytes(SSL *cSSL, int nbytes, char* buf);
int read_tcp_message(SSL *cSSL, char** payload);
void process_bytes( struct Socket* sockets, struct Socket* socket, char* buf, int fd_count);
