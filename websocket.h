char* generate_websocket_accptKey(char* websocket_sec_key);
int is_websocket_buffer(char* buf);
void decode_websocket_buffer(char* buf, char message[]);
char* create_websocket_buffer();
void send_websocket_buffer(char* buf);
void close_websocket_connection();
