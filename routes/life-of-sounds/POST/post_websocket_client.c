#include <openssl/ssl.h>
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
void post_websocket_client(struct Socket* socket,char* http_header, char*body, char* route, int send_response){
    SSL *cSSL = socket->cSSL;
    char* sessionid = get_string_value_from_json("sessionId", body);
    char* username = get_string_value_from_json("name", body);
    char* userid = get_string_value_from_json("userid", body);
    int isHost = get_int_value_from_json("isHost", body);
    if (sessionid){
        if (websocketclient_exists(userid, sessionid)){
            if (send_response){
                cJSON *root = create_json_object();
                add_string_to_json_root(root,"error","Conflict");
                add_string_to_json_root(root,"message","The resource already exists.");
                char* ws_info = get_json_as_string(root);
                send_JSON_response_code(cSSL, 409, ws_info);
            }
        }else{
            struct WebsocketClient ws_client =  create_websocketclient(sessionid, socket->Id, username, isHost,userid);
            insert_websocketclient(ws_client);
            if (send_response){
                cJSON *root = create_json_object();
                add_string_to_json_root(root,"socketId",ws_client.socketId);
                add_string_to_json_root(root,"userid",userid);
                add_string_to_json_root(root,"clientName",username);
                add_number_to_json_root(root,"isHost", isHost);
                add_string_to_json_root(root,"sessionId",sessionid);
                char* ws_info = get_json_as_string(root);
                printf("%s\n", ws_info);
                send_JSON_response_code(cSSL, 200, ws_info);
            }
        }
    }

}