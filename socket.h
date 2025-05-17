#include <openssl/ssl.h>
int create_socket();
void add_fd(int new_fd,struct pollfd *pfds[], struct Client *clients[], int *fd_count, int *max_fd_size);
int get_ready_file_descriptor(int fd_count, struct pollfd *pfds);
int listen_for_pfds(int listener_socket, struct pollfd *pfds,struct Client *clients, int fd_count, int max_fd_size);
void del_from_pfds(struct pollfd pfds[], int i, int *fd_count);
void initialize_ssl();
SSL* encrypt_socket(int fd);
