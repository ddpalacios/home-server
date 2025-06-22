#include "client.h"
#include <stdio.h>
#include <netdb.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <openssl/err.h>
#include <unistd.h>
#include <resolv.h>
#include <string.h>
#include <openssl/ssl.h>
#include <openssl/sha.h>
#include <openssl/evp.h>
#include <stdlib.h>
#define IPSTRLEN INET6_ADDRSTRLEN
#define MAX_SERVERS 10



// SSL_CTX *initialize_ssl(void){
// 	SSL_library_init();
// 	SSL_load_error_strings();
// 	OpenSSL_add_all_algorithms();
// 	const SSL_METHOD *method = TLS_client_method();
// 	SSL_CTX *cSSL = SSL_CTX_new(method);
// 	return cSSL;


// }

// void SSL_connect_to_server(struct Server *servers[], int sfd,int* total_servers ,const char*host){
// 	SSL_CTX *ctx = initialize_ssl();
// 	SSL *cSSL = SSL_new(ctx);
// 	SSL_set_fd(cSSL, sfd);
// 	SSL_set_tlsext_host_name(cSSL, host);
// 	const int cSSL_status  = SSL_connect(cSSL);
// 	if (cSSL_status < 0){
// 		ERR_print_errors_fp(stderr);
// 	}else{
// 		char route[255]; 
// 		snprintf(route,sizeof(route),"/home-server/frame?serverId='%s'",host);
// 		printf("Connected with %s encryption\n", SSL_get_cipher(cSSL));
// 	}

//  if (*total_servers == MAX_SERVERS){
// 	  struct Server *tmp =realloc(servers, (MAX_SERVERS) * sizeof(struct Server));
// 	  servers = &tmp;
//  }else{

// 	 (*servers)[*total_servers].hostname = host;
// 	 (*servers)[*total_servers].cSSL = cSSL;
// 	 (*total_servers)++;
// 	 printf("Server Added. Total Servers: %d\n", *total_servers);
//  }

// }



// void connect_to_server(struct Server *server[], const char* host, const char* port, int*total_servers){
// 	struct addrinfo hints;
// 	struct addrinfo *addrs_res;
// 	memset(&hints, 0, sizeof(hints));
// 	char ipstr[IPSTRLEN];
// 	hints.ai_family = AF_INET;
// 	hints.ai_socktype = SOCK_STREAM;
// 	hints.ai_protocol = IPPROTO_TCP;
// 	const int status = getaddrinfo(host, port, &hints, &addrs_res);
// 	int sfd, connected;
// 	for (struct addrinfo *addr = addrs_res; addr != NULL; addr = addr->ai_next){
// 		if (addr->ai_family == AF_INET) {
// 			struct sockaddr_in *ipv4 = (struct sockaddr_in *)addr->ai_addr;
// 			void *addr4 = &(ipv4->sin_addr);
// 			inet_ntop(addr->ai_family, addr4, ipstr, IPSTRLEN);
// 		}else{
// 			struct sockaddr_in6 *ipv6 = (struct sockaddr_in6 *)addr->ai_addr;
// 			void* addr6 = &(ipv6->sin6_addr);
// 			inet_ntop(addr->ai_family, addr6, ipstr, IPSTRLEN);
// 		}

// 		sfd = socket(addr->ai_family, addr->ai_socktype, addr->ai_protocol);
// 		if (sfd < 0){
// 			printf("Error connecting to socket with host: '%s' at '%s'\n", host, ipstr);
// 			break;
// 		}
// 		printf("Connecting to %s...\n", host);
// 		connected = connect(sfd, addr->ai_addr, addr->ai_addrlen);
// 		if (connected == 0){
// 			printf("Successfully connected to '%s'\n", host);
// 			break;
// 		}else{
// 			printf("Error connecting to host: '%s' at '%s'\n",host, ipstr);
// 			break;
		
// 		}
// 	 }
	
// 	if (sfd>=0 && connected==0){
// 	        SSL_connect_to_server(server,sfd,total_servers ,host);
// 	}
	

// }


SSL* get_client_socket(struct Client *clients, int fd_count, int fd){
	for (int i=0; i < fd_count; i++){
		int Id = clients[i].Id;
		if (Id == fd){
			return clients[i].cSSL;
		}	
	}
}

void remove_client(int *fd_count, struct Client clients[], int fd){

	for (int i=0; i<*fd_count; i++){
		if (clients[i].Id == fd){
			clients[i] = clients[*fd_count-1];
			break;
		}
	
	}

}
