#include <openssl/ssl.h>
#include "client.h"
#include <stdio.h>

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
//			printf("Client Removed.\n");
			break;
		}
	
	}

}
