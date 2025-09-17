#include <openssl/ssl.h>
#include "WebsocketClient.h"
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "Socket.h"
#include "websocket.h"
void get_websocket_client(struct Socket* socket,char* http_header, char*body, char* route){
    SSL*cSSL = socket->cSSL;
    if (strstr(http_header, "/live_studio/client?sessionId=")){
        char* sessionId = get_query_parameter(route, "sessionId");
        if (sessionId != NULL){
            char* clients_json = get_websocketclientsBySessionId_json(sessionId);
             send_JSON_response_code(cSSL, 200, clients_json);
        }



    }
}