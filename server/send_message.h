#include "Socket.h"
int send_websocket_message(struct Socket* sockets,struct Socket* socket, int fd_count, int protocol_length ,int actual_payload_length, char* payload);
int send_tcp_message(SSL *cSSL, int fin,int opcode, int payload_length, char* payload);
int is_valid_frame(cJSON* root);
void send_message_as_websocket(struct Socket* socket,int fd_count,int protocol_length ,int actual_payload_length, char* payload);
