#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <openssl/ssl.h>
#include "http_utilities.h"
#include "json_utilities.h"
#include "User.h"
#include "session.h"

int login(SSL* cSSL, char* request){
	printf("Logging in...\n");
	char* body = retrieve_request_body(request);
	char* username = get_string_value_from_json("username", body);
	char* password = get_string_value_from_json("password", body);
	char* login_time = get_string_value_from_json("login_time", body);
	int valid_login = validate_login(username, password);
	if (valid_login == 1){
		struct User user = get_user_by_name(username);
		struct Session session = create_session(user.Id, login_time);
		char* cookie = create_cookie("/life-of-sounds/", "session", session.Id); 
		insert_session(session);
		set_and_send_cookie(cSSL, cookie);
		send_response_code(cSSL, 200);
		return valid_login;
	}else if (valid_login < 0){
		send_response_code(cSSL, 404);
		return valid_login;
	}else{
		send_response_code(cSSL, 401);
		return valid_login;
	
	}


}
