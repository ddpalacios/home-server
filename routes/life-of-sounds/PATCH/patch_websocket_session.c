#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "string_utilities.h"
#include "http_utilities.h"
#include "websocket.h"
#include "Socket.h"

void patch_websocket_session(struct Socket* socket,char* http_header, char*body, char* route){
    SSL*cSSL = socket->cSSL;
     char* sessionId = get_string_value_from_json("sessionId", body);
     char* name = get_string_value_from_json("name", body);
     if (name!= NULL){
        update_sessionName_by_sessionId(sessionId, name);
        send_response_code(cSSL, 200);
     }
}
