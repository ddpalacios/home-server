#include  <cjson/cJSON.h>
#include <sys/socket.h>
#include <stdlib.h>
#include <stdio.h>
#include "Socket.h"
#include "route.h"
#include "server.h"
#include "FrameField.h"
#include "http_utilities.h"
#include "json_utilities.h"
#include "send_message.h"
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

// SSL_CTX *initialize_ssl(void){
// 	SSL_library_init();
// 	SSL_load_error_strings();
// 	OpenSSL_add_all_algorithms();
// 	const SSL_METHOD *method = TLS_client_method();
// 	SSL_CTX *cSSL = SSL_CTX_new(method);
// 	return cSSL;
// }

// SSL* SSL_connect_to_server( int sfd,const char*host){
// 	SSL_CTX *ctx = initialize_ssl();
// 	SSL *cSSL = SSL_new(ctx);
// 	SSL_set_fd(cSSL, sfd);
// 	SSL_set_tlsext_host_name(cSSL, host);
// 	const int cSSL_status  = SSL_connect(cSSL);
// 	if (cSSL_status < 0){
// 		ERR_print_errors_fp(stderr);
//         return NULL;
// 	}
//     return cSSL;
// }

// struct Server connect_to_server(const char* host, const char* port){
//     struct Server server;
// 	struct addrinfo hints;
// 	struct addrinfo *addrs_res;
// 	memset(&hints, 0, sizeof(hints));
// 	char ipstr[IPSTRLEN];
// 	hints.ai_family = AF_INET;
// 	hints.ai_socktype = SOCK_STREAM;
// 	hints.ai_protocol = IPPROTO_TCP;
// 	const int status = getaddrinfo(host, port, &hints, &addrs_res);
// 	int sfd, connected;
// 	for (struct addrinfo *addr = addrs_res; addr != NULL; addr = addr->ai_next){
// 		if (addr->ai_family == AF_INET) {
// 			struct sockaddr_in *ipv4 = (struct sockaddr_in *)addr->ai_addr;
// 			void *addr4 = &(ipv4->sin_addr);
// 			inet_ntop(addr->ai_family, addr4, ipstr, IPSTRLEN);
// 		}else{
// 			struct sockaddr_in6 *ipv6 = (struct sockaddr_in6 *)addr->ai_addr;
// 			void* addr6 = &(ipv6->sin6_addr);
// 			inet_ntop(addr->ai_family, addr6, ipstr, IPSTRLEN);
// 		}
// 		sfd = socket(addr->ai_family, addr->ai_socktype, addr->ai_protocol);
// 		if (sfd < 0){
// 			printf("Error connecting to socket with host: '%s' at '%s'\n", host, ipstr);
// 			break;
// 		}
// //		printf("Connecting to %s with socket %d...\n",  ipstr, sfd);
// 		connected = connect(sfd, addr->ai_addr, addr->ai_addrlen);
// //		printf("Is Connected: %d\n", connected);
// 		if (connected == 0){
// //			printf("Successfully connected to '%s'\n", host);
// 			break;
// 		}else{
// 			printf("Error connecting to host: '%s' at '%s'\n",host, ipstr);
// 			break;
// 		}
// 	 }
//      freeaddrinfo(addrs_res); 
// 	if (sfd>=0 && connected==0){
// 	        SSL *cSSL = SSL_connect_to_server(sfd ,host);
//             server.fd = sfd;
//             server.cSSL = cSSL;
//             server.ip_addr = ipstr;
//             server.port = port;
//             server.hostname = host;
//             return server;
// 	}
// }

// void send_to_server(char* ip_addr, char*port, char*payload, char**response){
//     struct Server database_server =  connect_to_server(ip_addr, port);
//     int message_sent = send_tcp_message(database_server.cSSL,0x1,strlen(payload), payload);
//     read_tcp_message(database_server.cSSL, &(*response));
//     SSL_shutdown(database_server.cSSL);
//     SSL_free(database_server.cSSL);
//     close(database_server.fd);
// }
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

void insert_file_descriptor(struct Socket *sockets[],struct pollfd *pfds[],int fd, SSL *cSSL,char* hostname,int *fd_count, int *max_fd_size){
	 if (*fd_count == *max_fd_size){
	 	*max_fd_size *=2;
	 	*pfds = realloc(*pfds, sizeof(**pfds) * (*max_fd_size));
                *sockets = realloc(*sockets, sizeof(**sockets) * (*max_fd_size));
	 }
    static char ipstr[INET6_ADDRSTRLEN];
    struct sockaddr_storage addr;
    struct sockaddr_in *s = (struct sockaddr_in *)&addr;
    inet_ntop(AF_INET, &s->sin_addr, ipstr, sizeof(ipstr));
    (*pfds)[*fd_count].fd = fd;
    (*pfds)[*fd_count].events = POLLIN;
    (*sockets)[*fd_count].fd = fd;
    (*sockets)[*fd_count].keep_alive = 0x0;
    (*sockets)[*fd_count].ip_addr = strdup(ipstr);
    (*sockets)[*fd_count].cSSL = cSSL;
    (*fd_count)++;
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
		     printf("Socket %d has triggered\n", fd);
 			return fd;
 		}
     }
     printf("NO EVENT IN POLLING\n");
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
       getnameinfo((struct sockaddr*)&remoteaddr, sizeof(remoteaddr),host,sizeof(host), service, sizeof(service),0 );
       if (cSSL != NULL){
         insert_file_descriptor(sockets, pfds, newfd,cSSL, host,  fd_count, max_fd_size);
         return newfd;
       }else{
	 close(newfd);
         printf("ERROR Creating SSL Encryption and was not added for fd %d\n", newfd);
         return 0;
       }
      
     }

void fill_address_info(struct addrinfo *hints){
	memset(&(*hints), 0, sizeof(*hints));
	hints->ai_family = AF_INET;
	hints->ai_socktype = SOCK_STREAM;
	hints->ai_flags= AI_PASSIVE;
}

void start_listening_for_clients(char* port){
        SSL_library_init(); 
        SSL_load_error_strings(); 
        struct addrinfo hints;
        fill_address_info(&hints);
        int max_socket_size = 10;
        int fd_count = 0;
        struct Socket *sockets = malloc(sizeof(struct Socket) * max_socket_size);
        struct pollfd *pfds =  malloc(sizeof(struct pollfd) * max_socket_size);
        int listener_fd = bind_address_to_port(port,hints);
        for (int i=0; i<fd_count; i++){
	 struct Socket *socket = &sockets[i];
	 if (socket->fd == listener_fd){socket->keep_alive=0x1; continue;}
	 socket->keep_alive = 0x0;
        }
        insert_file_descriptor(&sockets,&pfds, listener_fd,NULL,"localhost", &fd_count, &max_socket_size);
        while(1){
	     for (int i=0; i<fd_count; i++){
		 struct Socket *socket = &sockets[i];
		 printf("Socket %d availiable\n", socket->fd);
	     }
             printf("\nwaiting for clients to connect...\n");
             int triggered_fd = wait_for_event(&pfds, fd_count);
             if (triggered_fd == listener_fd){
                 int newfd = accept_new_client(listener_fd, &sockets, &pfds, &fd_count, &max_socket_size);
                 if (!newfd){
                         printf("ERROR ACCEPTING new socket\n");
                 }else{
                         printf("New client accepted: %d\n", newfd);
                 }
	     }else{
		 for (int i=0; i<fd_count; i++){
			 struct Socket *socket = &sockets[i];
			 SSL* cSSL  = sockets[i].cSSL;
			 if (socket->fd != triggered_fd){
				 continue;
			 }
                         char *peek_buf = malloc(BUFFER_SIZE);
			 int bytes_peeked = peek_exact_bytes(cSSL, BUFFER_SIZE, peek_buf);
			 if (bytes_peeked <=0){
				socket->keep_alive = 0x0;
				 remove_file_descriptor(sockets,pfds, socket->fd, &fd_count);
			 }else{
				 peek_buf[bytes_peeked] = '\0';
				 process_bytes(socket, peek_buf);
				 if (peek_buf != NULL){
					 free(peek_buf);
					 peek_buf = NULL;
				 }
			 if (!socket->keep_alive){
				 remove_file_descriptor(sockets,pfds, socket->fd, &fd_count);
				 }
			 }
		 }
	     }
        }
    }
