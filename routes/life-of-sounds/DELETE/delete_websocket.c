#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "websocket.h"

void delete_websocket(SSL* cSSL, char*route, char* request){
	 char* userid = get_query_parameter(route, "userid");
	 char* sessionid  = get_query_parameter(route, "sessionid");
     if (userid != NULL && sessionid != NULL){
     delete_websocket_by_sessionid(sessionid, userid);
     send_response_code(cSSL, 200);

     }else{
    send_response_code(cSSL, 400);

        
     }



}