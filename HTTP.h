#include <openssl/ssl.h>

char *get_file_buffer(char* filename);
char *get_route(unsigned char* buf);
void render_template(unsigned char* buf, SSL *cSSL, char* request_cookie);
char * retrieve_request_body(unsigned char* buf);
 char*  get_cookie(unsigned char* buf);
 char*  create_cookie(char* key, char* value);
void send_response_code(int code, SSL *cSSL, char* cookie);
void send_json_to_client(SSL *cSSL,char* json);

