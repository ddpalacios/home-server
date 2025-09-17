#include <string.h>
#include <stdio.h>
#include "json_utilities.h"
#include "Socket.h"
#include "http_utilities.h"
#include "User_Token.h"
#include "User.h"

void post_user(struct Socket* socket,char* http_header, char*body, char* route){
	printf("Creating new user...\n");
	SSL* cSSL = socket->cSSL;
	char* username = get_string_value_from_json("username", body);
	if (username != NULL){
		struct User new_user = create_user(username,  NULL, NULL);
		struct User_Token refresh_token = create_token(new_user.Id);
		struct User_Token session_token = create_token(new_user.Id);
		char* path = "/life-of-sounds/";
		char http_header[2048];
		char* user_json =  convert_user_to_json(new_user);
		int json_length = strlen(user_json);

		char* session_cookie = create_session_cookie(path,  session_token.token);
		char* refresh_cookie = create_refresh_cookie(path,  refresh_token.token);


		snprintf(http_header, sizeof(http_header),
			"HTTP/1.1 200 OK\r\n"
			"Content-Type: application/json\r\n"
			"Connection: close\r\n"
			"Set-Cookie: %s\r\n"
			"Set-Cookie: %s\r\n"
			"Content-Length: %d\r\n"
			"\r\n",session_cookie,  refresh_cookie,json_length);

		new_user.session_token = session_token.token;
		insert_user(new_user);
		insert_token(refresh_token);
		SSL_write(cSSL, http_header, strlen(http_header));
		SSL_write(cSSL,user_json,json_length);

		if (session_cookie != NULL){
			free(session_cookie);
			session_cookie = NULL;
		}
		if (refresh_cookie != NULL){
			free(refresh_cookie);
			refresh_cookie = NULL;
		}

	}else{
		send_response_code(cSSL, 404);
	}

}
