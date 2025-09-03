#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "Socket.h"
#include "Websocket_Message.h"
#include "http_utilities.h"

void get_session_messages(struct Socket* socket,char* http_header, char*body, char* route){
     SSL*cSSL = socket->cSSL;
    char* sessionId = get_query_parameter(route, "sessionId");
    char* messages_json = get_messages_by_sessionid_json(sessionId);
    send_JSON_response_code(cSSL, 200, messages_json);
    }
