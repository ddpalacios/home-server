#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"
void get_sessioninfo(SSL* cSSL, char*route, char* request, int fd){
	char*sessionid = strstr(route, "sessioninfo/");
	sessionid = strchr(sessionid, '/');
	if (strlen(sessionid) == 1){
		printf("NO SESSION ID\n");
		send_response_code(cSSL, 400);
	}else{
	sessionid++;
	struct Session session = get_session(sessionid);
	if (session.exists){
		struct User user = get_user_by_id(session.userId);
		char* user_json = convert_user_to_json(user);
		send_JSON_response_code(cSSL, 200, user_json);
	
	}else{
		send_response_code(cSSL, 400);
	}

	}




}
