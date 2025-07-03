// #include  <cjson/cJSON.h>
// #include <sys/socket.h>
// #include "socket.h"
// #include "FrameField.h"
// #include "SQL.h"
// #include <sys/types.h>
// #include <arpa/inet.h>
// #include <netinet/in.h>
// #include <unistd.h>
// #include "route.h" 
// #include "http_utilities.h" 
// #include <openssl/ssl.h>
// #include <openssl/err.h>
// #include <openssl/bio.h>
// #define CLIENT_CERT "../server/self_signed_cert.crt"
// #define CLIENT_KEY "../server/privateKey.key"
// #define BUFFER_SIZE 255 


// void get_socket_info(struct Socket *socket){
// 	int sockfd = socket->Id;
// 	socklen_t len;
// 	struct sockaddr_storage addr;
// 	static char ipstr[INET6_ADDRSTRLEN];
// 	int port;
// 	len = sizeof(addr);
// 	getpeername(sockfd, (struct sockaddr*)&addr, &len);
// 	struct sockaddr_in *s = (struct sockaddr_in *)&addr;
// 	port = ntohs(s->sin_port);
// 	inet_ntop(AF_INET, &s->sin_addr, ipstr, sizeof(ipstr));
// 	printf("Socket         : %d\n", sockfd);
// 	printf("Peer IP Address: %s\n", ipstr);

// 	socket->ip_addr=strdup(ipstr);
// 	socket->PORT = port; 
// 	socket->isEncrypted = 0;
// 	socket->isClient = 0;
// 	socket->type = strdup("listener");

// }
// void bind_and_listen_socket(struct addrinfo hints, char* PORT, struct Socket *new_socket){
// 	struct addrinfo *res;
// 	getaddrinfo(NULL, PORT, &hints, &res);
// 	int sockfd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
// 	int yes =1;
// 	setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int));
// 	bind(sockfd, res->ai_addr, res->ai_addrlen);
// 	listen(sockfd, 5);
// 	new_socket->Id = sockfd;
// 	char host[NI_MAXHOST];	
// 	char service[NI_MAXSERV];
// 	getnameinfo((struct sockaddr*)&hints, sizeof(hints),host,sizeof(host), service, sizeof(service),0 );
// 	new_socket->hostname = strdup(host);
// 	new_socket->service = strdup(service);
// 	get_socket_info(new_socket);
// }
// SSL* encrypt_socket(int fd){
// 	SSL_CTX *ssl_ctx;
// 	ssl_ctx = SSL_CTX_new(SSLv23_server_method());
// 	SSL_CTX_set_options(ssl_ctx, SSL_OP_SINGLE_DH_USE);
// 	int use_cert = SSL_CTX_use_certificate_file(ssl_ctx, CLIENT_CERT, SSL_FILETYPE_PEM);
// 	int use_key = SSL_CTX_use_PrivateKey_file(ssl_ctx, CLIENT_KEY, SSL_FILETYPE_PEM);
// 	if (use_cert <=0 || use_key <=0){
// 		printf("ERROR LOADING SSL CERT OR KEY\n");
// 		exit(1);
// 	}
// 	SSL *cSSL = SSL_new(ssl_ctx);
// 	SSL_set_fd(cSSL, fd);
	
// 	int ssl_err = SSL_accept(cSSL);
// 	if (ssl_err <0) {
// 		int err = SSL_get_error(cSSL, ssl_err);
// 		printf("SSL ERROR %d | %d ERROR ON ACCEPTING CSSL!!!\n", ssl_err, err);

// 		SSL_shutdown(cSSL);
// 		SSL_free(cSSL);
// 		return NULL;
// 	}
// 	return cSSL;
// }
// int get_ready_file_descriptor(int fd_count, struct pollfd *pfds){
// 	for (int i=0; i<fd_count; i++){
// 		if (pfds[i].revents & POLLIN){
// 			return pfds[i].fd;
// 		}
// 	}
// }
// void insert_socket(struct Socket *new_socket){
// 	int new_fd = new_socket->Id;
// 	char sql[576];
// 	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	snprintf(sql, sizeof(sql),
// 			"INSERT INTO socket VALUES('%d', '%s', '%d', '%s' , '%s', '%d', '%d')",
// 			new_fd
// 			,new_socket->ip_addr
// 	       		,new_socket->PORT
// 			,new_socket->type
// 			,new_socket->hostname
// 			,new_socket->isEncrypted
// 			,new_socket->isClient);

// 	query(conn, sql);
// 	close_sql_connection(conn);
// }
// void insert_fd(struct pollfd *pfds[],struct Socket *sockets, struct Socket *socket, int *fd_count, int *max_fd_size){
	// int new_fd = socket->Id;
	// if (*fd_count == *max_fd_size){
	// 	*max_fd_size *=2;
	// 	*pfds = realloc(*pfds, sizeof(**pfds) * (*max_fd_size));
	// 	struct Socket *tmp = realloc(sockets, (*max_fd_size) * sizeof(struct Socket));
	// 	sockets = tmp;
	// }

	// if (*fd_count == 0){
	// 	(*pfds)[*fd_count].fd = new_fd;
	// 	(*pfds)[*fd_count].events = POLLIN;

	// 	sockets[*fd_count] = (*socket);
	// 	(*fd_count)++;
	// 	insert_socket(socket);
	// 	printf("New fd count: %d\n", *fd_count);

	// }else if (*fd_count > 0){
	// 	SSL* cSSL = encrypt_socket(new_fd);
	// 	if (cSSL !=NULL){
	// 		(*socket).cSSL = cSSL;
	// 		(*socket).type = "client";
	// 		(*socket).isClient = 1; 
	// 		(*socket).isEncrypted = 1; 
	// 		(*pfds)[*fd_count].fd = new_fd;
	// 		(*pfds)[*fd_count].events = POLLIN;
	// 		sockets[*fd_count] = (*socket);
	// 		(*fd_count)++;
	// 		insert_socket(socket);
	// 		printf("New fd count: %d\n", *fd_count);
		
	// 	}else{
	// 		close(new_fd);
	// 	}
	
	// }
// }
// void delete_socket(struct pollfd pfds[],struct Socket *sockets, struct Socket *socket, int *fd_count){
// 	char sql[576];
// 	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	printf("Total FDS: %d\n", (*fd_count));
// 	for (int i=0; i<*fd_count; i++){
// 		if (pfds[i].fd  == socket->Id) {
// 			sockets[i] = sockets[*fd_count-1];
// 			pfds[i] = pfds[*fd_count-1];
// 			(*fd_count)--;
// 			printf("FD removed. Total:  %d\n", (*fd_count));
// 			snprintf(sql, sizeof(sql), "DELETE FROM socket WHERE Id = %d", socket->Id);
// 			query(conn, sql);
// 			close_sql_connection(conn);
// 			break;
// 		}
// 	}

// }
// struct Socket  get_socket(struct Socket *sockets, int fd, int *fd_count){
// 	for (int i=0; i<*fd_count; i++){
// 		if (sockets[i].Id == fd){
// 			return sockets[i];
// 		}
// 	}


// }
// int read_exact_bytes(SSL *cSSL, int nbytes, char* buf) {
//     int total_bytes_retrieved = 0;
//     while (total_bytes_retrieved < nbytes) {
//         int to_read = nbytes - total_bytes_retrieved;
//         int bytes_read = SSL_read(cSSL, buf, to_read);
//         if (bytes_read <= 0) {
//             if (bytes_read == 0) {
//                 printf("SSL connection closed\n");
//                 return 0;
//             } else {
//                 printf("SSL read error\n");
//                 return 0;
//             }
//         }

//         total_bytes_retrieved += bytes_read;
//     }

//     return total_bytes_retrieved;
// }
// int read_HTTP_header(SSL *cSSL, int nbytes, char* buf) {
//     int total_bytes_retrieved = 0;
//     while (total_bytes_retrieved < nbytes) {
//         int to_read = nbytes - total_bytes_retrieved;
//         int bytes_read = SSL_read(cSSL, buf, to_read);
// 	char* requestBody = strstr(buf, "\r\n\r\n");
// 	if (requestBody != NULL){
// 		size_t length = requestBody - buf;
// 		char* substring = (char*)malloc(length + 1);
// 		strncpy(substring, buf, length);
// 		substring[length] = '\0'; 
// 		strcpy(buf, substring);
//        		 break;
// 	}
	
//         total_bytes_retrieved += bytes_read;
//     }

//     return total_bytes_retrieved;
// }
// int read_socket_buffer(struct Socket *socket, char* message){
// 	 char *buf = malloc(5);
// 	 int bytes_read = read_exact_bytes(socket->cSSL, 5, buf);
// 	 if (bytes_read == 0){return -1;}
// 	 int opcode = buf[0];
// 	 int payload_length = (buf[1] << 24) + (buf[2] << 16)+ (buf[3] << 8) + buf[4];
// 	 bytes_read= read_exact_bytes(socket->cSSL, payload_length, message);
// 	 if (bytes_read == 0){return -1;}
// 	 message[payload_length] = '\0';
// 	return opcode;
// }

// void send_buffer_to_socket(struct Socket *socket,int opcode, char*buf){
// 	int payload_length = strlen(buf);
// 	printf("SENDING PAYLOAD OF %d BYTES OF TYPE %d\n", payload_length, opcode);
// 	 char frame[5+payload_length];
// 	 frame[0] = opcode;
// 	 frame[1] = (payload_length >> 24) & 0xFF;
// 	 frame[2] = (payload_length >> 16) & 0xFF;
// 	 frame[3] = (payload_length >> 8) & 0xFF;
// 	 frame[4] = payload_length & 0xFF; 
// 	 memcpy(&frame[5], buf, payload_length);
// 	SSL_write(socket->cSSL, frame, 5+payload_length);
// }

// void read_tcp_message(struct Socket socket, HashMap* frameFieldMap, char** payload){
// 	printf("%s\n\n", socket.hostname);
	
// 	char buf[1024];
//         int bytes_read = SSL_read(socket.cSSL, buf, 1024);
// 	printf("Id: %d\n", socket.Id);
// 	printf("IP Address: %s\n", socket.ip_addr);
// 	printf("Port: %d\n", socket.PORT);
// 	printf("Type: %s\n", socket.type);
// 	printf("Hostname: %s\n", socket.hostname);
// 	printf("Service: %s\n", socket.service);
// 	printf("Encrypted: %s\n", socket.isEncrypted ? "Yes" : "No");
// 	printf("Is Client: %s\n", socket.isClient ? "Yes" : "No");

// 	/*
// 	struct FrameField *foundFields = search(frameFieldMap, socket.ip_addr);
// 	int count = 0;
// 	int prefix_length = 0;
// 	printf("Bytes Read: %d\n", bytes_read);
// 	printf("IP: %s\n", socket.ip_addr);
// 	while (foundFields[count].name != NULL){
// 		struct FrameField ff = foundFields[count];
// 		int byte_length = ff.byte_length;
// 		printf("Byte Length: %d\n", byte_length);
// 		count++;
		
// 	}
// 	*/

// 	/*

// 	while (foundFields[count].name != NULL){
// 		struct FrameField ff = foundFields[count];
// 		int byte_length = ff.byte_length;
// 		if (byte_length == -1 && prefix_length > 0){
// 			byte_length = prefix_length;
// 		}
// 		char* buf = malloc(byte_length);
// 		int fbytes = read_exact_bytes(socket.cSSL,byte_length, buf);
// 		    if (ff.is_length_prefix) {
// 			if (byte_length >= 4) {
// 			    prefix_length = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
// 			} else {
// 			    fprintf(stderr, "Prefix buffer too short\n");
// 			    free(buf);
// 			    break;
// 			}
// 		    }else if (strcmp(ff.name, "PAYLOAD") == 0){
// 			     *payload = malloc(byte_length + 1);
// 				memcpy(*payload, buf, byte_length);
// 				(*payload)[byte_length] = '\0';
// 				free(buf);
// 				break;
// 			}
// 		free(buf);
// 		count++;
// 	}
// 	*/

// }

// void listen_for_clients(struct Socket *sockets,struct Socket *server_socket,int *fd_count, int *max_fd_size){
	// SSL_library_init(); 
	// SSL_load_error_strings(); 
	// struct pollfd *pfds = malloc(sizeof(struct pollfd) * (*max_fd_size));
// 	insert_fd(&pfds,sockets,server_socket, fd_count,max_fd_size);
// 	while(1){
		// if (poll(pfds, *(fd_count), -1) < 0){
		// 	perror("poll");
		// }
// 		int ready_fd = get_ready_file_descriptor(*fd_count, pfds);
// 		if (ready_fd == server_socket->Id){
			// struct sockaddr_storage remoteaddr;
			// socklen_t addrlen;
			// addrlen = sizeof(remoteaddr);
			// int newfd = accept(server_socket->Id,(struct sockaddr *)&remoteaddr, &addrlen);
// 			// struct Socket *new_socket = malloc(sizeof(struct Socket));
			// char host[NI_MAXHOST];	
			// char service[NI_MAXSERV];
			// getnameinfo((struct sockaddr*)&remoteaddr, sizeof(remoteaddr),host,sizeof(host), service, sizeof(service),0 );
			// printf("%s has connected!\n", host);
			// new_socket->hostname = strdup(host);
			// new_socket->service = strdup(service);
			// new_socket->Id = newfd;
// 			// get_socket_info(new_socket);
// 			// insert_fd(&pfds,sockets, new_socket, fd_count,max_fd_size);
// 		}else{
// 			struct Socket ready_socket;
// 			ready_socket = get_socket(sockets, ready_fd, fd_count);
// 			int to_read = 1024;
// 			char *peek_buf = malloc(to_read);
// 			int n = SSL_peek(ready_socket.cSSL, peek_buf, to_read);
// 			if (n <= 0){
// 				close(ready_fd);
// 				delete_socket(pfds, sockets, &ready_socket, fd_count);
// 			}else{
// 				close(ready_fd);
// 				delete_socket(pfds, sockets, &ready_socket, fd_count);
// 			 }

// 				// if (strstr(peek_buf, "HTTP/1.1")!=NULL){
// 				// 	printf("\n\nRecieved HTTP Message! From %s\n\n", ready_socket.hostname);
// 				// 	char*header_end = strstr(peek_buf, "\r\n\r\n");
// 				// 	size_t header_length= header_end - peek_buf;
// 				// 	char* http_header = malloc(header_length+1);
// 				// 	strncpy(http_header, peek_buf, header_length);
// 				//  	char*body = NULL;	
// 				// 	int body_length = get_content_length(http_header);
// 				// 	if (body_length > 0){
// 				// 		char* h1 = malloc(header_length+1);
// 				// 		int nbytes = read_exact_bytes(ready_socket.cSSL,header_length+4,h1);
// 				// 		h1[nbytes] = '\0';
// 				// 		body = malloc(body_length+1);
// 				// 		nbytes = read_exact_bytes(ready_socket.cSSL,body_length,body);
// 				// 		body[nbytes] = '\0';
// 				// 	}
// 				// 	process_route(ready_socket, http_header,body);
// 				// 	if (!is_connection_keep_alive(http_header)){
// 				// 			close(ready_fd);
// 				// 			delete_socket(pfds, sockets, &ready_socket, fd_count);
// 				// 	}else{
// 				// 			printf("Socket '%d' is kept alive\n", ready_fd);
// 				// 	}
// 				// }else{
// 				// 	printf("\n\nRecieved TCP Message! From %s\n\n", ready_socket.hostname);
// 				// 	char* payload = NULL; 
// 				// 	// read_tcp_message(ready_socket, frameFieldMap, &payload);
// 				// }

// 		}
// 	}

// }