#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "json_utilities.h"
#include "Audio.h"

int update_audio_info(SSL* cSSL, char* route, char* request){
    printf("PATCHING AUDIO INFO...\n");
    char* body = retrieve_request_body(request);
    char* userid = get_string_value_from_json("userid", body);
    char* endtime = get_string_value_from_json("endtime", body);
    struct Audio active_audio = get_active_audio_by_userid( userid);
    update_audio_value(active_audio.Id,"endtime", endtime);
    int duration = get_audio_duration_by_id(active_audio.Id);
    float duration_in_minutes = duration/60.0;
    update_audio_duration(active_audio.Id, "duration", duration_in_minutes);
    send_response_code(cSSL, 200);
    return 1;

}