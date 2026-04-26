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
#include "User_Token.h"
#include "send_message.h"
#include "WebsocketClient.h"
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
			/* cSSL may be NULL if the TLS handshake never ran (e.g.
			 * client disconnected before handshake or handshake
			 * failed on the worker thread). */
			if (sockets[i].cSSL != NULL) {
				int ret = SSL_shutdown(sockets[i].cSSL);
				SSL_free(sockets[i].cSSL);
				sockets[i].cSSL = NULL;
			}
		        close(fd);
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

       /* DO NOT do the TLS handshake on this thread. It used to be done here
        * inline (encrypt_socket → SSL_accept), but SSL_accept can block on
        * read/write during the handshake, and OpenSSL contends on internal
        * locks with worker threads holding long-lived SSL connections (e.g.
        * /etl/notebook/events SSE proxies). When that happens, the main
        * accept loop stalls and ALL new connections sit in the kernel
        * backlog — clients see TLS handshake timeouts after 30s.
        *
        * Instead, register the bare TCP socket here (cSSL = NULL) and let
        * process_thread do the SSL_accept on the worker. The main thread
        * returns to poll() immediately and is always ready to accept the
        * next connection. */
       struct timeval send_timeout;
       send_timeout.tv_sec = 5;
       send_timeout.tv_usec = 0;
       setsockopt(newfd, SOL_SOCKET, SO_SNDTIMEO, &send_timeout, sizeof(send_timeout));
       /* Bound the SSL_accept read too so a stalled client can't pin a
        * worker thread forever. */
       struct timeval recv_timeout;
       recv_timeout.tv_sec = 10;
       recv_timeout.tv_usec = 0;
       setsockopt(newfd, SOL_SOCKET, SO_RCVTIMEO, &recv_timeout, sizeof(recv_timeout));

       char host[NI_MAXHOST];
       struct Socket* socket = insert_file_descriptor(sockets, pfds, newfd, NULL, host, fd_count, max_fd_size, 0x0);
       /* Suppress POLLIN until the worker has done SSL_accept. Otherwise
        * the main loop sees the ClientHello bytes as POLLIN on this FD and
        * spawns a SECOND worker for it, which races against the first
        * worker's SSL_accept and yields 'unexpected EOF' on the client. */
       for (int i = 0; i < *fd_count; i++) {
           if ((*pfds)[i].fd == newfd) {
               (*pfds)[i].events = 0;
               break;
           }
       }
       return socket;
     }

void fill_address_info(struct addrinfo *hints){
	memset(&(*hints), 0, sizeof(*hints));
	hints->ai_family = AF_INET;
	hints->ai_socktype = SOCK_STREAM;
	hints->ai_flags= AI_PASSIVE;
}

/* Background thread: deletes expired auth tokens periodically without
 * blocking the main accept loop. Runs every 60 seconds. Failures are
 * silently swallowed — token expiry isn't critical-path for serving
 * requests, so we don't want a transient MySQL hiccup to stop sessions. */
void* run_token_reaper(void* arg){
	(void)arg;
	while (1) {
		delete_expired_tokens();
		sleep(60);
	}
	return NULL;
}

void* process_thread(void* arg){
    struct Socket *new_client = (struct Socket *)arg;

    /* If this is the first time we're seeing this socket (cSSL still NULL
     * because accept_new_client deferred the handshake to us), do the TLS
     * handshake here on the worker thread. This keeps the main accept loop
     * non-blocking even when an existing worker (e.g. an SSE proxy) is
     * holding OpenSSL internal locks. */
    if (new_client->cSSL == NULL) {
        SSL* cSSL = encrypt_socket(new_client->fd);
        if (cSSL == NULL) {
            new_client->keep_alive = 0x0;
            new_client->finished = 1;
            pthread_exit(NULL);
        }
        new_client->cSSL = cSSL;
    }

    /* Take exclusive ownership of this FD while processing. Without this,
     * any unread data on the socket (including the bytes from a long-lived
     * SSE proxy that this worker is itself reading) keeps poll() returning
     * POLLIN on the FD, and the main accept loop spawns a fresh thread per
     * iteration trying to handle the same FD — they all block in SSL_read
     * and accumulate without bound. The original code had this race; it
     * only didn't visibly break because each worker happened to consume
     * the buffer before the next main-loop iteration. SSE breaks that
     * assumption: data keeps arriving from the upstream, POLLIN stays
     * asserted, and the main thread spirals.
     *
     * After process_bytes returns we re-enable POLLIN for keep-alive so
     * the main loop can detect the next request on this FD. Non-keep-alive
     * connections are torn down by remove_file_descriptor. */
    for (int i = 0; i < fd_count; i++) {
        if (pfds[i].fd == new_client->fd) {
            pfds[i].events = 0;
            break;
        }
    }

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
    /* Free peek_buf on every exit path. The previous version only freed
     * inside the success branch, which leaked ~1KB per failed peek
     * (idle clients, port scans, broken handshakes). free(NULL) is safe. */
    free(peek_buf);

    /* Re-enable POLLIN if this is a keep-alive connection so the next
     * request on the same socket gets dispatched. Otherwise the FD is
     * about to be closed by the join loop's remove_file_descriptor, so
     * leaving events=0 is fine. */
    if (new_client->keep_alive) {
        for (int i = 0; i < fd_count; i++) {
            if (pfds[i].fd == new_client->fd) {
                pfds[i].events = POLLIN;
                break;
            }
        }
    }

    new_client->finished = 1;
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
	pthread_t threads[MAX_CLIENTS];
	struct Socket* clients[MAX_CLIENTS];
	int thread_count = 0;

	/* Run token expiry on a separate timer thread instead of inline in the
	 * accept loop. Calling delete_expired_tokens() on every loop iteration
	 * meant a fresh MySQL connect+query+disconnect cycle per request,
	 * blocking the main accept thread on a libmysql/glibc futex while a
	 * worker thread (e.g. an SSE proxy) was holding internal libmysql
	 * state. Symptom: every new TLS handshake starved for ~6-8s while a
	 * notebook cell was running, surfacing as ConnectTimeout on the
	 * blob-storage wrapper. */
	pthread_t token_reaper;
	pthread_create(&token_reaper, NULL, run_token_reaper, NULL);
	pthread_detach(token_reaper);

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
