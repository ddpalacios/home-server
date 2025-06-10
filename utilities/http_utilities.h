#include <openssl/ssl.h>
char* get_cookie(unsigned char* buf);
char *get_file_buffer(char* filename);
void send_html_response_code(SSL* cSSL,int code, int content_length);
void send_response_code(SSL *cSSL,int code);
void set_and_send_cookie(SSL* cSSL, char*cookie);
char* open_html_template_page(char*template_name, char* request);
char* retrieve_request_body(char* buf);
char* create_cookie(char*path,char* key, char* value);
char* get_query_parameter(char*route, char*param);
void send_buffer_response_code(SSL* cSSL, int code, char* buffer, size_t buffer_length );
void send_JSON_response_code( SSL *cSSL,int code, char* json);
void send_websocket_buffer(SSL* cSSL, char* buf);
int switch_to_websocket_protocol(SSL *cSSL, char* websocket_sec_acceptKey);
char*  get_header_value(const char* buf, const char* key);
char* generate_websocket_accptKey(char* websocket_sec_key );