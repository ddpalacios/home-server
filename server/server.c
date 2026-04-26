/*
 * server.c — minimal TLS HTTP server for ETL + blob storage.
 *
 * Architecture: thread-per-connection with no shared state between
 * connections. Main thread does ONE thing — accept + TLS handshake —
 * then hands the entire connection lifecycle to a detached worker
 * thread. The worker processes the request, sends the response, tears
 * down SSL, closes the FD, frees the heap-allocated Socket struct,
 * and exits. Main never tracks the connection again, never joins,
 * never touches the SSL object.
 *
 * This replaces the previous design (shared sockets[]/pfds[] arrays,
 * remove_file_descriptor's swap-with-last, SSL teardown on the main
 * thread's join section) which had multiple data races that caused
 * SIGSEGVs inside libssl under concurrent requests.
 */
#define _GNU_SOURCE
#include <pthread.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <netdb.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <openssl/ssl.h>
#include "Socket.h"
#include "route.h"
#include "server.h"
#include "read_message.h"

#define BUFFER_SIZE 1024
#define LISTEN_BACKLOG 256

/* Global pointer used by request handlers that historically broadcast to
 * every connection (websocket fan-out). Now unused, but the parameter is
 * still wired through process_bytes/process_route. We pass NULL. */
struct Socket *sockets = NULL;
struct pollfd *pfds = NULL;
int fd_count = 0;

static int bind_address_to_port(const char* port){
    struct addrinfo hints;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_flags = AI_PASSIVE;

    struct addrinfo *res = NULL;
    if (getaddrinfo(NULL, port, &hints, &res) != 0 || res == NULL) {
        fprintf(stderr, "getaddrinfo failed for port %s\n", port);
        exit(1);
    }
    int sockfd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (sockfd < 0) {
        perror("socket");
        exit(1);
    }
    int yes = 1;
    setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int));
    if (bind(sockfd, res->ai_addr, res->ai_addrlen) < 0) {
        perror("bind");
        exit(1);
    }
    if (listen(sockfd, LISTEN_BACKLOG) < 0) {
        perror("listen");
        exit(1);
    }
    freeaddrinfo(res);
    printf("Listening on port %s\n", port);
    return sockfd;
}

/* Worker thread: handles ONE connection from start to finish.
 *
 * The Socket struct is heap-allocated by main and ownership transfers
 * here. We free it before exiting. The cSSL is owned by us — main does
 * not touch it after spawning. */
static void* worker_thread(void* arg){
    struct Socket *client = (struct Socket *)arg;

    /* Peek the first chunk to learn the request type. read_message.c's
     * process_bytes will then call read_exact_bytes to actually consume
     * the bytes from the SSL stream. */
    char *peek_buf = malloc(BUFFER_SIZE + 1);
    if (peek_buf != NULL) {
        int n = peek_exact_bytes(client->cSSL, BUFFER_SIZE, peek_buf);
        if (n > 0) {
            if (n > BUFFER_SIZE) n = BUFFER_SIZE;
            peek_buf[n] = '\0';
            process_bytes(NULL, client, peek_buf, 0);
        }
        free(peek_buf);
    }

    /* Full TLS + TCP teardown. Single-thread access to cSSL: this thread
     * is the only one that ever touches it after the handshake completed
     * on main, so no races, no double-free, no SIGSEGV in libssl. */
    if (client->cSSL != NULL) {
        SSL_shutdown(client->cSSL);
        SSL_free(client->cSSL);
        client->cSSL = NULL;
    }
    if (client->fd >= 0) {
        close(client->fd);
        client->fd = -1;
    }
    if (client->Id != NULL) free(client->Id);
    free(client);
    return NULL;
}

void start_listening_for_clients(char* port){
    SSL_library_init();
    SSL_load_error_strings();
    ssl_ctx_init();

    int listener_fd = bind_address_to_port(port);

    /* Make worker threads detached by default — main never joins them. */
    pthread_attr_t worker_attrs;
    pthread_attr_init(&worker_attrs);
    pthread_attr_setdetachstate(&worker_attrs, PTHREAD_CREATE_DETACHED);

    while (1) {
        struct sockaddr_storage remoteaddr;
        socklen_t addrlen = sizeof(remoteaddr);
        int newfd = accept(listener_fd, (struct sockaddr *)&remoteaddr, &addrlen);
        if (newfd < 0) {
            perror("accept");
            continue;
        }

        /* TLS handshake on the main thread. encrypt_socket() is short
         * (~ms on localhost) and serializing here keeps the SSL_CTX
         * setup deterministic. If we ever want concurrent handshakes
         * we'd need OpenSSL's per-thread error queue management on the
         * worker side too, which we currently rely on libssl's
         * 1.1.0+ implicit thread safety for. */
        SSL *cSSL = encrypt_socket(newfd);
        if (cSSL == NULL) {
            close(newfd);
            continue;
        }

        struct timeval send_timeout = { .tv_sec = 30, .tv_usec = 0 };
        setsockopt(newfd, SOL_SOCKET, SO_SNDTIMEO, &send_timeout, sizeof(send_timeout));
        struct timeval recv_timeout = { .tv_sec = 30, .tv_usec = 0 };
        setsockopt(newfd, SOL_SOCKET, SO_RCVTIMEO, &recv_timeout, sizeof(recv_timeout));

        /* Heap-allocate the Socket so its address stays stable for the
         * worker. Worker free()s it before exiting. */
        struct Socket *client = calloc(1, sizeof(struct Socket));
        if (client == NULL) {
            SSL_shutdown(cSSL);
            SSL_free(cSSL);
            close(newfd);
            continue;
        }
        client->fd = newfd;
        client->cSSL = cSSL;
        client->keep_alive = 0;
        client->is_listener = 0;
        client->is_tcp = 0;
        client->isEmail = 0;
        client->finished = 0;
        client->jobId = "";
        client->Id = NULL;

        pthread_t tid;
        if (pthread_create(&tid, &worker_attrs, worker_thread, client) != 0) {
            perror("pthread_create");
            SSL_shutdown(cSSL);
            SSL_free(cSSL);
            close(newfd);
            free(client);
            continue;
        }
        /* Detached attribute set above means we don't need to join. */
    }

    pthread_attr_destroy(&worker_attrs);
}
