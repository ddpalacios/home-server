#include <openssl/ssl.h>
#include "FrameField.h"
#include "Socket.h"

void post_frame(struct Socket socket, char* body, char*route);

