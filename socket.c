#include <stdlib.h>
#include <stdio.h>
#include <poll.h>
#include <sys/socket.h>
#include <netinet/in.h>

#define PORT 9034

int create_socket(){
	struct sockaddr_in server_address;
	server_address.sin_family = AF_INET;
	server_address.sin_port = htons(PORT);
	server_address.sin_addr.s_addr = INADDR_ANY;
	
	int listener_socket = socket(AF_INET, SOCK_STREAM, 0);
	int yes = 1;

	setsockopt(listener_socket, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int));
	bind(listener_socket, (struct sockaddr*)&server_address, sizeof(server_address));
	listen(listener_socket, 5);
	return listener_socket;

}

void add_fd(int new_fd, struct pollfd *pfds[], int *fd_count, int *max_fd_size){
	if (*fd_count == *max_fd_size){
		*max_fd_size *=2;
		*pfds = realloc(*pfds, sizeof(**pfds) * (*max_fd_size));
	}
	(*pfds)[*fd_count].fd = new_fd;
	(*pfds)[*fd_count].events = POLLIN;
	(*fd_count)++;
	printf("New File Descriptor Added: %d\n", new_fd);
	
}
int get_ready_file_descriptor(int fd_count, struct pollfd *pfds){
	for (int i=0; i<fd_count; i++){
		if (pfds[i].revents & POLLIN){
			return pfds[i].fd;
		}
	}
}

void listen_for_pfds(int listener_socket, struct pollfd *pfds, int fd_count, int max_fd_size){
	printf("https://127.0.0.1:%d\n",PORT );
	while(1){
		printf("Listening to %d FDs..\n", fd_count);
		if (poll(pfds, fd_count, -1) < 0){
			perror("poll");
		}
		int ready_fd = get_ready_file_descriptor(fd_count, pfds);
		if (ready_fd == listener_socket){
			struct sockaddr_storage remoteaddr;
			socklen_t addrlen;
			addrlen = sizeof(remoteaddr);
			int newfd = accept(listener_socket,(struct sockaddr *)&remoteaddr, &addrlen);
			if (newfd == -1){
				perror("accept");
			}
			add_fd( newfd, &pfds,  &fd_count,  &max_fd_size);
		}
	}
}


