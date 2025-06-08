#include <openssl/ssl.h>
#include <string.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"
void delete_sessioninfo(SSL* cSSL, char*route, char* request){
	char*sessionid = strstr(route, "sessioninfo/");
	sessionid = strchr(sessionid, '/');

    if (strlen(sessionid) == 1){
		printf("NO SESSION ID\n");
		send_response_code(cSSL, 400);
	}else{
	sessionid++;
	struct Session session = get_session(sessionid);
	if (session.exists){
		delete_session(session.Id);
		send_response_code(cSSL, 200);
	
	}else{
		send_response_code(cSSL, 400);
	}
}
}
