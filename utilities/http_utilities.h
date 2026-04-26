#include <openssl/ssl.h>
char* get_cookie(unsigned char* buf);
char *get_file_buffer(char* filename);
char* create_session_cookie(char*path, char* value);
char* create_refresh_cookie(char*path, char* value);
int get_session_token_max_age_in_seconds();
int get_refresh_token_max_age_in_seconds();
void send_html_response_code(SSL* cSSL,int code, int content_length);
void send_css_response_code(SSL* cSSL,int code, int content_length);
void send_javascript_response_code(SSL* cSSL,int code, int content_length);
void send_video_response_code(SSL* cSSL,int code, int content_length);
void send_image_response_code(SSL* cSSL,int code, int content_length);
void send_pdf_response_code(SSL* cSSL,int code, int content_length);
void send_favicon_response_code(SSL* cSSL,int code, int content_length);
void send_response_code(SSL *cSSL,int code);
void set_and_send_session_cookie(SSL* cSSL, char*session_token, char* path);
void set_and_send_session_and_refresh_cookies(SSL* cSSL, char*session_token,char*refresh_token, char* path);
char* open_html_template_page(char*template_name, char* request);
char* retrieve_request_body(char* buf);
char* create_cookie(char*path,char* key, char* value);
char* get_query_parameter(char*route, char*param);
void send_buffer_response_code(SSL* cSSL, int code, char* buffer, size_t buffer_length );
void send_JSON_response_code( SSL *cSSL,int code, char* json);
void send_proxy_response(SSL *cSSL, int code, const char *status_text,
                         const char *content_type, const char *set_cookie,
                         const char *body, size_t body_len);
void send_websocket_buffer(SSL* cSSL, char* buf);
int switch_to_websocket_protocol(SSL *cSSL, char* websocket_sec_acceptKey);
char*  get_header_value(const char* buf, const char* key);
char* generate_websocket_accptKey(char* websocket_sec_key );
char* get_code_message(int code);
int is_connection_keep_alive(char*http_header);
int get_content_length(char*http_header);
int get_http_header(char* request, char*header_result, size_t header_result_size);

/* Static-asset / template helpers used by the ETL UI. Defined in
 * routes/life-of-sounds/GET/get_live_page.c and get_game_of_life_script.c
 * (kept under that path for now; they are not websocket-related). */
void get_live_html(SSL* cSSL, char* request, char* template_name);
void get_gol_script(SSL* cSSL, char* request, char* template_name);
void get_image_file(SSL* cSSL, char* request, char* template_name);
