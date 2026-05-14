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
/* Streaming-passthrough variant of post_to_local. Use for endpoints
 * whose upstream response is `Content-Type: text/event-stream` (SSE)
 * or any other long-lived response we MUST forward chunk-by-chunk
 * to the client instead of buffering whole into memory.
 *
 * Same auth/cookie/host header forwarding as post_to_local on the
 * way up. On the way down: we read upstream response headers, write
 * them to the client verbatim, then loop recv→SSL_write so each
 * upstream chunk reaches the browser the instant it arrives. Without
 * this, SSE endpoints look batched: the browser sees a single big
 * payload at the end of the response instead of token-by-token. */
void post_to_local_stream(struct Socket* socket, char* http_header,
                           char* body, size_t body_len,
                           char* route, const char* port);
void delete_to_local(struct Socket* socket,char* http_header, char*body, char* route, const char* port);
