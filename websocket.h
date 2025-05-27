#include <openssl/ssl.h>


char* generate_websocket_accptKey(char* websocket_sec_key);
int is_websocket_buffer(char* buf);
int decode_websocket_buffer(char* buf, char message[]);
void insert_websocket_session(char* userid, char* sessionid);
void delete_websocket_session(char* userid, char* sessionid);
char* create_websocket_buffer();
void send_websocket_buffer(SSL* cSSL, char* buf);
void close_websocket_connection();
