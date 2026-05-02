#include <openssl/ssl.h>
#include <stddef.h>
#include "Socket.h"
int connect_to_local_server(const char* host, const char* port);
void post_ctabustracker_getpredictions(struct Socket* socket,char* http_header, char*body, char* route);
void post_generate_phrase(struct Socket* socket,char* http_header, char*body, char* route);
void post_run_activity(struct Socket* socket,char* http_header, char*body, char* route);
void post_run_pipeline(struct Socket* socket,char* http_header, char*body, char* route);
/* body_len is the actual length of the body in bytes — must NOT use
 * strlen(body) on multipart uploads, which contain raw binary bytes
 * (image/video files routinely have null bytes that strlen would
 * truncate at, mangling the multipart envelope). */
void post_to_local(struct Socket* socket,char* http_header, char*body, size_t body_len, char* route, const char* port);
void delete_to_local(struct Socket* socket,char* http_header, char*body, char* route, const char* port);
