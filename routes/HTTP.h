#include <openssl/ssl.h>
char *get_file_buffer(char* filename);
char *get_route(unsigned char* buf);
void render_template(unsigned char* buf, SSL *cSSL, char* request_cookie);
char * retrieve_request_body(unsigned char* buf);
char* get_string_value_from_json(char* key, char* json);
int  get_int_value_from_json(char* key, char* json);
float get_float_value_from_json(char* key, char* json);
 char*  get_cookie(unsigned char* buf);
 char* get_header_value(const char* buf, const char* key);
 char*  create_cookie(char* key, char* value);
void send_response_code(int code, SSL *cSSL, char* cookie);
void send_JSON_response_code(int code, SSL *cSSL, char* json);
void send_json_to_client(SSL *cSSL,char* json);
void initialize_websocket_protocol(SSL *cSSL,char* websocket_sec_acceptKey);
void replace(const char* str, const char* substring, const char* replacement);
char* get_request_parameter(char*route, char*param);
