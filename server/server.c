#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <netdb.h>
#include <openssl/ssl.h>
#include <cjson/cJSON.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>

#include "Socket.h"
#include "http_utilities.h"
#include "read_message.h"
#include "route.h"
#include "server.h"

/* Peek buffer size for the initial HTTP request read. Must be large
 * enough to hold the full request line + every header up to the
 * \r\n\r\n terminator; otherwise get_http_header fails and the
 * connection is silently closed. 8KB was too tight for OAuth
 * callbacks where a large Flask session cookie + a long
 * authorization-code query string + ngrok-injected headers easily
 * exceed 8KB. 32KB matches MAX_HEADER_SIZE/2 with headroom. */
#define BUFFER_SIZE 32768
#define WORKER_COUNT 16
#define QUEUE_CAPACITY 1024
#define MAX_WEBSOCKET_PAYLOAD (64 * 1024 * 1024)
#define MAX_BODY_SIZE (10 * 1024 * 1024)
#define MAX_HEADER_SIZE (65536)
#define VOICE_BRIDGE_HOST "127.0.0.1"
#define VOICE_BRIDGE_PORT "7001"
#define VOICE_LOG_EVERY_MEDIA 100

struct fd_queue {
    int fds[QUEUE_CAPACITY];
    int head;
    int tail;
    int count;
    pthread_mutex_t mutex;
    pthread_cond_t cond;
};

static struct fd_queue g_queue;

struct websocket_frame {
    int fin;
    int opcode;
    uint64_t payload_length;
    unsigned char *payload;
};

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

static int header_has_token(const char *http_header, const char *header_name, const char *token) {
    char pattern[128];
    snprintf(pattern, sizeof(pattern), "\r\n%s:", header_name);

    const char *line = strcasestr(http_header, pattern);
    if (!line) {
        if (strncasecmp(http_header, header_name, strlen(header_name)) == 0 &&
            http_header[strlen(header_name)] == ':') {
            line = http_header;
        } else {
            return 0;
        }
    } else {
        line += 2;
    }

    const char *value = strchr(line, ':');
    if (!value) {
        return 0;
    }
    value++;

    const char *line_end = strstr(value, "\r\n");
    size_t value_len = line_end ? (size_t)(line_end - value) : strlen(value);
    size_t token_len = strlen(token);

    for (size_t i = 0; i + token_len <= value_len; i++) {
        if (strncasecmp(value + i, token, token_len) != 0) {
            continue;
        }
        int before_ok = (i == 0 || value[i - 1] == ' ' || value[i - 1] == '\t' || value[i - 1] == ',');
        int after_ok = (i + token_len == value_len ||
                        value[i + token_len] == ' ' ||
                        value[i + token_len] == '\t' ||
                        value[i + token_len] == ',');
        if (before_ok && after_ok) {
            return 1;
        }
    }
    return 0;
}

static int get_header_value_case(const char *http_header, const char *header_name,
                                 char *value, size_t value_size) {
    if (!http_header || !header_name || !value || value_size == 0) {
        return 0;
    }
    value[0] = '\0';

    const char *line = http_header;
    size_t header_name_len = strlen(header_name);
    while (line && *line) {
        const char *line_end = strstr(line, "\r\n");
        size_t line_len = line_end ? (size_t)(line_end - line) : strlen(line);
        if (line_len > header_name_len &&
            strncasecmp(line, header_name, header_name_len) == 0 &&
            line[header_name_len] == ':') {
            const char *start = line + header_name_len + 1;
            while (*start == ' ' || *start == '\t') {
                start++;
            }
            size_t len = line_len - (size_t)(start - line);
            while (len > 0 && (start[len - 1] == ' ' || start[len - 1] == '\t')) {
                len--;
            }
            if (len >= value_size) {
                len = value_size - 1;
            }
            memcpy(value, start, len);
            value[len] = '\0';
            return 1;
        }
        if (!line_end) {
            break;
        }
        line = line_end + 2;
    }
    return 0;
}

static int is_websocket_request(const char *http_header) {
    if (!http_header || strncmp(http_header, "GET ", 4) != 0) {
        return 0;
    }
    if (!strstr(http_header, "HTTP/1.1")) {
        return 0;
    }
    if (!header_has_token(http_header, "Upgrade", "websocket")) {
        return 0;
    }
    if (!header_has_token(http_header, "Connection", "Upgrade")) {
        return 0;
    }
    if (!strcasestr(http_header, "\r\nSec-WebSocket-Key:") &&
        strncasecmp(http_header, "Sec-WebSocket-Key:", 18) != 0) {
        return 0;
    }
    if (!strcasestr(http_header, "\r\nSec-WebSocket-Version: 13") &&
        !strcasestr(http_header, "\r\nSec-WebSocket-Version:13")) {
        return 0;
    }
    return 1;
}

static int ssl_write_all(SSL *ssl, const unsigned char *buf, size_t len) {
    size_t written = 0;
    while (written < len) {
        size_t chunk = len - written;
        if (chunk > INT32_MAX) {
            chunk = INT32_MAX;
        }
        int n = SSL_write(ssl, buf + written, (int)chunk);
        if (n <= 0) {
            return 0;
        }
        written += (size_t)n;
    }
    return 1;
}

static int send_websocket_frame(SSL *ssl, int opcode, const unsigned char *payload, uint64_t payload_length) {
    unsigned char header[10];
    size_t header_len = 2;

    header[0] = 0x80 | (opcode & 0x0f);
    if (payload_length <= 125) {
        header[1] = (unsigned char)payload_length;
    } else if (payload_length <= 0xffff) {
        header[1] = 126;
        header[2] = (unsigned char)((payload_length >> 8) & 0xff);
        header[3] = (unsigned char)(payload_length & 0xff);
        header_len = 4;
    } else {
        header[1] = 127;
        for (int i = 0; i < 8; i++) {
            header[2 + i] = (unsigned char)((payload_length >> (56 - (i * 8))) & 0xff);
        }
        header_len = 10;
    }

    if (!ssl_write_all(ssl, header, header_len)) {
        return 0;
    }
    if (payload_length > 0 && payload) {
        return ssl_write_all(ssl, payload, (size_t)payload_length);
    }
    return 1;
}

static int connect_voice_bridge(void) {
    struct addrinfo hints;
    struct addrinfo *res = NULL;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    if (getaddrinfo(VOICE_BRIDGE_HOST, VOICE_BRIDGE_PORT, &hints, &res) != 0) {
        return -1;
    }

    int fd = -1;
    for (struct addrinfo *addr = res; addr; addr = addr->ai_next) {
        fd = socket(addr->ai_family, addr->ai_socktype, addr->ai_protocol);
        if (fd < 0) {
            continue;
        }
        if (connect(fd, addr->ai_addr, addr->ai_addrlen) == 0) {
            break;
        }
        close(fd);
        fd = -1;
    }

    freeaddrinfo(res);
    if (fd >= 0) {
        printf("Voice bridge connected to %s:%s\n", VOICE_BRIDGE_HOST, VOICE_BRIDGE_PORT);
    } else {
        printf("Voice bridge connection failed to %s:%s\n", VOICE_BRIDGE_HOST, VOICE_BRIDGE_PORT);
    }
    return fd;
}

static int send_all_fd(int fd, const unsigned char *buf, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        ssize_t n = send(fd, buf + sent, len - sent, 0);
        if (n <= 0) {
            return 0;
        }
        sent += (size_t)n;
    }
    return 1;
}

static int send_voice_bridge_json(int fd, const unsigned char *payload, uint64_t payload_length) {
    if (fd < 0 || !payload) {
        return 0;
    }
    if (!send_all_fd(fd, payload, (size_t)payload_length)) {
        return 0;
    }
    return send_all_fd(fd, (const unsigned char *)"\n", 1);
}

static int read_voice_bridge_lines(int fd, SSL *twilio_ssl, char *buffer, size_t *buffer_len,
                                   size_t buffer_size) {
    char chunk[8192];
    ssize_t n = recv(fd, chunk, sizeof(chunk), 0);
    if (n <= 0) {
        return 0;
    }
    if (*buffer_len + (size_t)n >= buffer_size) {
        *buffer_len = 0;
        printf("Voice bridge receive buffer overflow; clearing buffer\n");
        return 1;
    }

    memcpy(buffer + *buffer_len, chunk, (size_t)n);
    *buffer_len += (size_t)n;
    buffer[*buffer_len] = '\0';

    char *start = buffer;
    char *newline = NULL;
    while ((newline = memchr(start, '\n', buffer + *buffer_len - start)) != NULL) {
        size_t line_len = (size_t)(newline - start);
        while (line_len > 0 && start[line_len - 1] == '\r') {
            line_len--;
        }
        if (line_len > 0) {
            send_websocket_frame(twilio_ssl, 0x1, (const unsigned char *)start, line_len);
        }
        start = newline + 1;
    }

    size_t remaining = (size_t)(buffer + *buffer_len - start);
    if (remaining > 0 && start != buffer) {
        memmove(buffer, start, remaining);
    }
    *buffer_len = remaining;
    buffer[*buffer_len] = '\0';
    return 1;
}

static int read_websocket_frame(SSL *ssl, struct websocket_frame *frame) {
    unsigned char header[2];
    memset(frame, 0, sizeof(*frame));

    if (read_exact_bytes(ssl, 2, (char *)header) != 2) {
        return 0;
    }

    frame->fin = (header[0] & 0x80) != 0;
    frame->opcode = header[0] & 0x0f;
    int masked = (header[1] & 0x80) != 0;
    uint64_t payload_length = header[1] & 0x7f;

    if (payload_length == 126) {
        unsigned char extended[2];
        if (read_exact_bytes(ssl, 2, (char *)extended) != 2) {
            return 0;
        }
        payload_length = ((uint64_t)extended[0] << 8) | extended[1];
    } else if (payload_length == 127) {
        unsigned char extended[8];
        if (read_exact_bytes(ssl, 8, (char *)extended) != 8) {
            return 0;
        }
        payload_length = 0;
        for (int i = 0; i < 8; i++) {
            payload_length = (payload_length << 8) | extended[i];
        }
        if (payload_length & (1ULL << 63)) {
            return 0;
        }
    }

    if (!masked) {
        return 0;
    }
    if (payload_length > MAX_WEBSOCKET_PAYLOAD) {
        return 0;
    }

    unsigned char mask[4];
    if (read_exact_bytes(ssl, 4, (char *)mask) != 4) {
        return 0;
    }

    frame->payload_length = payload_length;
    frame->payload = malloc((size_t)payload_length + 1);
    if (!frame->payload) {
        return 0;
    }

    if (payload_length > 0 &&
        read_exact_bytes(ssl, (int)payload_length, (char *)frame->payload) != (int)payload_length) {
        free(frame->payload);
        frame->payload = NULL;
        return 0;
    }

    for (uint64_t i = 0; i < payload_length; i++) {
        frame->payload[i] ^= mask[i % 4];
    }
    frame->payload[payload_length] = '\0';
    return 1;
}

static void log_twilio_websocket_event(const unsigned char *payload, uint64_t payload_length,
                                       int *voice_bridge_fd, int *media_count) {
    if (!payload || payload_length == 0) {
        return;
    }

    cJSON *root = cJSON_Parse((const char *)payload);
    if (!root) {
        printf("WebSocket text length=%llu\n", (unsigned long long)payload_length);
        return;
    }

    cJSON *event_item = cJSON_GetObjectItemCaseSensitive(root, "event");
    const char *event = cJSON_IsString(event_item) ? event_item->valuestring : "";

    if (strcmp(event, "connected") == 0) {
        printf("Twilio event=connected\n");
    } else if (strcmp(event, "start") == 0) {
        cJSON *start = cJSON_GetObjectItemCaseSensitive(root, "start");
        cJSON *stream_sid = start ? cJSON_GetObjectItemCaseSensitive(start, "streamSid") : NULL;
        cJSON *call_sid = start ? cJSON_GetObjectItemCaseSensitive(start, "callSid") : NULL;
        printf("Twilio event=start streamSid=%s callSid=%s\n",
               cJSON_IsString(stream_sid) ? stream_sid->valuestring : "",
               cJSON_IsString(call_sid) ? call_sid->valuestring : "");
        if (voice_bridge_fd && *voice_bridge_fd < 0) {
            *voice_bridge_fd = connect_voice_bridge();
        }
    } else if (strcmp(event, "media") == 0) {
        cJSON *media = cJSON_GetObjectItemCaseSensitive(root, "media");
        cJSON *media_payload = media ? cJSON_GetObjectItemCaseSensitive(media, "payload") : NULL;
        const char *audio = cJSON_IsString(media_payload) ? media_payload->valuestring : "";
        if (media_count) {
            (*media_count)++;
            if (*media_count == 1 || *media_count % VOICE_LOG_EVERY_MEDIA == 0) {
                printf("Twilio media frames=%d payload_length=%zu\n", *media_count, strlen(audio));
            }
        }
    } else if (strcmp(event, "stop") == 0) {
        printf("Twilio event=stop\n");
    } else {
        printf("Twilio event=%s length=%llu\n", event, (unsigned long long)payload_length);
    }

    if (voice_bridge_fd && *voice_bridge_fd >= 0) {
        if (!send_voice_bridge_json(*voice_bridge_fd, payload, payload_length)) {
            close(*voice_bridge_fd);
            *voice_bridge_fd = -1;
            printf("Voice bridge disconnected while sending\n");
        }
    }

    cJSON_Delete(root);
}

/* Read the HTTP request from the SSL stream into `buf` until the
 * header terminator (\r\n\r\n) is found. Returns the total number of
 * bytes read, or 0 on error/timeout/buffer-overflow.
 *
 * Replaces the old peek-only approach: SSL_peek can only return data
 * already decrypted into a single TLS record (~16KB max). When
 * headers span multiple records — common with browsers sending big
 * cookies, ngrok-injected forwarding headers, and long OAuth-callback
 * URLs — the peek loop spins on the same first-record data forever.
 *
 * This consumes the bytes; callers must not re-read the same range
 * via SSL_read. Any bytes past the header terminator (i.e. body
 * prefix for POST requests) live at &buf[total_read] minus the
 * header length and need to be prepended to the body buffer. */
static int read_http_header(SSL *ssl, char *buf, int buf_size) {
    int total = 0;
    while (total < buf_size - 1) {
        int n = SSL_read(ssl, buf + total, buf_size - 1 - total);
        if (n <= 0) {
            return 0;
        }
        total += n;
        buf[total] = '\0';
        /* memmem in case any embedded NULs would confuse strstr. */
        if (memmem(buf, total, "\r\n\r\n", 4)) {
            return total;
        }
    }
    return 0;
}

static void handle_websocket_connection(struct Socket *socket, char *http_header) {
    SSL *ssl = socket->cSSL;
    char websocket_key[128];
    if (!get_header_value_case(http_header, "Sec-WebSocket-Key", websocket_key, sizeof(websocket_key))) {
        send_response_code(ssl, 400);
        return;
    }

    char *accept_key = generate_websocket_accptKey(websocket_key);
    if (!accept_key || switch_to_websocket_protocol(ssl, accept_key) <= 0) {
        send_response_code(ssl, 400);
        return;
    }

    socket->keep_alive = 1;
    int voice_bridge_fd = -1;
    int media_count = 0;
    char voice_bridge_buffer[262144];
    size_t voice_bridge_buffer_len = 0;
    printf("WebSocket connection established on fd %d\n", socket->fd);

    while (socket->keep_alive) {
        struct pollfd pfds[2];
        int poll_count = 1;
        pfds[0].fd = socket->fd;
        pfds[0].events = POLLIN;
        pfds[0].revents = 0;
        if (voice_bridge_fd >= 0) {
            pfds[1].fd = voice_bridge_fd;
            pfds[1].events = POLLIN;
            pfds[1].revents = 0;
            poll_count = 2;
        }

        int ready = poll(pfds, poll_count, -1);
        if (ready <= 0) {
            continue;
        }

        if (voice_bridge_fd >= 0 && (pfds[1].revents & (POLLIN | POLLHUP | POLLERR))) {
            if (!read_voice_bridge_lines(voice_bridge_fd, ssl, voice_bridge_buffer,
                                         &voice_bridge_buffer_len, sizeof(voice_bridge_buffer))) {
                close(voice_bridge_fd);
                voice_bridge_fd = -1;
                voice_bridge_buffer_len = 0;
                printf("Voice bridge disconnected\n");
            }
        }

        if (!(pfds[0].revents & (POLLIN | POLLHUP | POLLERR))) {
            continue;
        }

        struct websocket_frame frame;
        if (!read_websocket_frame(ssl, &frame)) {
            break;
        }

        if (frame.opcode == 0x8) {
            send_websocket_frame(ssl, 0x8, frame.payload, frame.payload_length);
            socket->keep_alive = 0;
        } else if (frame.opcode == 0x9) {
            send_websocket_frame(ssl, 0xA, frame.payload, frame.payload_length);
        } else if (frame.opcode == 0x1) {
            log_twilio_websocket_event(frame.payload, frame.payload_length, &voice_bridge_fd, &media_count);
        } else if (frame.opcode == 0x2 || frame.opcode == 0x0) {
            printf("WebSocket frame opcode=%d length=%llu\n",
                   frame.opcode,
                   (unsigned long long)frame.payload_length);
        }

        free(frame.payload);
    }

    if (voice_bridge_fd >= 0) {
        close(voice_bridge_fd);
    }
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

    /* Read everything up to and including the \r\n\r\n header terminator
     * (and possibly some body prefix bytes that arrived in the same
     * SSL_read call) into peek_buf. */
    char *peek_buf = malloc(BUFFER_SIZE + 1);
    int total_read = read_http_header(cSSL, peek_buf, BUFFER_SIZE);
    if (total_read <= 0) {
        free(peek_buf);
        SSL_shutdown(cSSL);
        SSL_free(cSSL);
        close(fd);
        return;
    }
    peek_buf[total_read] = '\0';

    /* Locate the header/body boundary. */
    char *header_end = memmem(peek_buf, total_read, "\r\n\r\n", 4);
    if (!header_end) {
        /* read_http_header guarantees \r\n\r\n was found before returning,
         * so this is defensive only. */
        free(peek_buf);
        SSL_shutdown(cSSL);
        SSL_free(cSSL);
        close(fd);
        return;
    }
    size_t header_length = (size_t)(header_end - peek_buf);

    size_t header_buf_size = 65536;
    char *peeked_http_header = malloc(header_buf_size);
    if (header_length + 1 > header_buf_size) {
        free(peek_buf);
        free(peeked_http_header);
        SSL_shutdown(cSSL);
        SSL_free(cSSL);
        return;
    }
    memcpy(peeked_http_header, peek_buf, header_length);
    peeked_http_header[header_length] = '\0';

    /* http_header is the headers PLUS the \r\n\r\n terminator (preserves
     * the contract from the prior peek+read implementation). */
    char *http_header = malloc(header_length + 4 + 1);
    memcpy(http_header, peek_buf, header_length + 4);
    http_header[header_length + 4] = '\0';

    /* Anything past the terminator is the start of the body, already
     * consumed from the SSL stream. Stash it for the body-read step. */
    size_t body_prefix_len = (size_t)total_read - (header_length + 4);
    char *body_prefix = NULL;
    if (body_prefix_len > 0) {
        body_prefix = malloc(body_prefix_len);
        memcpy(body_prefix, peek_buf + header_length + 4, body_prefix_len);
    }

    struct Socket socket = {0};
    socket.fd = fd;
    socket.cSSL = cSSL;

    if (is_websocket_request(http_header)) {
        handle_websocket_connection(&socket, http_header);
        free(peek_buf);
        free(peeked_http_header);
        free(http_header);
        if (body_prefix) free(body_prefix);
        SSL_shutdown(cSSL);
        SSL_free(cSSL);
        close(fd);
        return;
    }

    int content_length = 0;
    char *value_start = strstr(peeked_http_header, "Content-Length: ");
    if (value_start != NULL) {
        char *content_length_val = strchr(value_start, ' ');
        if (content_length_val) {
            content_length_val++;
            content_length = atoi(content_length_val);
        }
    }

    if (content_length < 0 || content_length > MAX_BODY_SIZE) {
        free(peek_buf);
        free(peeked_http_header);
        free(http_header);
        if (body_prefix) free(body_prefix);
        const char *r413 = "HTTP/1.1 413 Content Too Large\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        SSL_write(cSSL, r413, (int)strlen(r413));
        SSL_shutdown(cSSL);
        SSL_free(cSSL);
        close(fd);
        return;
    }

    char *body = NULL;
    if (content_length > 0) {
        body = malloc(content_length + 1);
        /* Copy any body bytes that arrived alongside the headers, then
         * read the remainder from the SSL stream. */
        size_t already = body_prefix_len;
        if (already > (size_t)content_length) already = (size_t)content_length;
        if (already > 0) {
            memcpy(body, body_prefix, already);
        }
        if ((size_t)content_length > already) {
            read_exact_bytes(cSSL, content_length - (int)already, body + already);
        }
        body[content_length] = '\0';
    }

    process_route(&socket, http_header, body);

    free(peek_buf);
    free(peeked_http_header);
    free(http_header);
    if (body) {
        free(body);
    }
    if (body_prefix) {
        free(body_prefix);
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
                    /* Worker pool saturated — drop the connection immediately
                     * rather than blocking the accept thread. */
                    close(fd);
                }
                pfds[i] = pfds[fd_count - 1];
                fd_count--;
                i--;
            }
        }
    }
}
