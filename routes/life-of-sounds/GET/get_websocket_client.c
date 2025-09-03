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
    char* sessionId = get_query_parameter(route, "sessionId");
    char* userId = get_query_parameter(route, "userId");
        printf("CHECKING IF CLIENT EXISTS\n");
        if (websocketclient_exists(userId, sessionId)){
             struct WebsocketClient ws_client = get_websocketclient(userId,sessionId);
              cJSON *root = create_json_object();
            add_string_to_json_root(root,"Id",ws_client.Id);
            add_string_to_json_root(root,"socketId",ws_client.socketId);
            add_string_to_json_root(root,"sessionId",ws_client.sessionId);
            add_string_to_json_root(root,"name",ws_client.name);
            add_number_to_json_root(root,"isHost", ws_client.isHost);
            add_string_to_json_root(root,"userId",ws_client.userid);
            char* ws_info = get_json_as_string(root);
            printf("%s\n", ws_info);
            send_JSON_response_code(cSSL, 200, ws_info);
            cJSON_Delete(root);
        }
}