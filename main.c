#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <poll.h>
#include "socket.h"


/*
 * FEATURE #1 Host URL & Port Number
 *
 * - Users should have the ability to visit application on any device with internet.
 * - User Log in is required
 * 
 * TODO 
 *  
 * - Host HTML file on reliable socket
 * - Obtain Certification to host locally & production
 * - Create Admin Page & keep track of users
 * - Store User information in SQL database (stretch goal)
 *
 * - Start Date: 2025-05-13
 *
 * - Due Date: 2025-05-24
 *
 * */


int main(){
	struct pollfd *pfds;
	int max_fd_size = 10;
	int fd_count = 0;
	pfds = malloc(sizeof(struct pollfd) * max_fd_size);
	int listener_socket = create_socket();
	add_fd(listener_socket, pfds, fd_count, max_fd_size);
	listen_for_pfds(pfds, fd_count, max_fd_size);
	return 0;
}
