#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "json_utilities.h"
#include "websocket.h"

int update_websocket_info(SSL* cSSL, char* route, char* request){
    char* body = retrieve_request_body(request);
    char* userid = get_string_value_from_json("userid", body);
    char* Id = get_string_value_from_json("Id", body);
    char* sessionid = get_string_value_from_json("sessionid", body);
    char* connected_on = get_string_value_from_json("connected_on", body);
    int res = update_websocket(Id, userid, sessionid, connected_on);
    if (res){
        send_response_code(cSSL, 200);
        return 1;
    }else{
        send_response_code(cSSL, 400);
    }
    /*
    */
    return 0;
}
