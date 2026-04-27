#include <stdio.h>
#include <string.h>
#include <netdb.h>
#include <sys/types.h>
#include  <cjson/cJSON.h>
#include <signal.h>
#include "server.h"
#include "http_utilities.h"
#include "send_message.h"
#include "Socket.h"
#include <poll.h>

int main(){
	/* OpenSSL's SSL_write goes through write()/send() with no MSG_NOSIGNAL,
	 * so a peer that closes mid-response causes the kernel to deliver
	 * SIGPIPE — and the default action is to terminate the process. That
	 * showed up as the home-server vanishing right after the
	 * "Total bytes received" log line in post_to_local / post_run_activity
	 * (e.g. running a notebook cell while the browser has navigated away).
	 * Ignoring SIGPIPE turns it into a normal SSL_write failure with
	 * errno=EPIPE, which the existing send paths can shrug off. */
	signal(SIGPIPE, SIG_IGN);

	/* Build the TLS context up front so the first client connection doesn't
	 * pay the cert/key load + OpenSSL one-time init cost. Without this, the
	 * blob_storage Python wrapper sees a 120s+ TLS handshake timeout on the
	 * very first call after startup. */
	ssl_ctx_init();

	char* port = "9030";
	start_listening_for_clients(port);
	return 0;
}
