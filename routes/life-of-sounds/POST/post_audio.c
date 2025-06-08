#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <openssl/ssl.h>
#include "http_utilities.h"
#include "json_utilities.h"
#include "Audio.h"

void create_new_audio(SSL* cSSL, char*request){
    printf("Creating new audio...\n%s\n", request);
    char* body = retrieve_request_body(request);
    char* starttime = get_string_value_from_json("starttime", body);
    char* userid = get_string_value_from_json("userid", body);
    char* audioName = get_string_value_from_json("audioName", body);
    char* audioId = get_string_value_from_json("audioId", body);
    char* path = get_string_value_from_json("path", body);
    char* source = get_string_value_from_json("source", body);
    char* database = get_string_value_from_json("database", body);

    struct Audio audio = create_audio(audioId, audioName, path, starttime, userid, NULL, 0.0);
    insert_audio(audio);
    send_response_code( cSSL, 200);
    
}
	