#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "string_utilities.h"
#include "WebsocketClient.h"
#include "http_utilities.h"
#include "User.h"
#include "Socket.h"

void patch_websocket_client(struct Socket* socket,char* http_header, char*body, char* route){
    SSL*cSSL = socket->cSSL;
     char* userid = get_string_value_from_json("userId", body);
     char* username = get_string_value_from_json("username", body);
     if (username!= NULL){
        update_username_by_userid(userid, username);
        send_response_code(cSSL, 200);
     }
}
