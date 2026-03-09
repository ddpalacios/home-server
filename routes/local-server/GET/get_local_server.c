#include <arpa/inet.h>
#include <netdb.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>
#include <stdio.h>

#include "http_utilities.h"
#include "Socket.h"

#define IPSTRLEN INET6_ADDRSTRLEN

static int connect_to_local_server(const char* host, const char* port) {
    struct addrinfo hints;
    struct addrinfo *addrs_res = NULL;
    memset(&hints, 0, sizeof(hints));
    char ipstr[IPSTRLEN];
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;

    const int status = getaddrinfo(host, port, &hints, &addrs_res);
    if (status != 0) {
        return -1;
    }

    int sfd = -1;
    int connected = -1;
    for (struct addrinfo *addr = addrs_res; addr != NULL; addr = addr->ai_next) {
        if (addr->ai_family == AF_INET) {
            struct sockaddr_in *ipv4 = (struct sockaddr_in *)addr->ai_addr;
            void *addr4 = &(ipv4->sin_addr);
            inet_ntop(addr->ai_family, addr4, ipstr, IPSTRLEN);
        } else {
            struct sockaddr_in6 *ipv6 = (struct sockaddr_in6 *)addr->ai_addr;
            void* addr6 = &(ipv6->sin6_addr);
            inet_ntop(addr->ai_family, addr6, ipstr, IPSTRLEN);
        }
        sfd = socket(addr->ai_family, addr->ai_socktype, addr->ai_protocol);
        if (sfd < 0) {
            continue;
        }
        connected = connect(sfd, addr->ai_addr, addr->ai_addrlen);
        if (connected == 0) {
            break;
        }
        close(sfd);
        sfd = -1;
    }

    freeaddrinfo(addrs_res);
    if (sfd >= 0 && connected == 0) {
        return sfd;
    }
    return -1;
}

void get_to_local(struct Socket* socket, char* http_header, char* body, char* route, const char* port) {
    (void)http_header;
    (void)body;

    int sfd = connect_to_local_server("127.0.0.1", port);
    if (sfd < 0) {
        send_response_code(socket->cSSL, 502);
        return;
    }

    size_t req_size = strlen(route) + 512;
    char *request = malloc(req_size);
    if (!request) {
        close(sfd);
        return;
    }

    snprintf(request, req_size,
        "GET %s HTTP/1.1\r\n"
        "Host: %s:%s\r\n"
        "Connection: close\r\n"
        "\r\n",
        route,
        "127.0.0.1", port);

    send(sfd, request, strlen(request), 0);
    free(request);

    char buf[8192];
    char *response = NULL;
    size_t total = 0;

    for (;;) {
        int bytes_recved = recv(sfd, buf, sizeof(buf), 0);
        if (bytes_recved <= 0) {
            break;
        }
        char *tmp = realloc(response, total + bytes_recved + 1);
        if (!tmp) {
            free(response);
            close(sfd);
            return;
        }
        response = tmp;
        memcpy(response + total, buf, bytes_recved);
        total += bytes_recved;
    }

    close(sfd);

    if (!response) {
        send_response_code(socket->cSSL, 502);
        return;
    }

    response[total] = '\0';
    char *header_end = strstr(response, "\r\n\r\n");
    if (!header_end) {
        free(response);
        send_response_code(socket->cSSL, 502);
        return;
    }

    char *res_body = header_end + 4;
    size_t body_len = total - (size_t)(res_body - response);

    if (strstr(route, ".css") != NULL) {
        send_css_response_code(socket->cSSL, 200, (int)body_len);
        SSL_write(socket->cSSL, res_body, body_len);
    } else if (strstr(route, ".js") != NULL) {
        send_buffer_response_code(socket->cSSL, 200, res_body, body_len);
    } else if (strstr(route, ".png") != NULL) {
        send_image_response_code(socket->cSSL, 200, (int)body_len);
        SSL_write(socket->cSSL, res_body, body_len);
    } else if (strstr(route, ".ico") != NULL) {
        send_favicon_response_code(socket->cSSL, 200, (int)body_len);
        SSL_write(socket->cSSL, res_body, body_len);
    } else if (strstr(route, ".html") != NULL) {
        send_html_response_code(socket->cSSL, 200, (int)body_len);
        SSL_write(socket->cSSL, res_body, body_len);
    } else {
        send_buffer_response_code(socket->cSSL, 200, res_body, body_len);
    }
    free(response);
}
