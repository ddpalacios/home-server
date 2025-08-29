#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "User.h"
#include "session.h"
#include "Socket.h"

void get_user(struct Socket* socket,char* http_header, char*body, char* route){
	SSL* cSSL = socket->cSSL;
	char* cookie = get_cookie(http_header);
	if (strlen(cookie) > 0){
		printf("COOKIE FOUND: %s\n", cookie);
		struct Session session = get_session(cookie);
		if (session.exists){
			printf("USER ID: %s\n", session.userId);
			struct User user =  get_user_by_id(session.userId);
			if (user.exists){
				cJSON *root = create_json_object();
				add_string_to_json_root(root,"userid",user.Id);
				add_string_to_json_root(root,"fullname",user.fullname);
				add_string_to_json_root(root,"email",user.email);
				char* user_info = get_json_as_string(root);
				printf("%s\n", user_info);
				send_JSON_response_code(cSSL, 200, user_info);
			}else{
				printf("USER DOES NOT EXISTS\n");
				send_response_code(cSSL,401);
			}
		}else{
			printf("COULD NOT FIND SESSION\n");
			send_response_code(cSSL,401);
		}
	}else{
		send_response_code(cSSL,401);
	}
}