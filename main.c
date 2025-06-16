#include <stdio.h>
#include <string.h>
#include <netdb.h>
#include <sys/types.h>
#include "socket.h"








int main(){
	int max_fd_size = 10;
	int fd_count = 0;
	struct addrinfo hints;
	memset(&hints, 0, sizeof(hints));
	hints.ai_family = AF_INET;
	hints.ai_socktype = SOCK_STREAM;
	hints.ai_flags= AI_PASSIVE;
	create_socket(hints, "9035");

	return 0;
}
