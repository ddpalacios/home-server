#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "Audio.h"

void retrieve_audio(SSL* cSSL, char* route, char* request){
	 printf("'%s'\n", route);
	 char* userid = get_query_parameter(route, "userid");
	 printf("UserID: %s\n", userid);
	 if (userid != NULL){
	    char* all_audios_json = get_audios_by_userid(userid);
		send_JSON_response_code(cSSL, 200, all_audios_json);
	 }else if (strcmp(route,"/life-of-sounds/audio") == 0){
            char* all_audios_json = get_audios();
		    send_JSON_response_code(cSSL, 200, all_audios_json);
	 }else{
		send_response_code(cSSL, 400);
	 }


}