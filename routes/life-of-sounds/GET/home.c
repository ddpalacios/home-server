#include <openssl/ssl.h>
#include <string.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"

char* get_home_page(SSL* cSSL, char* request, char* template_name){
	char *html_buffer = open_html_template_page(template_name, request);  
	if (html_buffer != NULL){
		int code = 200;
		int html_length = strlen(html_buffer);
		send_html_response_code(cSSL, 200, html_length);
		SSL_write(cSSL, html_buffer, html_length);
		free(html_buffer);
		return html_buffer;
	}else{
		int code = 404;
		send_html_response_code(cSSL, 404, 0);
		return NULL;
	
	}
}
