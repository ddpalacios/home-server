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
            if ( strlen(websocket_key) > 0){
                char* wss_accp_key = generate_websocket_accptKey(websocket_key);
                if (wss_accp_key != NULL){
                int res = switch_to_websocket_protocol(cSSL,  wss_accp_key);
                if (res <=0){
                    send_response_code(cSSL, 400);
                }
            }
            }
}
