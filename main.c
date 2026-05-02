#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <netdb.h>
#include <sys/types.h>
#include  <cjson/cJSON.h>
#include "server.h"
#include "http_utilities.h"
#include "send_message.h"
#include <poll.h>

int main(){
	char* port = getenv("PORT");
	if (!port) {
		fprintf(stderr, "PORT environment variable not set\n");
		return 1;
	}
	start_listening_for_clients(port);
	return 0;
}
