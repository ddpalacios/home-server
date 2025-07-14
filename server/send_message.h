#include "Socket.h"


int send_tcp_message(SSL *cSSL, int opcode, int payload_length, char* payload);
int is_valid_frame(cJSON* root);
void send_to_all_clients(struct Socket *sockets, struct Socket socket, char* payload,int payload_length, int fd_count);
