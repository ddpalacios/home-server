#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "json_utilities.h"
#include "os_utilities.h"
#include "string_utilities.h"
#include "Audio.h"

int update_audio_info(SSL* cSSL, char* route, char* request){
    printf("PATCHING AUDIO INFO...\n");
    char* body = retrieve_request_body(request);
    if (body == NULL){
        send_response_code(cSSL, 400);
        return -1; 
    }
    char* Id = get_string_value_from_json("Id", body);
    char* name = get_string_value_from_json("name", body);
    char* userid = get_string_value_from_json("userid", body);
    char* endtime = get_string_value_from_json("endtime", body);

    if (Id == NULL){
        struct Audio active_audio = get_active_audio_by_userid( userid);
        update_audio_value(active_audio.Id,"endtime", endtime);
        int duration = get_audio_duration_by_id(active_audio.Id);
        float duration_in_minutes = duration/60.0;
        update_audio_duration(active_audio.Id, "duration", duration_in_minutes);
        send_response_code(cSSL, 200);

    }else{
        struct Audio audio = get_audio(Id);
        if (audio.exists){
            if (name != NULL){
                update_audio_value(audio.Id,"name", name);
                char path[255];
                snprintf(path, sizeof(path), "../users/%s/recordings/%s.webm",audio.userid, audio.name);
                char newpath[255];
                snprintf(newpath, sizeof(newpath), "../users/%s/recordings/%s.webm",audio.userid, name);
                printf("\nRenaming %s to %s\n", path, newpath);
                if (rename(path, newpath) ==0){
                    printf("File Renamed Successfully\n");
                    replace(newpath, "../","");
                    update_audio_value(audio.Id,"path", newpath);
                    send_response_code(cSSL, 200);
                }else{
                    printf("File DID NOT Rename Successfully\n");
                    send_response_code(cSSL, 400);
                }
            }else{
                send_response_code(cSSL, 400);
            }
        }else{
            send_response_code(cSSL, 400);

        }

    }
    return 1;

}