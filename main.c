#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <poll.h>
#include "client.h"
#include "socket.h"
#include "FileStorage.h"

int main(){
	//create_directory("users/f434b7e2454ce858e60f587b8d1d27b0/");
	//create_directory("users/f434b7e2454ce858e60f587b8d1d27b0/recordings");
	initialize_ssl();
	int max_fd_size = 10;
	int fd_count = 0;
	struct Client *clients;
	clients = malloc(sizeof(*clients) * max_fd_size);
	struct pollfd *pfds = malloc(sizeof(*pfds) * max_fd_size);
	int listener_socket = create_socket();
	add_fd(listener_socket, &pfds,&clients, &fd_count, &max_fd_size);
	listen_for_pfds(listener_socket,pfds,clients, fd_count, max_fd_size);

	return 0;
}
