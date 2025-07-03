#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"
#include "Socket.h"
#include "websocket.h"

void get_websocket_protocol(struct Socket* socket,char* http_header, char*body){
            SSL *cSSL = socket->cSSL;
             char* websocket_key = get_header_value(http_header,"Sec-WebSocket-Key");
                if ( strlen(websocket_key) > 0){
                char* wss_accp_key = generate_websocket_accptKey(websocket_key);
                if (wss_accp_key != NULL){
                int res = switch_to_websocket_protocol(cSSL,  wss_accp_key);
                if (res <=0){
                    send_response_code(cSSL, 400);
		            socket->keep_alive = 0x0;
                }else{
	    	        socket->keep_alive = 0x1;
		        }
            }
        }else{
            send_response_code(cSSL, 400);
	        socket->keep_alive = 0x0;
        }
    }
            
