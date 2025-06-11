#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"

void get_web_audio_script(SSL* cSSL, char* request, char* template_name){
	printf("New User Page\n");
	 char* request_cookie = get_cookie(request);
	 char *html_buffer = open_html_template_page(template_name, request);
	 if (html_buffer != NULL){
		 int code = 200;
		 int html_length = strlen(html_buffer);
		 send_html_response_code(cSSL,200, html_length);
		SSL_write(cSSL, html_buffer, html_length);	 
		free(html_buffer);
	 }else{
	 	int code = 404;
		printf("COULD NOT FIND %s\n", template_name);
	 
	 }

}
