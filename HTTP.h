#include <openssl/ssl.h>

char *get_file_buffer(char* filename);
char *get_route(unsigned char* buf);
void render_template(unsigned char* buf, SSL *cSSL);
char * retrieve_request_body(unsigned char* buf);
 char*  get_cookie(unsigned char* buf);
void send_response_code(int code, SSL *cSSL);

