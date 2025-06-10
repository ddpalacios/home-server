#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "Audio.h"
#include "http_utilities.h"
#include "os_utilities.h"

void get_audio_blob(SSL* cSSL,char*route, char* request){
    printf("Getting Audio Blob...");
    printf("'%s'\n", route);
    char* audioId = get_query_parameter(route, "Id");
    if (audioId == NULL){
        send_response_code(cSSL, 400);
    }else{
        printf("AudioId: %s\n", audioId);
        struct Audio audio = get_audio(audioId);
        if (!audio.exists){
            send_response_code(cSSL, 400);
        }else{
            static  char p[255];
            snprintf(p, sizeof(p), "../%s", audio.path);
            printf("PATH: %s\n", p);
            long filesize;
            unsigned char* buffer= get_file_contents(p,&filesize);
            if (buffer != NULL){
                send_buffer_response_code(cSSL, 200,  buffer, filesize);
                printf("BUFFER: %s\n", buffer);

            }else{
                send_response_code(cSSL, 400);
            }
        }
}


}