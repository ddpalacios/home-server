
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
#include "route.h" 

/*
#include <arpa/inet.h>
#include <stdlib.h>
#include <stdio.h>
#include <poll.h>
#include <netinet/in.h>
#include <unistd.h>
#include "client.h" 
#include "../models/Client_Connection.h" 
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

int read_exact_bytes(SSL *cSSL, int nbytes, char* buf) {
    int total_bytes_retrieved = 0;
    while (total_bytes_retrieved < nbytes) {
        int to_read = nbytes - total_bytes_retrieved;

        int bytes_read = SSL_read(cSSL, buf, to_read);
	buf[bytes_read] = '\0';
	printf("Bytes Read: %d\n", bytes_read);
        if (bytes_read <= 0) {
            if (bytes_read == 0) {
                return 0;
            } else {
                return 0;
            }
        }

        total_bytes_retrieved += bytes_read;
    }

    return total_bytes_retrieved;
}



int read_socket_buffer(struct Socket *socket, char* message){
	printf("\n\nRecieved Message from client %d\n", socket->Id);
	 read_exact_bytes(socket->cSSL, 255, message);
	 if (strstr(message, "HTTP/1.1")){
		 char* request = malloc(strlen(message));
		 char* request_type = malloc(strlen(message));
		 char* route = malloc(strlen(message));
		 strcpy(request_type,message);
		 strcpy(route,message);
		 strcpy(request,message);
		 char* type_end = strchr(request_type, ' ');
		 *type_end = '\0';
		 route = strchr(route, ' ');
		 route +=1;
		 char* route_end = strchr(route, ' ');
		 *route_end = '\0';
		 process_route(socket->cSSL, request, request_type, route, socket->Id);
		 free(request);
		 free(request_type);
	 
	 }
	 return 0;

	/*
	 char *buf = malloc(5);
	 int bytes_read = read_exact_bytes(socket->cSSL, 5, buf);
	 if (bytes_read == 0){return -1;}
	 int opcode = buf[0];
	 int payload_length = (buf[1] << 24) + (buf[2] << 16)+ (buf[3] << 8) + buf[4];
	 bytes_read= read_exact_bytes(socket->cSSL, payload_length, message);
	 if (bytes_read == 0){return -1;}
	 message[payload_length] = '\0';
	return opcode;
	*/
}


// void realloc_frame(char** frame,int*frame_size, int bytes_added, int byte_length, int*frame_size_remaining){
// 	 char* tmp = realloc(*frame, bytes_added+byte_length);
// 	 if (tmp == NULL){
// 		 printf("Failed to realloc memory\n");
// 	 }else{
// 		 *frame = tmp;
// 		 *frame_size = bytes_added +byte_length;
// 		 *frame_size_remaining += byte_length;
// 		 printf("Reallocated to %d\n", bytes_added+byte_length);
// 	 }
// }

// void add_str_to_byte(char**frame, char* data,int byte_length, int*bytes_added, int* frame_size){
// 	printf("Adding %d byte(s)...\n", byte_length);

// 	int frame_size_remaining = (*frame_size) - (*bytes_added);	
// 	if (byte_length >  frame_size_remaining){
// 		realloc_frame(frame,frame_size, *bytes_added, byte_length, &frame_size_remaining);
// 	}
// 	 memcpy(&(*frame)[*bytes_added], data,byte_length);
// 	frame_size_remaining -= byte_length;
// 	*bytes_added +=byte_length;
// 	printf("Frame Size Remaining: %d\n\n", frame_size_remaining);
// }

// void add_int_to_byte(char**frame, int data,int byte_length, int*bytes_added, int* frame_size){
// 	printf("Adding %d byte(s)...\n", byte_length);
	
// 	int frame_size_remaining = (*frame_size) - (*bytes_added);	

// 	if (byte_length >  frame_size_remaining){
// 		realloc_frame(frame,frame_size, *bytes_added, byte_length, &frame_size_remaining);
// 	}
// 	if (byte_length > 1){
// 		int total_bits = (8 * byte_length) - 8;
// 		for (int i=0; i<byte_length; i++){
// 			if (total_bits == 0){
// 				(*frame)[*bytes_added + i] = data &0xFF;
// 			}else{
// 				(*frame)[*bytes_added + i] = (data >> total_bits) &0xFF;
// 			}
// 			frame_size_remaining -=1;
// 			total_bits -=8;
// 		}
// 		*bytes_added+=4;
// 	}else{
// 		(*frame)[*bytes_added] = data;
// 		*bytes_added+=1;
// 		frame_size_remaining -=1;
		
// 	}

// 	printf("\n\nTotal Bytes added: %d\n", *bytes_added);
// 	printf("Frame Size Remaining: %d\n\n", frame_size_remaining);

// } 

// void send_buffer_to_socket(struct Socket *socket,int opcode, char*buf){
// 	int payload_length = strlen(buf);

// 	int frame_size = 1;
// 	char* frame = malloc(frame_size);

	/*
	  for (int i=0; i< defined_frame_len; i=0){{
	 	Struct Frame operation = defined_frame[i];
	 	char* hostname = defined_frame.servername;

	 	if (socket.hostname == "10.0.0.214"){
			if (operation.name == "FLAG") {
		 		int byte_length = operation.byte_length;
				add_int_to_byte(&frame, 0x0, byte_length, &bytes_added, &frame_size);
	 		}else if (operation.name == "SOURCE_LEN"){
				int source_len = len(gethostname()) 
				byte_length = operation.byte_length
				add_str_to_byte(&frame,source_len, byte_length, &bytes_added, &frame_size);
	 		}else if (operation.name == "SOURE"){
				char* hostname = gethostname();
				add_str_to_byte(&frame,hostname, strlen(hostname), &bytes_added, &frame_size);
	 		}else if (operation.name == "DEST_LEN"){
				int source_len = strlen(hostname);
				byte_length = operation.byte_length
				add_int_to_byte(&frame,hostname, byte_length, &bytes_added, &frame_size);
	 		}else if (operation.name == "DEST"){
				add_str_to_byte(&frame,hostname, strlen(hostname), &bytes_added, &frame_size);
			}else if (operation.name == "OPCODE"){
				add_int_to_byte(&frame,0x1, byte_length, &bytes_added, &frame_size);
			}else if (operation.name == "PAYLOAD_LENGTH"){
				byte_length = operation.byte_length
			}else if (operation.name == "PAYLOAD"){
				add_str_to_byte(&frame,buf, payload_length, &bytes_added, &frame_size);
			}
		}else if (socket.hostname == "10.0.0.253"){
			if (operation.name == "FLAG") {
		 		int byte_length = operation.byte_length;
				add_int_to_byte(&frame, 0x0, byte_length, &bytes_added, &frame_size);
			}else if (operation.name == "OPCODE"){
				add_int_to_byte(&frame,0x1, byte_length, &bytes_added, &frame_size);
			}else if (operation.name == "PAYLOAD_LENGTH"){
				byte_length = operation.byte_length
			}else if (operation.name == "PAYLOAD"){
				add_str_to_byte(&frame,buf, payload_length, &bytes_added, &frame_size);
			}
		}
	}
	if (strlen(frame) > 1) {
		SSL_write(socket->cSSL, frame, bytes_added);
		free(frame);
	}else{
		SSL_write(socket->cSSL, buf, payload_length);
	}
	  
	 * */
	// int bytes_added = 0;

	// add_int_to_byte(&frame, 0x0, 1, &bytes_added, &frame_size);
	// add_int_to_byte(&frame, 0x1, 1, &bytes_added, &frame_size);

	// char* h = "10.0.0.213";
	// int source_length = strlen(h);
	// add_int_to_byte(&frame,source_length, 4, &bytes_added, &frame_size);
	// add_str_to_byte(&frame,h, source_length, &bytes_added, &frame_size);


	// char* d = "127.0.0.1";
	// int dest_len = strlen(d);
	// add_int_to_byte(&frame,dest_len, 4, &bytes_added, &frame_size);
	// add_str_to_byte(&frame,d, dest_len, &bytes_added, &frame_size);


	// add_int_to_byte(&frame, 0x1, 1, &bytes_added, &frame_size);
	
	// add_int_to_byte(&frame,payload_length, 4, &bytes_added, &frame_size);
	// add_str_to_byte(&frame,buf, payload_length, &bytes_added, &frame_size);

	// // printf("\nBYTES ADDED: %d\n", bytes_added);

	// SSL_write(socket->cSSL, frame, bytes_added);
	// free(frame);

// }

void listen_for_clients(struct Socket *sockets,struct Socket *server_socket,char* PORT, int *fd_count, int *max_fd_size){
	SSL_library_init(); 
	SSL_load_error_strings(); 
	printf("Listening on port %s\n", PORT);
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
			char* buf = "Connection Sucessful";
			//send_buffer_to_socket(new_socket,0x1, buf);
		}else{
			struct Socket ready_socket;
			ready_socket = get_socket(sockets, ready_fd, fd_count);
			char* message = malloc(BUFFER_SIZE);
			int bytes_read = read_socket_buffer(&ready_socket, message);
			if (bytes_read == 0){
				close(ready_fd);
				delete_socket(pfds, sockets, &ready_socket, fd_count);
			}
		}
	}
}

