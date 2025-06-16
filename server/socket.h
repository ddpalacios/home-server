#include <openssl/ssl.h>
#include <poll.h>
#include "client.h"
#include <sys/socket.h>
#include <netdb.h>
#include <sys/types.h>
typedef struct Socket{
	char* Id;
	char* ip_addr;
	char* PORT;
	char* hostname;
	int isEncrpyted;
	int isClient;
	struct Client client;


}sockets;


struct Socket create_socket(struct addrinfo hints, char* PORT);
int listen_for_pfds(int fd_count, int max_fd_size);
void del_from_pfds(struct pollfd pfds[],struct Client clients[], int fd, int *fd_count);
