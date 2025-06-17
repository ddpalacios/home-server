#include <openssl/ssl.h>
#include <poll.h>
#include "client.h"
#include <sys/socket.h>
#include <netdb.h>
#include <sys/types.h>
typedef struct Socket{
	int Id;
	char* ip_addr;
	int PORT;
	char* type;
	char* hostname;
	char* service;
	int isEncrypted;
	int isClient;
	SSL* cSSL;


}sockets;
void delete_socket(struct pollfd pfds[],struct Socket *sockets, struct Socket *socket, int *fd_count);
void listen_for_clients(struct Socket *sockets,struct Socket *server_socket,int *fd_count, int *max_fd_size);
void insert_socket(struct Socket *new_socket);
void bind_and_listen_socket(struct addrinfo hints, char* PORT, struct Socket *new_socket);
int listen_for_pfds(int fd_count, int max_fd_size);
