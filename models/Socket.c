#include <openssl/ssl.h>
#include <sys/types.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <netdb.h>
#include "Socket.h"
//#define CLIENT_CERT "../../../../etc/letsencrypt/live/palacios-solutions.com/fullchain.pem"
//#define CLIENT_KEY "../../../../etc/letsencrypt/live/palacios-solutions.com/privkey.pem"
#define CLIENT_CERT "../server/self_signed_cert.crt"
#define CLIENT_KEY "../server/privateKey.key"
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


SSL* encrypt_socket(int fd){
	SSL_CTX *ssl_ctx;
	ssl_ctx = SSL_CTX_new(SSLv23_server_method());
	SSL_CTX_set_options(ssl_ctx, SSL_OP_SINGLE_DH_USE);
	int use_cert = SSL_CTX_use_certificate_file(ssl_ctx, CLIENT_CERT, SSL_FILETYPE_PEM);
	int use_key = SSL_CTX_use_PrivateKey_file(ssl_ctx, CLIENT_KEY, SSL_FILETYPE_PEM);
	if (use_cert <=0 || use_key <=0){
		printf("ERROR LOADING SSL CERT OR KEY\n");
        return NULL;
	}
	SSL *cSSL = SSL_new(ssl_ctx);
    if (cSSL == NULL){
       // printf("Error creating SSL ctx for fd\n %d", fd);
        return cSSL;
    }
	if (!SSL_set_fd(cSSL, fd)){
        //printf("Error setting SSL for fd %d\n", fd);
        return NULL;
    }
	int ssl_err = SSL_accept(cSSL);

	if (ssl_err <0) {
		int err = SSL_get_error(cSSL, ssl_err);
	//	printf("SSL ERROR %d | %d ERROR ON ACCEPTING CSSL!!!\n", ssl_err, err);
		SSL_shutdown(cSSL);
		SSL_free(cSSL);
		return NULL;
	}
	return cSSL;
}
