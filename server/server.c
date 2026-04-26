#define _GNU_SOURCE
#include  <cjson/cJSON.h>
#include <pthread.h>
#include <sys/socket.h>
#include <stdlib.h>
#include <time.h>
#include <errno.h>
#include <stdio.h>
#include "Socket.h"
#include "route.h"
#include "server.h"
#include "FrameField.h"
#include "http_utilities.h"
#include "json_utilities.h"
#include "string_utilities.h"
#include "send_message.h"
#include "read_message.h"
#include <sys/types.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#include <sys/time.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>
#include <stdio.h>
#include <string.h>
#include <netdb.h>
#include <poll.h>
#define MAX_CLIENTS 1024
#define BUFFER_SIZE 1024 
#define IPSTRLEN INET6_ADDRSTRLEN
pthread_mutex_t fd_lock = PTHREAD_MUTEX_INITIALIZER;
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
	// setsockopt(sockfd, SOL_SOCKET, SO_REUSEPORT, &yes, sizeof(int));
	if (bind(sockfd, res->ai_addr, res->ai_addrlen) < 0){
        printf("ERROR in BIND\n");
        exit(1);

    }
	if (listen(sockfd, 100) <  0){
        printf("ERROR in LISTEN\n");
        exit(1);
    }
    printf("Listening on port %s\n", port);
    return sockfd;
}

struct Socket* insert_file_descriptor(struct Socket *sockets[],struct pollfd *pfds[],int fd, SSL *cSSL,char* hostname,int *fd_count, int *max_fd_size, int is_listener){
	 /* Reallocating sockets[] used to double the array. That MOVED memory
	  * and invalidated every Socket* pointer worker threads were holding
	  * — under 20+ concurrent requests we crashed in SSL_write with
	  * a NULL/freed cSSL. Refuse to grow past max_fd_size instead; the
	  * caller pre-allocates a comfortable bound (MAX_CLIENTS = 1024). */
	 if (*fd_count >= *max_fd_size){
	 	fprintf(stderr, "insert_file_descriptor: at capacity (%d), refusing new fd=%d\n",
	 	        *max_fd_size, fd);
	 	if (fd >= 0) close(fd);
	 	return NULL;
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
    (*sockets)[*fd_count].isEmail = 0x0;
    (*sockets)[*fd_count].is_tcp = 0x0;
    (*sockets)[*fd_count].jobId = "";
    (*sockets)[*fd_count].cSSL = cSSL;
    struct Socket* socket = &((*sockets)[*fd_count]);
    (*fd_count)++;
	if (socket_id != NULL){
		free(socket_id);
		socket_id = NULL;
	}
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
			/* cSSL/fd may already be cleaned up by the worker thread
			 * for non-keep-alive HTTP responses (so the client's
			 * close_notify isn't delayed by the main loop's poll). */
			if (sockets[i].cSSL != NULL) {
				int ret = SSL_shutdown(sockets[i].cSSL);
				SSL_free(sockets[i].cSSL);
				sockets[i].cSSL = NULL;
			}
			if (fd >= 0) {
			        close(fd);
			}
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

struct Socket* accept_new_client(int listener_fd, struct Socket **sockets,struct pollfd *pfds[],int *fd_count, int *max_fd_size){
       struct sockaddr_storage remoteaddr;
       socklen_t addrlen;
       addrlen = sizeof(remoteaddr);
       int newfd = accept(listener_fd,(struct sockaddr *)&remoteaddr,  &addrlen);
       if (newfd < 0) {
           return NULL;
       }

       /* TLS handshake here on the main accept thread. Doing it on the
        * worker thread (with the FD held in pfds with events=0 until
        * handshake done) caused use-after-free races between workers
        * and the main loop's swap-on-remove logic in sockets[]. */
       SSL* cSSL = encrypt_socket(newfd);
       if (cSSL == NULL) {
           close(newfd);
           return NULL;
       }
       struct timeval send_timeout;
       send_timeout.tv_sec = 5;
       send_timeout.tv_usec = 0;
       setsockopt(newfd, SOL_SOCKET, SO_SNDTIMEO, &send_timeout, sizeof(send_timeout));

       char host[NI_MAXHOST];
       struct Socket* socket = insert_file_descriptor(sockets, pfds, newfd, cSSL, host, fd_count, max_fd_size, 0x0);
       if (socket == NULL) {
           SSL_shutdown(cSSL);
           SSL_free(cSSL);
           return NULL;
       }
       return socket;
     }

void fill_address_info(struct addrinfo *hints){
	memset(&(*hints), 0, sizeof(*hints));
	hints->ai_family = AF_INET;
	hints->ai_socktype = SOCK_STREAM;
	hints->ai_flags= AI_PASSIVE;
}

void* process_thread(void* arg){
    struct Socket *new_client = (struct Socket *)arg;

    char *peek_buf = malloc(BUFFER_SIZE+1);
    int bytes_peeked = (peek_buf != NULL)
        ? peek_exact_bytes(new_client->cSSL, BUFFER_SIZE, peek_buf)
        : 0;

    if (bytes_peeked > 0 && peek_buf != NULL) {
        if (bytes_peeked > BUFFER_SIZE) {
            bytes_peeked = BUFFER_SIZE;
        }
        peek_buf[bytes_peeked] = '\0';
        process_bytes(sockets, new_client, peek_buf, fd_count);
    } else {
        new_client->keep_alive = 0x0;
    }
    free(peek_buf);

    new_client->finished = 1;
    pthread_exit(NULL);
}



void start_listening_for_clients(char* port){
        SSL_library_init(); 
        SSL_load_error_strings(); 
        struct addrinfo hints;
        fill_address_info(&hints);
        /* Preallocate the full sockets/pfds arrays at MAX_CLIENTS so
         * insert_file_descriptor never has to grow them (which would
         * realloc the storage and invalidate every Socket* pointer the
         * worker threads are using — root cause of the SIGSEGV under
         * concurrent /etl/notebook/lint requests). */
        int max_socket_size = MAX_CLIENTS;
        fd_count = 0;
        sockets = malloc(sizeof(struct Socket) * max_socket_size);
        pfds =  malloc(sizeof(struct pollfd) * max_socket_size);
        int listener_fd = bind_address_to_port(port,hints);
        for (int i=0; i<fd_count; i++){
			struct Socket *socket = &sockets[i];
			socket->keep_alive = 0x0;
        }
        insert_file_descriptor(&sockets,&pfds, listener_fd,NULL,"localhost", &fd_count, &max_socket_size, 0x1);
	pthread_t threads[MAX_CLIENTS];
	struct Socket* clients[MAX_CLIENTS];
	int thread_count = 0;

	while(1) {
		// printf("Total Sockets: %d\n", fd_count);
	    int triggered_fd = wait_for_event(&pfds, fd_count);


	    if (triggered_fd == listener_fd) {
		struct Socket* new_client = accept_new_client(listener_fd, &sockets, &pfds, &fd_count, &max_socket_size);
		if (!new_client) continue;

		printf("FD Count: %d\n", fd_count);
		pthread_create(&threads[thread_count], NULL, process_thread, (void*)new_client);
		clients[thread_count] = new_client;
		thread_count++;
	    }else{
		    for (int i=0; i < fd_count;i++){
			    struct Socket* client = &sockets[i];
			    if (client->fd != triggered_fd){
				    continue;
			    }else{
				pthread_create(&threads[thread_count], NULL, process_thread, (void*)client);
				clients[thread_count] = client;
				thread_count++;
			    }
		    }
	    }
		for (int i = 0; i < thread_count; i++) {
		    if (clients[i]->finished) {
			//printf("Waiting for thread %d...\n", i);
			struct timespec ts;
			clock_gettime(CLOCK_REALTIME, &ts);
			ts.tv_sec += 10000;  

			int rc = pthread_timedjoin_np(threads[i], NULL, &ts);

			if (rc == 0) {
			    //printf("Thread %d joined successfully.\n", i);
			} else if (rc == ETIMEDOUT) {
			    printf("Thread %d timed out — cancelling.\n", i);
			    pthread_cancel(threads[i]);
			    pthread_join(threads[i], NULL); // ensure cleanup
			} else {
			    perror("pthread_timedjoin_np");
			}

			if (!clients[i]->keep_alive){
				/* WebsocketClient cleanup used to run inline here, doing
				 * 3 MySQL connect+query+disconnect cycles on the MAIN
				 * thread per closed connection. With even moderate
				 * traffic that pinned the accept loop on a libmysql
				 * futex and starved new TLS handshakes (the user-
				 * reported 30s ConnectTimeout). Defer the cleanup to
				 * the token reaper / a separate path. Orphaned rows
				 * are non-critical (lookup paths re-validate). */
				remove_file_descriptor(sockets, pfds, clients[i]->fd, &fd_count);
			}

			for (int j = i; j < thread_count - 1; j++) {
			    threads[j] = threads[j + 1];
			    clients[j] = clients[j + 1];
			}
			thread_count--;
			i--; 
		    }
		}
	}

}
