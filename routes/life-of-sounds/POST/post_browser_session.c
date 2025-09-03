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


char* create_client_cookie(char*path,char* key, char* value){
	char* cookie = malloc(256);
	snprintf(cookie, 256, "%s=%s;Path=%s;Secure;",key,value, path);
	return cookie;
}


void set_and_send_client_cookie(SSL* cSSL, char*client_cookie,char* username_cookie, char* sessionname_cookie){
	char http_header[2048];
	snprintf(http_header, sizeof(http_header),
			"HTTP/1.1 200 OK\r\n"
            "Set-Cookie: %s\r\n"
            "Set-Cookie: %s\r\n"
            "Set-Cookie: %s\r\n"
			"\r\n", client_cookie,username_cookie,sessionname_cookie);
	SSL_write(cSSL, http_header, strlen(http_header));
}

void post_browser_session(struct Socket* socket,char* http_header, char*body, char* route){
    SSL*cSSL = socket->cSSL;
    char* cookie = get_cookie(http_header);
	// if (cookie == NULL){
        char* login_time = get_string_value_from_json("login_time", body);
        char* username = get_string_value_from_json("username", body);
        char* sessionname = get_string_value_from_json("sessionname", body);
        struct Session session = create_session("", login_time);
        // cookie = create_cookie("/life-of-sounds/live_studio", "session", session.Id); 
        unsigned char* Id  = malloc(16);
        create_unique_identifier(Id);
        char Id_hex[33];
        hash_to_hex(Id, 16, Id_hex);
        char* client_cookie = create_client_cookie("/life-of-sounds/live_studio", "clientId", Id_hex); 
        char* username_cookie = create_client_cookie("/life-of-sounds/live_studio", "username", username); 
        char* sessionname_cookie = create_client_cookie("/life-of-sounds/live_studio", "sessionname", sessionname); 
        insert_session(session);
        set_and_send_client_cookie(cSSL, client_cookie,username_cookie,sessionname_cookie);
        free(client_cookie);
        free(username_cookie);
        free(sessionname_cookie);
		send_response_code(cSSL, 200);
    // }else{
    //     send_response_code(cSSL, 200);
    // }
    





}