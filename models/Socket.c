#include <openssl/ssl.h>
#include <sys/types.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <netdb.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <unistd.h>
#include <sys/stat.h>
#include "Socket.h"
//#define CLIENT_CERT "../../../../etc/letsencrypt/live/palacios-solutions.com/fullchain.pem"
//#define CLIENT_KEY "../../../../etc/letsencrypt/live/palacios-solutions.com/privkey.pem"
#define CLIENT_CERT "../server/self_signed_cert.crt"
#define CLIENT_KEY "../server/privateKey.key"

/* Resolve a cert path that is robust against the server being launched from
 * any working directory. Returns 1 if it found a readable file and wrote the
 * absolute path into out (PATH_MAX). Returns 0 if no candidate worked.
 *
 * Candidates, in order:
 *   1. ${BLOB_STORAGE_TLS_CERT} / ${BLOB_STORAGE_TLS_KEY} env override.
 *   2. The compile-time CLIENT_CERT / CLIENT_KEY relative path (current
 *      behavior — works when launched from build/).
 *   3. The same path resolved against the directory containing the running
 *      executable (so launching ./build/home-server from any cwd works).
 */
static int resolve_tls_path(const char *env_var, const char *fallback_rel, char *out) {
	const char *override_env = (env_var != NULL) ? getenv(env_var) : NULL;
	if (override_env && *override_env) {
		struct stat st;
		if (stat(override_env, &st) == 0) {
			snprintf(out, PATH_MAX, "%s", override_env);
			return 1;
		}
	}
	struct stat st;
	if (stat(fallback_rel, &st) == 0) {
		snprintf(out, PATH_MAX, "%s", fallback_rel);
		return 1;
	}
	char exe_path[PATH_MAX];
	ssize_t n = readlink("/proc/self/exe", exe_path, PATH_MAX - 1);
	if (n > 0) {
		exe_path[n] = '\0';
		char *slash = strrchr(exe_path, '/');
		if (slash != NULL) {
			*slash = '\0';
			char candidate[PATH_MAX];
			snprintf(candidate, PATH_MAX, "%s/%s", exe_path, fallback_rel);
			if (stat(candidate, &st) == 0) {
				snprintf(out, PATH_MAX, "%s", candidate);
				return 1;
			}
		}
	}
	return 0;
}
void sink_socket_info(struct Socket *socket,struct sockaddr_storage remoteaddr ){    
    char host[NI_MAXHOST];	
    char service[NI_MAXSERV];	
    getnameinfo((struct sockaddr*)&remoteaddr, sizeof(remoteaddr),host,sizeof(host), service, sizeof(service),0 );
    socket->hostname = strdup(host);
    int sockfd = socket->fd;
	struct sockaddr_storage addr;
	static char ipstr[INET6_ADDRSTRLEN];
	socklen_t len = sizeof(addr);
	getpeername(sockfd, (struct sockaddr*)&addr, &len);
	struct sockaddr_in *s = (struct sockaddr_in *)&addr;
	socket->ip_addr=strdup(ipstr);
	inet_ntop(AF_INET, &s->sin_addr, ipstr, sizeof(ipstr));
	/*
    printf("\n\n%s has connected!\n", host);
	printf("Socket         : %d\n", sockfd);
	printf("Peer IP Address: %s\n", ipstr);
	*/
}
struct Socket get_socket_by_Id(struct Socket *sockets, int fd){
    int count = 0;
    while (sockets[count].fd != 0){
        if (sockets[count].fd == fd){
            struct Socket socket = sockets[count];
            socket.exists = 1;
            return socket;
        }
        count++;
    }
    struct Socket socket;
    socket.exists = 0;
    return socket;


}
void create_socket(int fd, SSL* cSSL, struct Socket *socket){
    socket->fd= fd;
    socket->cSSL = cSSL;
}


void insert_socket(struct Socket **sockets, struct Socket socket,int *fd_count, int *max_fd_size){
    	if (*fd_count == *max_fd_size){
                // *max_fd_size *= 2;
                *sockets = realloc(*sockets, sizeof(**sockets) * (*max_fd_size));
	        }
    (*sockets)[*fd_count].fd = socket.fd;
    (*sockets)[*fd_count].ip_addr = strdup(socket.ip_addr);
    (*sockets)[*fd_count].hostname = strdup(socket.hostname);
    (*sockets)[*fd_count].cSSL = socket.cSSL;
}

void delete_socket(struct Socket *sockets, int fd, int *fd_count){
    int count = 0;
    while (sockets[count].fd != 0){
        if (sockets[count].fd == fd){
            SSL_free(sockets[count].cSSL);
            free(sockets[count].ip_addr);
            free(sockets[count].hostname);
            sockets[count] = sockets[*fd_count-1];
            printf("Socket %d has been removed\n", fd);
            break;
        }
        count++;
    }
}


/* ---- TLS context singleton -----------------------------------------------
 * The SSL_CTX (cert + key + protocol options) is expensive to create — it
 * loads PEM files from disk, parses them, and on first use OpenSSL also
 * does some one-time internal init (RNG seeding, etc.). The previous
 * implementation built a fresh SSL_CTX inside encrypt_socket() on every
 * connection. That:
 *   - made the very first connection ever take >120s on cold caches
 *     (the wrapper would time out on its first call),
 *   - leaked ~50 KB per connection (SSL_CTX_free was never called),
 *   - reloaded cert/key from disk on every TCP accept.
 *
 * Now we build it exactly once. ssl_ctx_init() is safe to call multiple
 * times — pthread_once guarantees a single init even under concurrent
 * accept loops. main.c calls it explicitly at server boot so the cost is
 * paid before the listener starts; encrypt_socket() also calls it as a
 * defensive backstop for any path that bypasses main.
 * ------------------------------------------------------------------------ */

static SSL_CTX        *g_ssl_ctx      = NULL;
static pthread_once_t  g_ssl_ctx_once = PTHREAD_ONCE_INIT;

static void ssl_ctx_init_once(void) {
	g_ssl_ctx = SSL_CTX_new(TLS_server_method());  /* SSLv23_server_method is deprecated */
	if (g_ssl_ctx == NULL) {
		printf("ERROR creating SSL_CTX\n");
		return;
	}
	SSL_CTX_set_options(g_ssl_ctx, SSL_OP_SINGLE_DH_USE);

	char cert_path[PATH_MAX];
	char key_path[PATH_MAX];
	if (!resolve_tls_path("BLOB_STORAGE_TLS_CERT", CLIENT_CERT, cert_path) ||
	    !resolve_tls_path("BLOB_STORAGE_TLS_KEY",  CLIENT_KEY,  key_path)) {
		printf("ERROR: TLS cert or key not found. Tried env (BLOB_STORAGE_TLS_CERT/KEY), "
		       "the compile-time relative path (%s / %s), and a path resolved against "
		       "the executable's directory. Run the server from a directory where the "
		       "relative paths resolve, or set the env vars to absolute paths.\n",
		       CLIENT_CERT, CLIENT_KEY);
		SSL_CTX_free(g_ssl_ctx);
		g_ssl_ctx = NULL;
		return;
	}

	int use_cert = SSL_CTX_use_certificate_file(g_ssl_ctx, cert_path, SSL_FILETYPE_PEM);
	int use_key  = SSL_CTX_use_PrivateKey_file(g_ssl_ctx, key_path,  SSL_FILETYPE_PEM);
	if (use_cert <= 0 || use_key <= 0) {
		printf("ERROR LOADING SSL CERT OR KEY (cert=%s, key=%s)\n", cert_path, key_path);
		SSL_CTX_free(g_ssl_ctx);
		g_ssl_ctx = NULL;
		return;
	}
	printf("TLS context initialized (cert=%s, key=%s)\n", cert_path, key_path);
}

void ssl_ctx_init(void) {
	pthread_once(&g_ssl_ctx_once, ssl_ctx_init_once);
}

SSL* encrypt_socket(int fd){
	ssl_ctx_init();           /* idempotent — runs once total, even under concurrency */
	if (g_ssl_ctx == NULL) {
		return NULL;          /* cert/key load failed at init; logged above */
	}

	SSL *cSSL = SSL_new(g_ssl_ctx);
	if (cSSL == NULL) {
		return NULL;
	}
	if (!SSL_set_fd(cSSL, fd)) {
		SSL_free(cSSL);
		return NULL;
	}
	int ssl_err = SSL_accept(cSSL);
	if (ssl_err < 0) {
		SSL_shutdown(cSSL);
		SSL_free(cSSL);
		return NULL;
	}
	return cSSL;
}
