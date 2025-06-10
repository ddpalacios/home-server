#include <openssl/ssl.h>
typedef struct Client{
	int Id;
	SSL* cSSL;

}clients;

SSL* get_client_socket(struct Client *clients,int fd_count, int fd);
void remove_client(int *fd_count, struct Client clients[], int fd);

