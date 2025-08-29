#include <string.h>
#include <stdio.h>
#include "json_utilities.h"
#include "Socket.h"
#include "http_utilities.h"
#include "User.h"

void post_user(struct Socket* socket,char* http_header, char*body, char* route){
	printf("Creating new user...\n");
	SSL* cSSL = socket->cSSL;
	char* username = get_string_value_from_json("username", body);
	char* email = get_string_value_from_json("email",body);
	char* password = get_string_value_from_json("password", body);
	struct User new_user = create_user(username,  password, email);
	insert_user(new_user);
	cJSON *root = create_json_object();
	add_string_to_json_root(root,"Id",new_user.Id);
	add_string_to_json_root(root,"email",new_user.email);
	add_string_to_json_root(root,"fullname",new_user.fullname);
	char* ws_info = get_json_as_string(root);
	printf("%s\n", ws_info);
	send_JSON_response_code(cSSL, 200, ws_info);

	// send_response_code(cSSL, 201);
	// struct User curr_user = get_user_by_name(username);
	// if (!curr_user.exists){
	// 	char* email = get_string_value_from_json("email",body);
	// 	char* password = get_string_value_from_json("password", body);
	// 	struct User new_user = create_user(username,  password, email);
	// 	insert_user(new_user);
		// send_response_code(cSSL, 201);
		// return 1;
	// }
	// send_response_code(cSSL, 405);
	// return 0;


}
