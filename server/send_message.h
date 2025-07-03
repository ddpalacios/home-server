int send_tcp_message(SSL *cSSL, int opcode, int payload_length, char* payload);
int is_valid_frame(cJSON* root);