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

    const char *cookie_header = NULL;
    char *fwd_host = NULL;
    if (http_header) {
        const char *cookie_start = strstr(http_header, "\r\nCookie:");
        if (!cookie_start && strncmp(http_header, "Cookie:", 7) == 0) {
            cookie_start = http_header;
        }
        if (cookie_start) {
            cookie_start += (cookie_start == http_header) ? 7 : 9;
            while (*cookie_start == ' ') cookie_start++;
            const char *cookie_end = strstr(cookie_start, "\r\n");
            if (cookie_end && cookie_end > cookie_start) {
                size_t len = (size_t)(cookie_end - cookie_start);
                char *cookie_val = malloc(len + 1);
                if (cookie_val) {
                    memcpy(cookie_val, cookie_start, len);
                    cookie_val[len] = '\0';
                    cookie_header = cookie_val;
                }
            }
        }

        /* Pull original Host so we can forward it as X-Forwarded-Host. */
        const char *host_start = strstr(http_header, "\r\nHost:");
        if (!host_start && strncmp(http_header, "Host:", 5) == 0) {
            host_start = http_header;
        }
        if (host_start) {
            host_start += (host_start == http_header) ? 5 : 7;
            while (*host_start == ' ') host_start++;
            const char *host_end = strstr(host_start, "\r\n");
            if (host_end && host_end > host_start) {
                size_t len = (size_t)(host_end - host_start);
                fwd_host = malloc(len + 1);
                if (fwd_host) {
                    memcpy(fwd_host, host_start, len);
                    fwd_host[len] = '\0';
                }
            }
        }
    }

    size_t req_size = strlen(route) + 1024 + (cookie_header ? strlen(cookie_header) : 0) + (fwd_host ? strlen(fwd_host) : 0);
    char *request = malloc(req_size);
    if (!request) {
        if (cookie_header) free((void *)cookie_header);
        if (fwd_host) free(fwd_host);
        close(sfd);
        return;
    }

    /* Always forward https for X-Forwarded-Proto since home-server terminates TLS on the public side. */
    if (cookie_header && fwd_host) {
        snprintf(request, req_size,
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "X-Forwarded-Host: %s\r\n"
            "X-Forwarded-Proto: https\r\n"
            "Connection: close\r\n"
            "Cookie: %s\r\n"
            "\r\n",
            route, "127.0.0.1", port, fwd_host, cookie_header);
    } else if (fwd_host) {
        snprintf(request, req_size,
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "X-Forwarded-Host: %s\r\n"
            "X-Forwarded-Proto: https\r\n"
            "Connection: close\r\n"
            "\r\n",
            route, "127.0.0.1", port, fwd_host);
    } else if (cookie_header) {
        snprintf(request, req_size,
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "Connection: close\r\n"
            "Cookie: %s\r\n"
            "\r\n",
            route, "127.0.0.1", port, cookie_header);
    } else {
        snprintf(request, req_size,
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "Connection: close\r\n"
            "\r\n",
            route, "127.0.0.1", port);
    }

    send(sfd, request, strlen(request), 0);
    free(request);
    if (cookie_header) free((void *)cookie_header);
    if (fwd_host) free(fwd_host);

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

    if (strstr(route, "/auth/") != NULL) {
        SSL_write(socket->cSSL, response, total);
        free(response);
        return;
    }

    char *res_body = header_end + 4;
    size_t body_len = total - (size_t)(res_body - response);

    int status_code = 200;
    if (sscanf(response, "HTTP/%*s %d", &status_code) != 1) {
        status_code = 200;
    }

    size_t header_len = (size_t)(header_end - response);
    char *header_block = malloc(header_len + 1);
    if (header_block) {
        memcpy(header_block, response, header_len);
        header_block[header_len] = '\0';
    }

    char *location = NULL;
    char *content_type = NULL;
    char **cookies = NULL;
    size_t cookie_count = 0;

    if (header_block) {
        char *line = strtok(header_block, "\r\n");
        while (line) {
            if (strncasecmp(line, "Location:", 9) == 0) {
                char *val = line + 9;
                while (*val == ' ') val++;
                location = strdup(val);
            } else if (strncasecmp(line, "Content-Type:", 13) == 0) {
                char *val = line + 13;
                while (*val == ' ') val++;
                content_type = strdup(val);
            } else if (strncasecmp(line, "Set-Cookie:", 11) == 0) {
                char *val = line + 11;
                while (*val == ' ') val++;
                char **tmp = realloc(cookies, sizeof(char*) * (cookie_count + 1));
                if (tmp) {
                    cookies = tmp;
                    cookies[cookie_count++] = strdup(val);
                }
            }
            line = strtok(NULL, "\r\n");
        }
    }

    if ((status_code >= 300 && status_code < 400) || cookie_count > 0 || location) {
        char header_out[4096];
        int offset = 0;
        offset = snprintf(header_out, sizeof(header_out), "HTTP/1.1 %d\r\n", status_code);
        if (location) {
            offset += snprintf(header_out + offset, sizeof(header_out) - offset, "Location: %s\r\n", location);
        }
        for (size_t i = 0; i < cookie_count; i++) {
            offset += snprintf(header_out + offset, sizeof(header_out) - offset, "Set-Cookie: %s\r\n", cookies[i]);
        }
        if (content_type) {
            offset += snprintf(header_out + offset, sizeof(header_out) - offset, "Content-Type: %s\r\n", content_type);
        }
        offset += snprintf(header_out + offset, sizeof(header_out) - offset,
                           "Access-Control-Allow-Origin: *\r\n"
                           "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                           "Access-Control-Allow-Headers: Content-Type\r\n");
        offset += snprintf(header_out + offset, sizeof(header_out) - offset, "Content-Length: %zu\r\n\r\n", body_len);
        SSL_write(socket->cSSL, header_out, offset);
        if (body_len > 0) {
            SSL_write(socket->cSSL, res_body, body_len);
        }
        if (location) free(location);
        if (content_type) free(content_type);
        for (size_t i = 0; i < cookie_count; i++) {
            free(cookies[i]);
        }
        free(cookies);
        free(header_block);
        free(response);
        return;
    }

    if (content_type && strstr(route, "/instagram/images/") != NULL) {
        char header_out[2048];
        const char *status_text = (status_code == 200) ? "OK" : get_code_message(status_code);
        int header_len = snprintf(header_out, sizeof(header_out),
                                  "HTTP/1.1 %d %s\r\n"
                                  "Content-Type: %s\r\n"
                                  "Access-Control-Allow-Origin: *\r\n"
                                  "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                                  "Access-Control-Allow-Headers: Content-Type\r\n"
                                  "Connection: close\r\n"
                                  "Content-Length: %zu\r\n"
                                  "\r\n",
                                  status_code, status_text, content_type, body_len);
        SSL_write(socket->cSSL, header_out, header_len);
        if (body_len > 0) {
            SSL_write(socket->cSSL, res_body, body_len);
        }
        if (location) free(location);
        if (content_type) free(content_type);
        for (size_t i = 0; i < cookie_count; i++) {
            free(cookies[i]);
        }
        free(cookies);
        free(header_block);
        free(response);
        return;
    }

    if (strstr(route, "/dashboard") != NULL || strstr(route, "/messages") != NULL) {
        send_html_response_code(socket->cSSL, 200, (int)body_len);
        SSL_write(socket->cSSL, res_body, body_len);
    } else if (strstr(route, ".css") != NULL) {
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
    if (location) free(location);
    if (content_type) free(content_type);
    for (size_t i = 0; i < cookie_count; i++) {
        free(cookies[i]);
    }
    free(cookies);
    free(header_block);
    free(response);
}
