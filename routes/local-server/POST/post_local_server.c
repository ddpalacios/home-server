
#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include "send_message.h"
#include <arpa/inet.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "Socket.h"
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#define IPSTRLEN INET6_ADDRSTRLEN
int connect_to_local_server(const char* host, const char* port){
	struct addrinfo hints;
 	struct addrinfo *addrs_res;
 	memset(&hints, 0, sizeof(hints));
 	char ipstr[IPSTRLEN];
 	hints.ai_family = AF_INET;
 	hints.ai_socktype = SOCK_STREAM;
 	hints.ai_protocol = IPPROTO_TCP;
 	const int status = getaddrinfo(host, port, &hints, &addrs_res);
 	int sfd, connected;
 	for (struct addrinfo *addr = addrs_res; addr != NULL; addr = addr->ai_next){
		if (addr->ai_family == AF_INET) {
			struct sockaddr_in *ipv4 = (struct sockaddr_in *)addr->ai_addr;
			void *addr4 = &(ipv4->sin_addr);
			inet_ntop(addr->ai_family, addr4, ipstr, IPSTRLEN);
		}else{
			struct sockaddr_in6 *ipv6 = (struct sockaddr_in6 *)addr->ai_addr;
			void* addr6 = &(ipv6->sin6_addr);
			inet_ntop(addr->ai_family, addr6, ipstr, IPSTRLEN);
		}
		sfd = socket(addr->ai_family, addr->ai_socktype, addr->ai_protocol);
		if (sfd < 0){
			printf("Error connecting to socket with host: '%s' at '%s'\n", host, ipstr);
			break;
		}
		connected = connect(sfd, addr->ai_addr, addr->ai_addrlen);
		if (connected == 0){
			printf("Successfully connected to '%s'\n", host);
			break;
		}else{
			printf("Error connecting to host: '%s' at '%s'\n",host, ipstr);
			break;
		}
	}
	freeaddrinfo(addrs_res); 
 	if (sfd>=0 && connected==0){
        return sfd;
 	}
 }

 void post_ctabustracker_getpredictions(struct Socket* socket,char* http_header, char*body, char* route){
    int sfd  = connect_to_local_server("127.0.0.1", "5000");
    char request[2048];
    snprintf(request, sizeof(request), 
            "POST /CTA/ctabustracker/getpredictions/run HTTP/1.1\r\n"
            "Host: %s:%s\r\n"
            "Connection: close\r\n"
            "\r\n",
            "127.0.0.1","5000");
    send(sfd,request, strlen(request),0);
    close(sfd);


 }