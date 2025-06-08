#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"
#include "websocket.h"

void get_websocket_protocol(SSL* cSSL,char*route, char* request, int fd){
            char* websocket_key = get_header_value(request,"Sec-WebSocket-Key");
			char* wss_accp_key = generate_websocket_accptKey(websocket_key);
			if (wss_accp_key != NULL){
                int res = switch_to_websocket_protocol(cSSL,  wss_accp_key);
                if (res <=0){
                    send_response_code(cSSL, 400);
                }else{
                    char* cookie = get_cookie(request);
                    struct Session session = get_session(cookie);
                    struct User user = get_user_by_id(session.userId);
                    struct Websocket websocket  = create_websocket(user.Id, cookie, fd);
                    insert_websocket_session(websocket);
                    printf("Websocket Id %s\n", websocket.Id);
                }
            }
}