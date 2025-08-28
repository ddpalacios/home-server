#include <openssl/ssl.h>
#include "Invitation.h"
#include "WebsocketClient.h"
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"
#include "Socket.h"
#include "websocket.h"


void post_websocket_session(struct Socket* socket,char* http_header, char*body, char* route){
    printf("Creating new session...\n");
    SSL *cSSL = socket->cSSL;
    char* session_name = get_string_value_from_json("name", body);
    char* userid = get_string_value_from_json("userid", body);
    struct Websocket websocket_session = create_websocket_session(session_name, userid);
    insert_websocket_session(websocket_session);
    cJSON *root = create_json_object();
    add_string_to_json_root(root,"Id",websocket_session.Id);
    add_string_to_json_root(root,"name",websocket_session.name);
    add_string_to_json_root(root,"userid",websocket_session.userid);
    add_string_to_json_root(root,"sessionId",websocket_session.sessionid);
    char* ws_info = get_json_as_string(root);
    printf("%s\n", ws_info);
    send_JSON_response_code(cSSL, 200, ws_info);
}