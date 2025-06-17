
#include <sys/socket.h>
#include "socket.h"
#include "SQL.h"
#include <sys/types.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>
#define CLIENT_CERT "../server/self_signed_cert.crt"
#define CLIENT_KEY "../server/privateKey.key"
#define BUFFER_SIZE 5056

/*
#include <arpa/inet.h>
#include <stdlib.h>
#include <stdio.h>
#include <poll.h>
#include <netinet/in.h>
#include <unistd.h>
#include "client.h" 
#include "../models/Client_Connection.h" 
#include "route.h" 
#include "websocket.h" 
#include "http_utilities.h" 
#include "os_utilities.h" 

*/

void get_socket_info(struct Socket *socket){
	int sockfd = socket->Id;
	socklen_t len;
	struct sockaddr_storage addr;
	static char ipstr[INET6_ADDRSTRLEN];
	int port;
	len = sizeof(addr);
	getpeername(sockfd, (struct sockaddr*)&addr, &len);
	struct sockaddr_in *s = (struct sockaddr_in *)&addr;
	port = ntohs(s->sin_port);
	inet_ntop(AF_INET, &s->sin_addr, ipstr, sizeof(ipstr));
	printf("Socket         : %d\n", sockfd);
	printf("Peer IP Address: %s\n", ipstr);
	printf("Peer Port      : %d\n", port);

	socket->ip_addr=strdup(ipstr);
	socket->PORT = port; 
	socket->isEncrypted = 0;
	socket->isClient = 0;
	socket->type = strdup("listener");

}
void bind_and_listen_socket(struct addrinfo hints, char* PORT, struct Socket *new_socket){
	struct addrinfo *res;
	getaddrinfo(NULL, PORT, &hints, &res);
	int sockfd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
	int yes =1;
	setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int));
	bind(sockfd, res->ai_addr, res->ai_addrlen);
	listen(sockfd, 5);
	new_socket->Id = sockfd;
	char host[NI_MAXHOST];	
	char service[NI_MAXSERV];
	getnameinfo((struct sockaddr*)&hints, sizeof(hints),host,sizeof(host), service, sizeof(service),0 );
	new_socket->hostname = strdup(host);
	new_socket->service = strdup(service);
	get_socket_info(new_socket);
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

int get_ready_file_descriptor(int fd_count, struct pollfd *pfds){
	for (int i=0; i<fd_count; i++){
		if (pfds[i].revents & POLLIN){
			return pfds[i].fd;
		}
	}
}
void insert_socket(struct Socket *new_socket){
	int new_fd = new_socket->Id;
	char sql[576];
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	snprintf(sql, sizeof(sql),
			"INSERT INTO socket VALUES('%d', '%s', '%d', '%s' , '%s', '%d', '%d')",
			new_fd
			,new_socket->ip_addr
	       		,new_socket->PORT
			,new_socket->type
			,new_socket->hostname
			,new_socket->isEncrypted
			,new_socket->isClient);

	query(conn, sql);
	close_sql_connection(conn);
}

void insert_fd(struct pollfd *pfds[],struct Socket *sockets, struct Socket *socket, int *fd_count, int *max_fd_size){
	int new_fd = socket->Id;
	if (*fd_count == *max_fd_size){
		*max_fd_size *=2;
		*pfds = realloc(*pfds, sizeof(**pfds) * (*max_fd_size));
		struct Socket *tmp = realloc(sockets, (*max_fd_size) * sizeof(struct Socket));
		sockets = tmp;
	}

	if (*fd_count == 0){
		(*pfds)[*fd_count].fd = new_fd;
		(*pfds)[*fd_count].events = POLLIN;

		sockets[*fd_count] = (*socket);
		(*fd_count)++;
		insert_socket(socket);
		printf("New fd count: %d\n", *fd_count);

	}else if (*fd_count > 0){
		SSL* cSSL = encrypt_socket(new_fd);
		if (cSSL !=NULL){
			(*socket).cSSL = cSSL;
			(*socket).type = "client";
			(*socket).isClient = 1; 
			(*socket).isEncrypted = 1; 
			(*pfds)[*fd_count].fd = new_fd;
			(*pfds)[*fd_count].events = POLLIN;
			sockets[*fd_count] = (*socket);
			(*fd_count)++;
			insert_socket(socket);
			printf("New fd count: %d\n", *fd_count);
		
		}else{
			close(new_fd);
		}
	
	}
}


void delete_socket(struct pollfd pfds[],struct Socket *sockets, struct Socket *socket, int *fd_count){
	char sql[576];
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	printf("Total FDS: %d\n", (*fd_count));
	for (int i=0; i<*fd_count; i++){
		if (pfds[i].fd  == socket->Id) {
			sockets[i] = sockets[*fd_count-1];
			pfds[i] = pfds[*fd_count-1];
			(*fd_count)--;
			printf("FD removed. Total:  %d\n", (*fd_count));
			snprintf(sql, sizeof(sql), "DELETE FROM socket WHERE Id = %d", socket->Id);
			query(conn, sql);
			close_sql_connection(conn);
			break;
		}
	}

}
struct Socket  get_socket(struct Socket *sockets, int fd, int *fd_count){
	for (int i=0; i<*fd_count; i++){
		if (sockets[i].Id == fd){
			return sockets[i];
		}
	}


}

 int read_socket_buffer(struct Socket *socket){
	char *buf = malloc(BUFFER_SIZE);
	int nbytes = SSL_read(socket->cSSL, buf, BUFFER_SIZE);
	if (nbytes <= 0){
		if (nbytes == 0){
			printf("FD %d hung up\n", socket->Id);
			return 0 ;
		}else{
			return 0; 
		}
	}
	return nbytes;
}

void listen_for_clients(struct Socket *sockets,struct Socket *server_socket,int *fd_count, int *max_fd_size){
	SSL_library_init(); 
	SSL_load_error_strings(); 
	int port = 9035;
	struct pollfd *pfds = malloc(sizeof(struct pollfd) * (*max_fd_size));
	insert_fd(&pfds,sockets,server_socket, fd_count,max_fd_size);
	while(1){
		if (poll(pfds, *(fd_count), -1) < 0){
			perror("poll");
		}
		int ready_fd = get_ready_file_descriptor(*fd_count, pfds);
		if (ready_fd == server_socket->Id){
			struct sockaddr_storage remoteaddr;
			socklen_t addrlen;
			addrlen = sizeof(remoteaddr);
			int newfd = accept(server_socket->Id,(struct sockaddr *)&remoteaddr, &addrlen);
			struct Socket *new_socket = malloc(sizeof(struct Socket));
			char host[NI_MAXHOST];	
			char service[NI_MAXSERV];
			getnameinfo((struct sockaddr*)&remoteaddr, sizeof(remoteaddr),host,sizeof(host), service, sizeof(service),0 );
			new_socket->hostname = strdup(host);
			new_socket->service = strdup(service);
			new_socket->Id = newfd;
			get_socket_info(new_socket);
			insert_fd(&pfds,sockets, new_socket, fd_count,max_fd_size);
		}else{
			struct Socket ready_socket;
			ready_socket = get_socket(sockets, ready_fd, fd_count);
			printf("Found SOCKET: %d\n", ready_socket.Id); 
			int nbytes =  read_socket_buffer(&ready_socket);
			if (nbytes == 0){
				close(ready_fd);
				delete_socket(pfds, sockets, &ready_socket, fd_count);
			}else{
				printf("Recieved: %d Bytes from %s\n", nbytes, ready_socket.hostname);
			}
		}
	}
}
	/*
	printf("Listening on 10.0.0.213:%d ...\n",port);
	while(1){
		for (int i=0; i<*fd_count; i++){
			printf("FD %d\n", pfds[i].fd);
		
		}
		printf("Listening to %d FDs..\n", *(fd_count));
		if (poll(pfds, *(fd_count), -1) < 0){
			perror("poll");
		}
		int ready_fd = get_ready_file_descriptor(*fd_count, pfds);
		if (ready_fd == server_socket->Id){
			printf("ID %d Received data\n", ready_fd);
			struct sockaddr_storage remoteaddr;
			socklen_t addrlen;
			addrlen = sizeof(remoteaddr);
			int newfd = accept(server_socket->Id,(struct sockaddr *)&remoteaddr, &addrlen);
			struct Socket *new_socket = malloc(sizeof(struct Socket));
			new_socket->Id = newfd;
			get_socket_info(new_socket);
			insert_socket(new_socket);
			insert_fd(&pfds,sockets, newfd, fd_count,max_fd_size);
		}else{
		
		}
	}
	*/
	/*
	pfds[0] = *(sockets[0].pollfd);
	*(fd_count)++;
	int listener =server_socket->pollfd->fd; 
	pfds[0] = *(sockets[0].pollfd);

	while(1){
		printf("Listening to %d FDs..\n", *(fd_count));
		if (poll(pfds, *(fd_count), -1) < 0){
			perror("poll");
		}
		int ready_fd = get_ready_file_descriptor(sockets, fd_count);
		if (ready_fd == listener){
			printf("Detected new FD\n");
			struct sockaddr_storage remoteaddr;
			socklen_t addrlen;
			addrlen = sizeof(remoteaddr);
			int newfd = accept(listener,(struct sockaddr *)&remoteaddr, &addrlen);
			if (newfd == -1){
				perror("accept");
			}
			struct Socket *new_socket = malloc(sizeof(struct Socket));
			new_socket->Id = newfd;
			get_socket_info(new_socket);
			insert_socket(sockets,new_socket,fd_count, max_fd_size);

		}
	}
	*/
	/*
	while(1){
		printf("Listening to %d FDs..\n", *(fd_count));
		if (poll(pfds, *(fd_count), -1) < 0){
			perror("poll");
		}
		int ready_fd = get_ready_file_descriptor(sockets, fd_count);
		if (ready_fd == listener){
			struct sockaddr_storage remoteaddr;
			socklen_t addrlen;
			addrlen = sizeof(remoteaddr);
			int newfd = accept(listener,(struct sockaddr *)&remoteaddr, &addrlen);
			if (newfd == -1){
				perror("accept");
			}
			 printf("Incoming New FD! %d\n", newfd);
			 struct Socket *new_socket = malloc(sizeof(struct Socket));
			 new_socket->Id = newfd;
			 get_socket_info(new_socket);
			 insert_socket(sockets, new_socket, fd_count, max_fd_size);
		
		}
	}
	*/

	/*
		(*pfds)[*fd_count].fd = new_fd;
		(*pfds)[*fd_count].events = POLLIN;
		(*fd_count)++;
	char sql[576];
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	snprintf(sql, sizeof(sql),
			"INSERT INTO socket VALUES('%d', '%s', '%d', '%s' , '%s', '%d', '%d')",
			new_fd
			,socket.ip_addr
	       		,socket.PORT
			,socket.type
			,socket.hostname
			,socket.isEncrypted
			,socket.isClient);
	
	if (*fd_count == *max_fd_size){
		*max_fd_size *=2;
		*pfds = realloc(*pfds, sizeof(**pfds) * (*max_fd_size));
		*clients = realloc(*clients, sizeof(**clients) * (*max_fd_size));
	}
	SSL *cSSL = NULL;
	if (*fd_count >=  1){
		//cSSL = encrypt_socket(new_fd);
	}
	if (cSSL != NULL){
		(*clients)[*fd_count].Id = new_fd;
		(*clients)[*fd_count].cSSL = cSSL;
		(*clients)[*fd_count].isNew = 1;
		(*pfds)[*fd_count].fd = new_fd;
		(*pfds)[*fd_count].events = POLLIN;
		(*fd_count)++;


	}else{
		if (*fd_count == 0){
			(*pfds)[*fd_count].fd = new_fd;
			(*pfds)[*fd_count].events = POLLIN;
			(*fd_count)++;
			printf("SQL %s\n", sql);
			query(conn, sql);

		}else{
			close(new_fd);
		}
	}
	close_sql_connection(conn);

	*/


	/*
int create_socket(struct  addrinfo hints){
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
	*/

/*
}

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

void add_fd(int new_fd,char*type, struct pollfd *pfds[], struct Client *clients[],int *fd_count, int *max_fd_size){
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
		(*clients)[*fd_count].isNew = 1;
		(*pfds)[*fd_count].fd = new_fd;
		(*pfds)[*fd_count].events = POLLIN;
		(*fd_count)++;
		char* ip_addr = get_peer_name(new_fd);
		struct ClientConnection cc = create_client_connection(ip_addr, new_fd);
		cc.client_type = type;
		insert_client_connection(cc);
		printf("Total FDs: %d | ID: %d\n", *fd_count, new_fd);


	}else{
		if (*fd_count == 0){
			(*clients)[*fd_count].Id = new_fd;
			(*clients)[*fd_count].cSSL = cSSL;
			(*clients)[*fd_count].isNew = 0;
			(*pfds)[*fd_count].fd = new_fd;
			(*pfds)[*fd_count].events = POLLIN;
			(*fd_count)++;
			char* ip_addr = get_peer_name(new_fd);
			struct ClientConnection cc = create_client_connection(ip_addr, new_fd);
			cc.client_type = type;
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


void create_websocket_frame(char* message, int len, int opcode,struct Client clients[], int fd, int fd_count, int listener_socket){
	printf("framing %s\n", message);
	if (len < 126){
	   char frame[2 + len];
	  	frame[0] = 0x81;
	  frame[1] = len;
	memcpy(&frame[2], message, len);
	  	for (int i=0; i < fd_count; i++){
				int Id = clients[i].Id;
				if (Id != listener_socket && Id != fd){
					SSL* target_cSSL = clients[i].cSSL;
					SSL_write(target_cSSL, frame,len+2);
				}
						}

	}
}

*/

	/*
int listen_for_pfds(int fd_count, int max_fd_size){

}



	initialize_ssl();
	struct Client *clients;
	clients = malloc(sizeof(*clients) * max_fd_size);
	struct pollfd *pfds = malloc(sizeof(*pfds) * max_fd_size);
	int listener_socket = create_socket();
	add_fd(listener_socket,"listener",&pfds,&clients, &fd_count, &max_fd_size);
	printf("https://10.0.0.213:%d/life-of-sounds/login\n",PORT);
	while(1){
		printf("Listening to %d FDs..\n", fd_count);
		if (poll(pfds, fd_count, -1) < 0){
			perror("poll");
		}
	}
}
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
			// printf("Incoming New FD! %d\n", newfd);
			add_fd( newfd, "requested" ,&pfds,  &clients,&fd_count,  &max_fd_size);
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
					}else{
						struct ClientConnection client_connection = get_client_connection_by_fd(ready_fd);
						if (client_connection.exists){
							printf("Websocket Client %s | %s is Connected.\n", client_connection.ip_address,client_connection.client_type);
							update_client_connecion_value(client_connection.Id, "client_type", "websocket");
						}

					}
					buf[0] = '\0';
				}
				struct ClientConnection client_connection = get_client_connection_by_fd(ready_fd);

				if (client_connection.exists){
					char* client_type = client_connection.client_type;
					if (strcmp(client_type, "websocket")==0){
						char message[BUFFER_SIZE];
						int payload_length = decode_websocket_buffer(buf, message);
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
									printf("Sending to CLIENT %d %d Bytes\n", Id, payload_length);
									if (opcode ==1){
										printf("Sending Message: %s\n", message);
									
									}
									SSL* target_cSSL = clients[i].cSSL;
									SSL_write(target_cSSL, frame, 5+payload_length);
						 	}
						 }

					}else {
						printf("Incoming Message from Client %d '%s'\n",client_connection.fileDescriptorId, buf);
						int opcode = buf[0] & 0xFF;
						int len = (buf[1] << 24 & 0xFF) + (buf[2] << 16 & 0xFF) + (buf[3] << 8 & 0xFF) + (buf[4] & 0xFF);
						printf("OPCODE: %d\n", opcode);
						printf("LENGTH: %d\n", len);
						char message[len];
						for (int i=0; i<len; i++){
							message[i] = buf[5+i];
						}
						message[len] = '\0';
						printf("MESSAGE: %s\n", message);
						create_websocket_frame(message, len, opcode, clients, ready_fd,fd_count, listener_socket);
					}
				}
			}
		}
	}
}
*/

