#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <openssl/ssl.h>
#include "Socket.h"
#include "route.h"
#include "http_utilities.h"
#include "local-server/GET/get_local_server.h"
#include "local-server/POST/post_local_server.h"
#include "read_message.h"

void process_route(struct Socket *socket, char *http_header, char *body) {
    SSL *cSSL = socket->cSSL;
    if (!http_header) {
        return;
    }

    char *route_start = strchr(http_header, ' ');
    if (!route_start) {
        return;
    }
    route_start++;
    char *route_end = strchr(route_start, ' ');
    if (!route_end) {
        return;
    }
    size_t route_len = route_end - route_start;
    if (route_len == 0) {
        return;
    }
    if (route_len > 65535) {
        send_response_code(cSSL, 400);
        return;
    }

    char *route = malloc(route_len + 1);
    strncpy(route, route_start, route_len);
    route[route_len] = '\0';

    char *request_type_end = strchr(http_header, ' ');
    if (!request_type_end) {
        free(route);
        return;
    }
    size_t request_type_len = request_type_end - http_header;
    if (request_type_len == 0 || request_type_len > 16) {
        free(route);
        return;
    }

    char *request_type = malloc(request_type_len + 1);
    strncpy(request_type, http_header, request_type_len);
    request_type[request_type_len] = '\0';

    printf("Route: '%s %s'\n", request_type, route);

    if (strcmp(request_type, "OPTIONS") == 0) {
        char http_header[512];
        snprintf(http_header, sizeof(http_header),
                 "HTTP/1.1 204 No Content\r\n"
                 "Access-Control-Allow-Origin: *\r\n"
                 "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                 "Access-Control-Allow-Headers: Content-Type\r\n"
                 "Connection: close\r\n"
                 "\r\n");
        SSL_write(cSSL, http_header, strlen(http_header));
        free(route);
        free(request_type);
        return;
    }

    if (strcmp(request_type, "GET") == 0 && strcmp(route, "/") == 0) {
        get_live_html(cSSL, http_header, "portfolio/home.html");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/favicon.ico") != NULL) {
        get_image_file(cSSL, http_header, "/portfolio/images/favicon.ico");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/dashboard") == 0) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/login") == 0) {
        get_live_html(cSSL, http_header, "AIdashboard/login.html");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/auth/") != NULL) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/widget.js") == 0) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/widget.css") == 0) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/widget.html") == 0) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/robot_icon.png") == 0) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/widget.js") != NULL) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/widget.css") != NULL) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/widget.html") != NULL) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/robot_icon.png") != NULL) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/bot-config") != NULL) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/knowledege") != NULL) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/lead-sample") != NULL) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/leads") != NULL) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/domains") != NULL) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/prompt") != NULL) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/validate-domain") != NULL) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/chat") == 0) {
        post_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/book-estimate") == 0) {
        post_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/bot-config") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/knowledege") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/prompt-save") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/knowledege-embed") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/publish-app") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/leads-sync") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/lead-sql") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/domains") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/auth/") != NULL) {
        post_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/chat-reset") == 0) {
        post_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "DELETE") == 0 && strstr(route, "/knowledege") != NULL) {
        delete_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/portfolio/images/") != NULL) {
        get_image_file(cSSL, http_header, route);
    }

    free(route);
    free(request_type);
}
