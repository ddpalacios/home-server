#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <netdb.h>
#include <openssl/ssl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>

#include "Socket.h"
#include "http_utilities.h"
#include "read_message.h"
#include "route.h"
#include "server.h"

#define BUFFER_SIZE 8192
#define WORKER_COUNT 16
#define QUEUE_CAPACITY 1024

struct fd_queue {
    int fds[QUEUE_CAPACITY];
    int head;
    int tail;
    int count;
    pthread_mutex_t mutex;
    pthread_cond_t cond;
};

static struct fd_queue g_queue;

static void queue_init(struct fd_queue *q) {
    memset(q, 0, sizeof(*q));
    pthread_mutex_init(&q->mutex, NULL);
    pthread_cond_init(&q->cond, NULL);
}

static int queue_push(struct fd_queue *q, int fd) {
    pthread_mutex_lock(&q->mutex);
    if (q->count >= QUEUE_CAPACITY) {
        pthread_mutex_unlock(&q->mutex);
        return -1;
    }
    q->fds[q->tail] = fd;
    q->tail = (q->tail + 1) % QUEUE_CAPACITY;
    q->count++;
    pthread_cond_signal(&q->cond);
    pthread_mutex_unlock(&q->mutex);
    return 0;
}

static int queue_pop(struct fd_queue *q) {
    pthread_mutex_lock(&q->mutex);
    while (q->count == 0) {
        pthread_cond_wait(&q->cond, &q->mutex);
    }
    int fd = q->fds[q->head];
    q->head = (q->head + 1) % QUEUE_CAPACITY;
    q->count--;
    pthread_mutex_unlock(&q->mutex);
    return fd;
}

int bind_address_to_port(char *port, struct addrinfo hints) {
    struct addrinfo *res = NULL;
    if (getaddrinfo(NULL, port, &hints, &res) != 0) {
        perror("getaddrinfo");
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
    if (listen(sockfd, 100) < 0) {
        perror("listen");
        exit(1);
    }
    printf("Listening on port %s\n", port);
    freeaddrinfo(res);
    return sockfd;
}

static void fill_address_info(struct addrinfo *hints) {
    memset(hints, 0, sizeof(*hints));
    hints->ai_family = AF_INET;
    hints->ai_socktype = SOCK_STREAM;
    hints->ai_flags = AI_PASSIVE;
}

static void handle_client(int fd) {
    struct timeval recv_timeout = { .tv_sec = 5, .tv_usec = 0 };
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &recv_timeout, sizeof(recv_timeout));

    SSL *cSSL = encrypt_socket(fd);
    if (!cSSL) {
        close(fd);
        return;
    }

    char *peek_buf = malloc(BUFFER_SIZE + 1);
    int bytes_peeked = peek_exact_bytes(cSSL, BUFFER_SIZE, peek_buf);
    if (bytes_peeked <= 0) {
        free(peek_buf);
        SSL_shutdown(cSSL);
        SSL_free(cSSL);
        close(fd);
        return;
    }
    if (bytes_peeked > BUFFER_SIZE) {
        bytes_peeked = BUFFER_SIZE;
    }
    peek_buf[bytes_peeked] = '\0';

    size_t header_buf_size = 65536;
    char *peeked_http_header = malloc(header_buf_size);
    memset(peeked_http_header, 0, header_buf_size);
    int header_length = get_http_header(peek_buf, peeked_http_header, header_buf_size);
    if (header_length <= 0) {
        free(peek_buf);
        free(peeked_http_header);
        SSL_shutdown(cSSL);
        SSL_free(cSSL);
        close(fd);
        return;
    }

    char *http_header = malloc(header_length + 4 + 1);
    int nbytes = read_exact_bytes(cSSL, header_length + 4, http_header);
    if (nbytes <= 0) {
        free(peek_buf);
        free(peeked_http_header);
        free(http_header);
        SSL_shutdown(cSSL);
        SSL_free(cSSL);
        close(fd);
        return;
    }
    http_header[nbytes] = '\0';

    int content_length = 0;
    char *value_start = strstr(peeked_http_header, "Content-Length: ");
    if (value_start != NULL) {
        char *content_length_val = strchr(value_start, ' ');
        if (content_length_val) {
            content_length_val++;
            content_length = atoi(content_length_val);
        }
    }

    char *body = NULL;
    if (content_length > 0) {
        body = malloc(content_length + 1);
        read_exact_bytes(cSSL, content_length, body);
        body[content_length] = '\0';
    }

    struct Socket socket = {0};
    socket.fd = fd;
    socket.cSSL = cSSL;
    process_route(&socket, http_header, body);

    free(peek_buf);
    free(peeked_http_header);
    free(http_header);
    if (body) {
        free(body);
    }

    SSL_shutdown(cSSL);
    SSL_free(cSSL);
    close(fd);
}

static void *worker_thread_main(void *arg) {
    (void)arg;
    while (1) {
        int fd = queue_pop(&g_queue);
        if (fd >= 0) {
            handle_client(fd);
        }
    }
    return NULL;
}

void start_listening_for_clients(char *port) {
    SSL_library_init();
    SSL_load_error_strings();
    signal(SIGPIPE, SIG_IGN);

    struct addrinfo hints;
    fill_address_info(&hints);
    int listener_fd = bind_address_to_port(port, hints);

    queue_init(&g_queue);
    for (int i = 0; i < WORKER_COUNT; i++) {
        pthread_t tid;
        if (pthread_create(&tid, NULL, worker_thread_main, NULL) == 0) {
            pthread_detach(tid);
        }
    }

    int fd_capacity = 16;
    int fd_count = 1;
    struct pollfd *pfds = malloc(sizeof(struct pollfd) * fd_capacity);
    pfds[0].fd = listener_fd;
    pfds[0].events = POLLIN;

    while (1) {
        if (poll(pfds, fd_count, -1) < 0) {
            perror("poll");
            continue;
        }

        for (int i = 0; i < fd_count; i++) {
            if (!(pfds[i].revents & POLLIN)) {
                continue;
            }

            if (pfds[i].fd == listener_fd) {
                struct sockaddr_storage remoteaddr;
                socklen_t addrlen = sizeof(remoteaddr);
                int newfd = accept(listener_fd, (struct sockaddr *)&remoteaddr, &addrlen);
                if (newfd < 0) {
                    perror("accept");
                    continue;
                }
                if (fd_count == fd_capacity) {
                    fd_capacity *= 2;
                    pfds = realloc(pfds, sizeof(struct pollfd) * fd_capacity);
                }
                pfds[fd_count].fd = newfd;
                pfds[fd_count].events = POLLIN;
                fd_count++;
            } else {
                int fd = pfds[i].fd;
                if (queue_push(&g_queue, fd) != 0) {
                    handle_client(fd);
                }
                pfds[i] = pfds[fd_count - 1];
                fd_count--;
                i--;
            }
        }
    }
}
