#include  <cjson/cJSON.h>
#include <pthread.h>
#include <sys/socket.h>
#include <stdlib.h>
#include <stdio.h>
#include "Socket.h"
#include "route.h"
#include "server.h"
#include "FrameField.h"
#include "http_utilities.h"
#include "json_utilities.h"
#include "string_utilities.h"
#include "User_Token.h"
#include "send_message.h"
#include "WebsocketClient.h"
#include "read_message.h"
#include <sys/types.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>
#include <stdio.h>
#include <string.h>
#include <netdb.h>
#include <poll.h>
#define BUFFER_SIZE 1024 
#define IPSTRLEN INET6_ADDRSTRLEN
struct Socket *sockets;
struct pollfd *pfds;
int fd_count;
int bind_address_to_port(char* port,struct addrinfo hints){
    struct addrinfo *res;
	getaddrinfo(NULL, port, &hints, &res);
	int sockfd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (sockfd < 0){
        printf("Error creating socket\n");
        exit(1);
    }
	int yes =1;
	setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int));
	if (bind(sockfd, res->ai_addr, res->ai_addrlen) < 0){
        printf("ERROR in BIND\n");
        exit(1);

    }
	if (listen(sockfd, 5) <  0){
        printf("ERROR in LISTEN\n");
        exit(1);
    }
    printf("Listening on port %s\n", port);
    return sockfd;
}

struct Socket insert_file_descriptor(struct Socket *sockets[],struct pollfd *pfds[],int fd, SSL *cSSL,char* hostname,int *fd_count, int *max_fd_size, int is_listener){
	 if (*fd_count == *max_fd_size){
	 	*max_fd_size *=2;
	 	*pfds = realloc(*pfds, sizeof(**pfds) * (*max_fd_size));
                *sockets = realloc(*sockets, sizeof(**sockets) * (*max_fd_size));
	 }
    unsigned char* socket_id = malloc(16);	
    create_unique_identifier(socket_id);
    char socketId_hex[33];
    hash_to_hex(socket_id, 16, socketId_hex);
    static char ipstr[INET6_ADDRSTRLEN];
    (*pfds)[*fd_count].fd = fd;
    (*pfds)[*fd_count].events = POLLIN;
    (*sockets)[*fd_count].fd = fd;
    (*sockets)[*fd_count].Id = strdup(socketId_hex);
    (*sockets)[*fd_count].keep_alive = 0x0;
    (*sockets)[*fd_count].is_listener = is_listener;
    (*sockets)[*fd_count].cSSL = cSSL;
    struct Socket socket = (*sockets)[*fd_count]; 
    (*fd_count)++;
	// printf("NEW SOCKET ID %s\n", socketId_hex);
    return socket;
}

 int wait_for_event(struct pollfd *pfds[], int fd_count){
     // blocks main thread & waits for an event from file descriptor
     if (poll(*pfds, fd_count, -1) < 0){
         perror("poll");
         printf("Error in POLLING\n");
         return 0;
     }
     for (int i=0; i<fd_count; i++){
 		if ((*pfds)[i].revents & POLLIN){
			int fd =  (*pfds)[i].fd;
 			return fd;
 		}
     }
     return 0;
}

 void remove_file_descriptor(struct Socket *sockets,struct pollfd pfds[], int fd, int *fd_count){
 	for (int i=0; i<*fd_count; i++){
 		if (sockets[i].fd  == fd) {
			int ret = SSL_shutdown(sockets[i].cSSL);
			if (ret == 0) {
			    ret = SSL_shutdown(sockets[i].cSSL);
			}
			SSL_free(sockets[i].cSSL);
		        close(fd);
			sockets[i].cSSL = NULL;
 			sockets[i] = sockets[*fd_count-1];
 			break;
 		}
 	}
 	for (int i=0; i<*fd_count; i++){
 		if (pfds[i].fd  == fd) {
 			pfds[i] = pfds[*fd_count-1];
 			(*fd_count)--;
 			printf("FD removed. Total:  %d\n", (*fd_count));
 			printf("\n---------------\n\n");
 			break;
 		}
 	}
 }

 int accept_new_client(int listener_fd, struct Socket **sockets,struct pollfd *pfds[],int *fd_count, int *max_fd_size){
       struct sockaddr_storage remoteaddr;
       socklen_t addrlen;
       addrlen = sizeof(remoteaddr);
       int newfd = accept(listener_fd,(struct sockaddr *)&remoteaddr,  &addrlen);
       SSL* cSSL = encrypt_socket(newfd);
       char host[NI_MAXHOST];
       char service[NI_MAXSERV];
       if (cSSL != NULL){
         insert_file_descriptor(sockets, pfds, newfd,cSSL, host,  fd_count, max_fd_size, 0x0);
         return newfd;
       }else{
	 close(newfd);
         return 0;
       }

     }

void fill_address_info(struct addrinfo *hints){
	memset(&(*hints), 0, sizeof(*hints));
	hints->ai_family = AF_INET;
	hints->ai_socktype = SOCK_STREAM;
	hints->ai_flags= AI_PASSIVE;
}

void* process_thread(void* arg){
	int *triggered_fd = (int*) arg;
	 printf("Triggered: %d\n", *triggered_fd);
	 for (int i=0; i<fd_count; i++){
		 struct Socket *socket = &sockets[i];
		 SSL* cSSL  = sockets[i].cSSL;
		 if (socket->fd != *triggered_fd){
			 continue;
		 }
		 char *peek_buf = malloc(BUFFER_SIZE+1);
		 int bytes_peeked = peek_exact_bytes(cSSL, BUFFER_SIZE, peek_buf);
		 if (bytes_peeked <=0){
			socket->keep_alive = 0x0;
			 remove_file_descriptor(sockets,pfds, socket->fd, &fd_count);
		 }else{
			 if (peek_buf != NULL){
				 process_bytes(sockets, socket, peek_buf, fd_count);
				 free(peek_buf);
				 peek_buf = NULL;
			 }
		 if (!socket->keep_alive){
			 remove_file_descriptor(sockets,pfds, socket->fd, &fd_count);
			 }
		 }
	 }
	/*
    struct Socket *socket = (struct Socket *)arg; 
    SSL *cSSL = socket->cSSL;
    char *peek_buf = malloc(BUFFER_SIZE+1);
    int bytes_peeked = peek_exact_bytes(cSSL, BUFFER_SIZE, peek_buf);
    if (bytes_peeked <=0){
	 socket->keep_alive = 0x0;
	 remove_file_descriptor(sockets,pfds, socket->fd, &fd_count);
    }else{
	 if (peek_buf != NULL){
		 process_bytes(sockets, socket, peek_buf, fd_count);
		 free(peek_buf);
		 peek_buf = NULL;
	 }
     if (!socket->keep_alive){
	 remove_file_descriptor(sockets,pfds, socket->fd, &fd_count);
	 }
      }
      */
    pthread_exit(NULL); 
}

void start_listening_for_clients(char* port){
        SSL_library_init(); 
        SSL_load_error_strings(); 
        struct addrinfo hints;
        fill_address_info(&hints);
        int max_socket_size = 10;
        fd_count = 0;
        sockets = malloc(sizeof(struct Socket) * max_socket_size);
        pfds =  malloc(sizeof(struct pollfd) * max_socket_size);
        int listener_fd = bind_address_to_port(port,hints);
        for (int i=0; i<fd_count; i++){
	 struct Socket *socket = &sockets[i];
	 socket->keep_alive = 0x0;
        }
        insert_file_descriptor(&sockets,&pfds, listener_fd,NULL,"localhost", &fd_count, &max_socket_size, 0x1);
        while(1){
		 delete_expired_tokens();
                 int triggered_fd = wait_for_event(&pfds, fd_count);
	         if (triggered_fd == listener_fd){
                 int newfd = accept_new_client(listener_fd, &sockets, &pfds, &fd_count, &max_socket_size);
                 if (!newfd){
                 }else{
			 printf("FD Count: %d\n", fd_count);
                 }
	     }else{
			 for (int i=0; i<fd_count; i++){
				 struct Socket *socket = &sockets[i];
				 SSL* cSSL  = sockets[i].cSSL;
				 if (socket->fd != triggered_fd){
					 continue;
				 }
				 char *peek_buf = malloc(BUFFER_SIZE+1);
				 int bytes_peeked = peek_exact_bytes(cSSL, BUFFER_SIZE, peek_buf);
				 if (bytes_peeked <=0){
					socket->keep_alive = 0x0;
					 remove_file_descriptor(sockets,pfds, socket->fd, &fd_count);
				 }else{
					 if (peek_buf != NULL){
						 process_bytes(sockets, socket, peek_buf, fd_count);
						 free(peek_buf);
						 peek_buf = NULL;
					 }
				 if (!socket->keep_alive){
					 if (websocketclient_exists_by_socketid(socket->Id)){
						 struct WebsocketClient ws_client =  get_websocketclientBySocketId(socket->Id);
						delete_websocketclient_by_Id(ws_client.Id);
					 }
					 remove_file_descriptor(sockets,pfds, socket->fd, &fd_count);
					 }
				 }
			 }
	     }
	}
}
