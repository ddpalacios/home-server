#include <stdlib.h>
#include <stdio.h>
#include <poll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>
#include <cjson/cJSON.h>
#include "client.h"
#include "HTTP.h"
#include "User.h"
#include "SQL.h"
#include "session.h"
#include "websocket.h"
#include "FileStorage.h"
#include "password_hashing.h"
#define PORT 9034
#define CLIENT_CERT "self_signed_cert.crt"
#define CLIENT_KEY "privateKey.key"
#define BUFFER_SIZE 2056

SSL* encrypt_socket(int fd){
	SSL_CTX *ssl_ctx;
	
	ssl_ctx = SSL_CTX_new(SSLv23_server_method());
	SSL_CTX_set_options(ssl_ctx, SSL_OP_SINGLE_DH_USE);
	int use_cert = SSL_CTX_use_certificate_file(ssl_ctx, CLIENT_CERT, SSL_FILETYPE_PEM);
	//printf("CERT Loaded: %d\n", use_cert);
	int use_key = SSL_CTX_use_PrivateKey_file(ssl_ctx, CLIENT_KEY, SSL_FILETYPE_PEM);
	//printf("KEY Loaded: %d\n", use_key);
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
		return NULL;
	}
	return cSSL;
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
		//printf("New Client Added: %d\n", new_fd);
		(*pfds)[*fd_count].fd = new_fd;
		(*pfds)[*fd_count].events = POLLIN;
		(*fd_count)++;
		printf("Total FDs created: %d\n", *fd_count);
	}else{
		if (*fd_count == 0){
			(*pfds)[*fd_count].fd = new_fd;
			(*pfds)[*fd_count].events = POLLIN;
			(*fd_count)++;
			//printf("Listener Socket Added!! - Total FDs created: %d\n", *fd_count);
		}
	}
}

void initialize_ssl(){
	SSL_library_init(); /* load encryption & hash algorithims for SSL*/
	SSL_load_error_strings(); /* load the error strings for good error reporting */
	//printf("SSL Initialized!\n");
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
			printf("Recieved %d from client %d\n", nbytes, ready_fd);
			if (nbytes <= 0){
				if (nbytes == 0){
					printf("FD %d hung up\n", ready_fd);
				}else{
					perror("recv");
				}
				close(ready_fd);
				del_from_pfds(pfds,clients, ready_fd, &fd_count);
			}else{
				if (is_websocket_buffer(buf)){
					char*message = malloc(nbytes);
					int true_nbytes = decode_websocket_buffer(buf, message);
					char *res = strstr(message, " ");
					res = res +1;
					char *end = strchr(message, '}');
					size_t jsonlength = end - message +1;
					char jsonpart[jsonlength +1];
					strncpy(jsonpart, message, jsonlength);
					jsonpart[jsonlength] = '\0';
					cJSON *json = cJSON_Parse(jsonpart);
					cJSON *type = cJSON_GetObjectItem(json, "type");
					cJSON *userid = cJSON_GetObjectItem(json, "userid");
					cJSON *blob_size = cJSON_GetObjectItem(json, "size");
					cJSON *blob_id = cJSON_GetObjectItem(json, "Id");

					 if (strcmp(type->valuestring, "text")==0){
						printf("TEXT Recieved! FROM UserID %s\n", userid->valuestring);
						printf("VALUE: %s\n",res);
					
					}else if (strcmp(type->valuestring, "audio")==0){
						printf("BINARY Recieved! FROM UserID %s\n", userid->valuestring);
						printf("BUF SIZE'%d'\n", blob_size->valueint);
						char path[255];
						snprintf(path, sizeof(path), "users/%s/",userid->valuestring);
						create_directory(path);
						char recordingsPath[255];
						snprintf(recordingsPath, sizeof(recordingsPath), "users/%s/recordings",userid->valuestring);
						create_directory(recordingsPath);
						if (directory_exists(recordingsPath)){
							char audioPath[255];
							char* audioName = malloc(16);
							create_unique_identifier(audioName);
							char audioName_hex[33];
							hash_to_hex(audioName, 16, audioName_hex);
							snprintf(audioPath, sizeof(audioPath), "users/%s/recordings/Audio_%s.webm",userid->valuestring, blob_id->valuestring);
							printf("Path: %s\n",audioPath);
							FILE* fptr = fopen(audioPath, "ab");
							fwrite(res, 1, blob_size->valueint, fptr);
							fclose(fptr);
						}

					}else{
						printf("TYPE NOT VALID TO READ!!\n");
						printf("VALUE: %s\n",res);
					}



				}


				if (strncmp(buf, "GET ", 4) == 0){
					// TODO create a copy of buf instead of manipulating the original
					char* request_cookie = get_cookie(buf);
					char* websocket_key = get_header_value(buf,"Sec-WebSocket-Key");
					char *route = get_route(buf); 

					
					if (strcmp(route, "/") ==0){
						render_template("index.html", cSSL, request_cookie);
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);

					}else if (strcmp(route, "/new_user") ==0){
						render_template("new_user.html", cSSL, request_cookie);
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);
					
					}else if (strcmp(route, "/home")==0){
						render_template("home.html", cSSL,request_cookie);
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);

					// TODO DELETE ALL SESSIONS Associated with user
					}else if (strcmp(route, "/home/logout")==0){
						printf("Logging out...\n");
						delete_session(request_cookie);
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);

					}else if (strcmp(route, "/home/studio")==0){
						render_template("studio.html", cSSL, request_cookie);
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);

					}else if (strcmp(route, "/favicon.ico")==0){
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);

					}else if (strcmp(route, "/home/userinfo")==0){
						printf("Getting User info Session ID: %s...\n", request_cookie);
						struct Session session = get_session(request_cookie);
						printf("SESSION LOGGED %s\n", session.Id);
						struct User user = get_user_by_id(session.userId);
						printf("USER %s LOGGED ON\n", user.Id);
						static char user_json[255];
						snprintf(user_json, sizeof(user_json), "{\"username\":\"%s\",\"userid\":\"%s\",\"email\":\"%s\"}",user.fullname,user.Id, user.email);
						printf("JSON: %s\n", user_json);
						send_json_to_client(cSSL, user_json);
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);

					}else if (strcmp(route, "/home/studio/start_websocket") ==0){
						printf("Starting Websocket...\n");
						char* wss_accp_key = generate_websocket_accptKey(websocket_key);
						initialize_websocket_protocol(cSSL,  wss_accp_key);
						struct Session session = get_session(request_cookie);
						struct User user = get_user_by_id(session.userId);
						insert_websocket_session(user.Id, request_cookie);

					
					}else if (strcmp(route, "/home/studio/stop_websocket")==0){ 
						printf("Stopping Websocket...\n");
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);
						struct Session session = get_session(request_cookie);
						struct User user = get_user_by_id(session.userId);
						delete_websocket_session(user.Id, request_cookie);
					}else{
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);
					}
				}else if (strncmp(buf, "POST ",4) == 0){ 
					// TODO Use get_route to extract the route and remove currenct condition
					if (strncmp(buf+4, " /create_login ",15) == 0){
						char* res = retrieve_request_body(buf);
						create_login(res);
						send_response_code(200, cSSL, NULL);
						close(ready_fd);
						del_from_pfds(pfds,clients, ready_fd, &fd_count);


					}else if (strncmp(buf+4, " /validate_login ",17) == 0){
						char* res = retrieve_request_body(buf);
						struct User user = validate_login(res);
						if (user.exists){
							printf("LOGIN SUCCESSFUL!\n");
							struct Session session = create_session(user.Id);
							insert_session(session);
							printf("Session ID: %s | %s | %s\n", session.Id, session.userId, session.login_time);
							char* cookie = create_cookie("sessionid",session.Id); 
							send_response_code(200, cSSL, cookie);
							close(ready_fd);
							del_from_pfds(pfds,clients, ready_fd, &fd_count);
						}else{
							printf("LOGIN FAILED!\n");
							send_response_code(401, cSSL, NULL);
							close(ready_fd);
							del_from_pfds(pfds,clients, ready_fd, &fd_count);
						}
					}
				}
			}
			 buf[0] = '\0';
		}
	}
}
