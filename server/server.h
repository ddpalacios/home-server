#pragma once
#include <openssl/ssl.h>
#include <poll.h>
#include <netdb.h>
#include <sys/types.h>

typedef struct Server {
	char* Id;
	char*ip_addr;
	const char*hostname;
	const char*port;
    int fd;
	SSL* cSSL;


} server;

void start_listening_for_clients(char* port);
struct Server connect_to_server(const char* host, const char* port);