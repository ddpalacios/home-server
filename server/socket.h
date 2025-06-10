#include <openssl/ssl.h>
#include <poll.h>
#include "client.h"
int listen_for_pfds(int fd_count, int max_fd_size);
void del_from_pfds(struct pollfd pfds[],struct Client clients[], int fd, int *fd_count);
