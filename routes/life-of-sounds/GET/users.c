#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "User.h"
#include "session.h"
#include "http_utilities.h"

void get_user(SSL* cSSL,char*route, char* request){
	 printf("Getting user...\n");
	 printf("'%s'\n", route);
	 char* userid = get_query_parameter(route, "userid");
	 char* username  = get_query_parameter(route, "username");
	 printf("UserID: %s | username: %s\n", userid, username);
	 if (userid != NULL){
	    struct User user = get_user_by_id(userid);
	    if (user.exists){
		char* user_json = convert_user_to_json(user);
		send_JSON_response_code(cSSL, 200, user_json);
	    }

	 }else if (username != NULL){
	    struct User user = get_user_by_name(username);
	    if (user.exists){
		char* user_json = convert_user_to_json(user);
		send_JSON_response_code(cSSL, 200, user_json);
	    }
	 }else if (!strcmp(route,"/life-of-sounds/user") == 0){
		send_response_code(cSSL, 400);
	 
	 }else{
		char* all_users_json = get_users();
		send_JSON_response_code(cSSL, 200, all_users_json);
	 }




    



}

