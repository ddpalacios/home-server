#include <openssl/ssl.h>
#include "Socket.h"
int connect_to_local_server(const char* host, const char* port);
void post_ctabustracker_getpredictions(struct Socket* socket,char* http_header, char*body, char* route);
void post_generate_phrase(struct Socket* socket,char* http_header, char*body, char* route);
void post_run_activity(struct Socket* socket,char* http_header, char*body, char* route);
void post_run_pipeline(struct Socket* socket,char* http_header, char*body, char* route);
void post_to_local(struct Socket* socket,char* http_header, char*body, char* route);
void post_to_local_no_reply(const char* route, const char* body);
void get_from_local(struct Socket* socket,char* http_header, char*body, char* route);
