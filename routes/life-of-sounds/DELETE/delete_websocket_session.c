#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "websocket.h"
#include "WebsocketClient.h"
#include "Websocket_Message.h"
#include "Socket.h"

void delete_websocket_session(struct Socket* socket,char* http_header, char*body, char* route){
     SSL*cSSL = socket->cSSL;
     char* sessionid = get_query_parameter(route, "Id");
     delete_websocket_by_sessionid(sessionid);
     delete_websocketclients_by_sessionId(sessionid);
     delete_messages_by_sessionid(sessionid);
     send_response_code(cSSL, 200);
}