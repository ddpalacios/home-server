#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "string_utilities.h"
#include "http_utilities.h"
#include "session.h"
#include "User.h"
#include "Socket.h"
#include "websocket.h"


void patch_browser_session(struct Socket* socket,char* http_header, char*body, char* route){
    SSL*cSSL = socket->cSSL;
    char* username = get_string_value_from_json("username", body);
    char* clientId = get_string_value_from_json("clientId", body);
    char* sessionname = get_string_value_from_json("sessionname", body);
    char* path  = "/life-of-sounds/live_studio";

    char* client_cookie = malloc(256);
	snprintf(client_cookie, 256, "%s=%s;Path=%s;Secure;","clientId",clientId, path);

    char* username_cookie = malloc(256);
	snprintf(username_cookie, 256, "%s=%s;Path=%s;Secure;", "username", username, path);

    char* sessionname_cookie  = malloc(256);
	snprintf(sessionname_cookie, 256, "%s=%s;Path=%s;Secure;", "sessionname", sessionname, path);

    char cookie_header[2048];
	snprintf(cookie_header, sizeof(cookie_header),
			"HTTP/1.1 200 OK\r\n"
            "Set-Cookie: %s\r\n"
            "Set-Cookie: %s\r\n"
            "Set-Cookie: %s\r\n"
			"\r\n", client_cookie,username_cookie,sessionname_cookie);
	SSL_write(cSSL, cookie_header, strlen(cookie_header));
    free(client_cookie);
    free(username_cookie);
    free(sessionname_cookie);
    send_response_code(cSSL, 200);

}