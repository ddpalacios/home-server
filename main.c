#include <stdio.h>
#include <string.h>
#include <netdb.h>
#include <sys/types.h>
#include "socket.h"
#include <poll.h>


int main(){
	int max_fd_size = 10;
	int fd_count = 0;
	struct addrinfo hints;
	memset(&hints, 0, sizeof(hints));
	hints.ai_family = AF_INET;
	hints.ai_socktype = SOCK_STREAM;
	hints.ai_flags= AI_PASSIVE;
	struct Socket *sockets = malloc(sizeof(*sockets) * max_fd_size);
	struct Socket server_socket; 
       	bind_and_listen_socket(hints, "9035", &server_socket);
	listen_for_clients(sockets,&server_socket, &fd_count, &max_fd_size);
	/*
	insert_socket(sockets, &server_socket, &fd_count, &max_fd_size);

	for (int i=0; i<fd_count; i++){
		printf("Socket ID: %d\n", sockets[i].pollfd->fd);
	
	}
	listen_for_clients(sockets,&fd_count, &max_fd_size);
	delete_socket(sockets, &server_socket, &fd_count);
	del_from_pfds(pfds, clients, &fd_count, &server_socket);
	struct pollfd *pfds = malloc(sizeof(*pfds) * max_fd_size);
	struct Client *clients = malloc(sizeof(*clients) * max_fd_size);
	struct Socket server_socket; 
       	bind_and_listen_socket(hints, "9035", &server_socket);
	insert_socket(server_socket, &pfds, &clients, &fd_count, &max_fd_size);
	printf("HOST: %s\n", server_socket.hostname);
	for (int i=0; i<fd_count; i++){
		printf("Socket ID: %d\n", pfds[i].fd);
	
	}
	listen_for_clients(pfds, clients, &fd_count, &max_fd_size, &server_socket);

	del_from_pfds(pfds, clients, &fd_count, &server_socket);
	*/
	return 0;
}
