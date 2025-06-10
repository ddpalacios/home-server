#include <string.h>
#include <stdio.h>
#include "json_utilities.h"
#include "http_utilities.h"
#include "User.h"

int create_new_user(SSL* cSSL, char* request){
	printf("Creating new user...\n");
	char* body = retrieve_request_body(request);
	char* username = get_string_value_from_json("username", body);
	struct User curr_user = get_user_by_name(username);
	if (!curr_user.exists){
		char* email = get_string_value_from_json("email",body);
		char* password = get_string_value_from_json("password", body);
		struct User new_user = create_user(username,  password, email);
		insert_user(new_user);
		send_response_code(cSSL, 201);
		return 1;
	}
	printf("Sending 405...\n");
	send_response_code(cSSL, 405);
	return 0;


}
