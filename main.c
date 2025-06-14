#include <stdio.h>
#include <string.h>
#include "socket.h"

#include <fcntl.h>
#include <inttypes.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>

int main(){
	int max_fd_size = 10;
	int fd_count = 0;
	listen_for_pfds(fd_count, max_fd_size);
	return 0;
}
