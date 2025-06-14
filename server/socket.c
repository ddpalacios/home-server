#include <arpa/inet.h>
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
#include "../models/Client_Connection.h" 
#include "route.h" 
#include "websocket.h" 
#include "http_utilities.h" 
#include "os_utilities.h" 
#define PORT 9034
#define CLIENT_CERT "../server/self_signed_cert.crt"
#define CLIENT_KEY "../server/privateKey.key"
#define BUFFER_SIZE 5056


char*  get_peer_name(int fd){
	socklen_t len;
	struct sockaddr_storage addr;
	static char ipstr[INET6_ADDRSTRLEN];
	int port;
	len = sizeof(addr);
	getpeername(fd, (struct sockaddr*)&addr, &len);
	if (addr.ss_family == AF_INET){
		struct sockaddr_in *s = (struct sockaddr_in *)&addr;
		port = ntohs(s->sin_port);
		inet_ntop(AF_INET, &s->sin_addr, ipstr, sizeof(ipstr));
	}else{
		struct sockaddr_in6 *s = (struct sockaddr_in6 *)&addr;
		port = ntohs(s->sin6_port);
		inet_ntop(AF_INET6, &s->sin6_addr, ipstr, sizeof(ipstr));

	}
	// printf("Peer IP Address: %s\n", ipstr);
	// printf("Peer Port      : %d\n", port);
	return ipstr;

}

void initialize_ssl(){
	SSL_library_init(); 
	SSL_load_error_strings(); 
}

int get_ready_file_descriptor(int fd_count, struct pollfd *pfds){
	for (int i=0; i<fd_count; i++){
		if (pfds[i].revents & POLLIN){
			return pfds[i].fd;
		}
	}
}

SSL* encrypt_socket(int fd){
	SSL_CTX *ssl_ctx;
	ssl_ctx = SSL_CTX_new(SSLv23_server_method());
	SSL_CTX_set_options(ssl_ctx, SSL_OP_SINGLE_DH_USE);
	int use_cert = SSL_CTX_use_certificate_file(ssl_ctx, CLIENT_CERT, SSL_FILETYPE_PEM);
	int use_key = SSL_CTX_use_PrivateKey_file(ssl_ctx, CLIENT_KEY, SSL_FILETYPE_PEM);
	if (use_cert <=0 || use_key <=0){
		printf("ERROR LOADING SSL CERT OR KEY\n");
		exit(1);
	}
	SSL *cSSL = SSL_new(ssl_ctx);
	SSL_set_fd(cSSL, fd);
	
	int ssl_err = SSL_accept(cSSL);
	if (ssl_err <0) {
		int err = SSL_get_error(cSSL, ssl_err);
		printf("SSL ERROR %d | %d ERROR ON ACCEPTING CSSL!!!\n", ssl_err, err);

		SSL_shutdown(cSSL);
		SSL_free(cSSL);
		return NULL;
	}
	return cSSL;
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

void add_fd(int new_fd, struct pollfd *pfds[], struct Client *clients[],int *fd_count, int *max_fd_size){
	if (*fd_count == *max_fd_size){
		*max_fd_size *=2;
		*pfds = realloc(*pfds, sizeof(**pfds) * (*max_fd_size));
		*clients = realloc(*clients, sizeof(**clients) * (*max_fd_size));
	}
	SSL *cSSL = NULL;
	if (*fd_count >=  1){
		cSSL = encrypt_socket(new_fd);
	}
	if (cSSL != NULL){
		(*clients)[*fd_count].Id = new_fd;
		(*clients)[*fd_count].cSSL = cSSL;
		(*pfds)[*fd_count].fd = new_fd;
		(*pfds)[*fd_count].events = POLLIN;
		(*fd_count)++;
		char* ip_addr = get_peer_name(new_fd);
		struct ClientConnection cc = create_client_connection(ip_addr, new_fd);
		insert_client_connection(cc);
		printf("Total FDs: %d | ID: %d\n", *fd_count, new_fd);


	}else{
		if (*fd_count == 0){
			(*clients)[*fd_count].Id = new_fd;
			(*clients)[*fd_count].cSSL = cSSL;
			(*pfds)[*fd_count].fd = new_fd;
			(*pfds)[*fd_count].events = POLLIN;
			(*fd_count)++;
			char* ip_addr = get_peer_name(new_fd);
			struct ClientConnection cc = create_client_connection(ip_addr, new_fd);
			insert_client_connection(cc);
		}else{
			close(new_fd);
		}
	}


}

void del_from_pfds(struct pollfd pfds[],struct Client clients[], int fd, int *fd_count){
	printf("Total FDS: %d\n", (*fd_count));
	remove_client(fd_count, clients, fd);
	for (int i=0; i<*fd_count; i++){
		if (pfds[i].fd  == fd ) {
			pfds[i] = pfds[*fd_count-1];
			(*fd_count)--;
			delete_connection_by_fd(fd);
			printf("FD removed. Total:  %d\n", (*fd_count));
		//printf("Found ready fd %d\n", ready_fd);
			break;
		}
	}
}



int listen_for_pfds(int fd_count, int max_fd_size){
	initialize_ssl();
	struct Client *clients;
	clients = malloc(sizeof(*clients) * max_fd_size);
	struct pollfd *pfds = malloc(sizeof(*pfds) * max_fd_size);
	int listener_socket = create_socket();
	add_fd(listener_socket,&pfds,&clients, &fd_count, &max_fd_size);
	printf("https://127.0.0.1:%d/life-of-sounds/login\n",PORT);
	while(1){
		// printf("Listening to %d FDs..\n", fd_count);
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
			// printf("Incoming New FD! %d\n", newfd);
			add_fd( newfd, &pfds,  &clients,&fd_count,  &max_fd_size);
		}else{

			SSL* cSSL = get_client_socket(clients, fd_count,ready_fd);
			 char *buf = malloc(BUFFER_SIZE);
			int nbytes = SSL_read(cSSL, buf, BUFFER_SIZE);
			
			if (nbytes <= 0){
				if (nbytes == 0){
					printf("FD %d hung up\n", ready_fd);
				}else{
					perror("recv");
				}
				close(ready_fd);
				del_from_pfds(pfds,clients, ready_fd, &fd_count);
			}else{
				if (strstr(buf, "HTTP/1.1")!= NULL){
					char  *request_type = malloc(5076);
					char  *route = malloc(5076);
					strcpy(request_type, buf);
					strcpy(route, buf);
					char* type_end = strchr(request_type, ' ');
					*type_end = '\0';
					route += strlen(request_type)+1;
					char* route_end = strchr(route, ' ');
					*route_end = '\0';
					process_route(cSSL, buf, request_type, route, ready_fd);
					char* websocket_key = get_header_value(buf,"Sec-WebSocket-Key");
					if (strlen(websocket_key) == 0){
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);
					}
					buf[0] = '\0';
				}

				if (is_websocket_buffer(buf)){
					char message[BUFFER_SIZE];
					 int payload_length = decode_websocket_buffer(buf, message);
					 printf("Websocket Message len: %d\n", payload_length);
					 printf("Websocket Message: %s\n", message);
					int opcode = buf[0] & 0x0F;
					char frame[5+payload_length];
					frame[0] = opcode;
					frame[1] = (payload_length >> 24) & 0xFF;
					frame[2] = (payload_length >> 16) & 0xFF;
					frame[3] = (payload_length >> 8) & 0xFF;
					frame[4] = payload_length & 0xFF; 
					memcpy(&frame[5], message, payload_length);

					for (int i=0; i < fd_count; i++){
						 int Id = clients[i].Id;
						 if (Id != listener_socket && Id != ready_fd){
							 SSL* target_cSSL = clients[i].cSSL;
							 SSL_write(target_cSSL, frame, 5+payload_length);
						 }
					}
					create_directory("test/");
					FILE* fptr = fopen("test/test.webm", "ab");
					fwrite(message, 1, payload_length, fptr);
					fclose(fptr);
				}
			}
		}
	}
}

