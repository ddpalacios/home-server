#ifndef GET_LOCAL_SERVER_H
#define GET_LOCAL_SERVER_H

#include "Socket.h"

void get_to_local(struct Socket* socket, char* http_header, char* body, char* route, const char* port);

#endif
