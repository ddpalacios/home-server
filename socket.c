#include <stdlib.h>
#include <stdio.h>
#include <poll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>
#include "client.h"
#include "HTTP.h"
#define PORT 9034
#define CLIENT_CERT "self_signed_cert.crt"
#define CLIENT_KEY "privateKey.key"
#define BUFFER_SIZE 2056

SSL* encrypt_socket(int fd){
	SSL_CTX *ssl_ctx;
	
	ssl_ctx = SSL_CTX_new(SSLv23_server_method());
	SSL_CTX_set_options(ssl_ctx, SSL_OP_SINGLE_DH_USE);
	int use_cert = SSL_CTX_use_certificate_file(ssl_ctx, CLIENT_CERT, SSL_FILETYPE_PEM);
	printf("CERT Loaded: %d\n", use_cert);
	int use_key = SSL_CTX_use_PrivateKey_file(ssl_ctx, CLIENT_KEY, SSL_FILETYPE_PEM);
	printf("KEY Loaded: %d\n", use_key);
	if (use_cert <=0 || use_key <=0){
		printf("ERROR LOADING SSL CERT OR KEY\n");
		exit(1);
	}
	SSL *cSSL = SSL_new(ssl_ctx);
	SSL_set_fd(cSSL, fd);
	
	int ssl_err = SSL_accept(cSSL);
	if (ssl_err <0) {
		printf("SSL ERROR %d ERROR ON ACCEPTING CSSL!!!\n", ssl_err);
		SSL_shutdown(cSSL);
		SSL_free(cSSL);
	}
	return cSSL;
}

void add_fd(int new_fd, struct pollfd *pfds[], struct Client *clients[],int *fd_count, int *max_fd_size){

	if (*fd_count == *max_fd_size){
		*max_fd_size *=2;
		*pfds = realloc(*pfds, sizeof(**pfds) * (*max_fd_size));
		*clients = realloc(*clients, sizeof(**clients) * (*max_fd_size));
	}

	(*pfds)[*fd_count].fd = new_fd;
	(*pfds)[*fd_count].events = POLLIN;

	if (*fd_count >  0){
		SSL *cSSL = encrypt_socket(new_fd);
		(*clients)[*fd_count].Id = new_fd;
		(*clients)[*fd_count].cSSL = cSSL;
		printf("New Client Added: %d\n", new_fd);
		
	}
	(*fd_count)++;
	printf("Total FDs created: %d\n", *fd_count);
	
}

void initialize_ssl(){
	SSL_library_init(); /* load encryption & hash algorithims for SSL*/
	SSL_load_error_strings(); /* load the error strings for good error reporting */
	printf("SSL Initialized!\n");
}

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

int get_ready_file_descriptor(int fd_count, struct pollfd *pfds){
	for (int i=0; i<fd_count; i++){
		if (pfds[i].revents & POLLIN){
			return pfds[i].fd;
		}
	}
}
void del_from_pfds(struct pollfd pfds[],struct Client clients[], int fd, int *fd_count){
	remove_client(fd_count, clients, fd);
	for (int i=0; i<*fd_count; i++){
		if (pfds[i].fd  == fd ) {
			pfds[i] = pfds[*fd_count-1];
			(*fd_count)--;
			printf("FD removed.\n");
			break;
		}
	}
}

void listen_for_pfds(int listener_socket, struct pollfd *pfds,struct Client *clients, int fd_count, int max_fd_size){
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
			add_fd( newfd, &pfds,  &clients,&fd_count,  &max_fd_size);
		}else{
			SSL* cSSL = get_client_socket(clients, fd_count,ready_fd);
			unsigned char *buf = malloc(BUFFER_SIZE);
			int nbytes = SSL_read(cSSL, buf, BUFFER_SIZE);

			if (nbytes == 0){
				if (nbytes == 0){
					printf("FD %d hung up\n", ready_fd);
				}else{
					perror("recv");
				}
				close(ready_fd);
				del_from_pfds(pfds,clients, ready_fd, &fd_count);
			}else{
				printf("Recieved %d bytes from client %d\n", nbytes, ready_fd);

				if (strncmp(buf, "GET ", 4) == 0){
					char *route = get_route(buf);
					printf("Route: '%s'\n", route);
					if (strcmp(route, "/") ==0){
						render_template("index.html", cSSL);
					}
				}
			}
			 buf[0] = '\0';
		}
	}
}
