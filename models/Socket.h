#pragma once
#include <openssl/ssl.h>
#include <sys/socket.h>

typedef struct Socket{
	char* Id;
	int fd;
	char* ip_addr;
	char* hostname;
	char* jobId;
	SSL* cSSL;
	int is_tcp;
	int keep_alive;
	int is_listener;
	int finished;
	int isEmail;
	int exists;

 } s;
void sink_socket_info(struct Socket *socket,struct sockaddr_storage remoteaddr );
void create_socket(int fd, SSL* cSSL, struct Socket *socket);
void insert_socket(struct Socket **sockets, struct Socket socket,int *fd_count, int *max_fd_size);
void delete_socket(struct Socket *sockets, int fd, int *fd_count);
SSL* encrypt_socket(int fd);
/* Initialize the global TLS context (cert + key + options) at server boot.
 * Idempotent and thread-safe via pthread_once. Call from main() before
 * accept() so the first client connection doesn't pay the init cost. */
void ssl_ctx_init(void);

struct Socket get_socket_by_Id(struct Socket *sockets, int fd);
