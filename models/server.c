#include <cjson/cJSON.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "SQL.h"
#include <netdb.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <openssl/err.h>
#include <unistd.h>
#include <resolv.h>
#include <openssl/ssl.h>
#include <openssl/sha.h>
#include <openssl/evp.h>
#include "server.h"

#define IPSTRLEN INET6_ADDRSTRLEN
#define MAX_SERVERS 10


SSL_CTX *initialize_ssl(void){
	SSL_library_init();
	SSL_load_error_strings();
	OpenSSL_add_all_algorithms();
	const SSL_METHOD *method = TLS_client_method();
	SSL_CTX *cSSL = SSL_CTX_new(method);
	return cSSL;


}

void SSL_connect_to_server(struct Server *servers[], int sfd,int* total_servers ,const char*host){
	SSL_CTX *ctx = initialize_ssl();
	SSL *cSSL = SSL_new(ctx);
	SSL_set_fd(cSSL, sfd);
	SSL_set_tlsext_host_name(cSSL, host);
	const int cSSL_status  = SSL_connect(cSSL);
	if (cSSL_status < 0){
		ERR_print_errors_fp(stderr);
	}else{
		char route[255]; 
		snprintf(route,sizeof(route),"/home-server/frame?serverId='%s'",host);
		printf("Connected with %s encryption\n", SSL_get_cipher(cSSL));
	}

 if (*total_servers == MAX_SERVERS){
	  struct Server *tmp =realloc(servers, (MAX_SERVERS) * sizeof(struct Server));
	  servers = &tmp;
 }else{

	 (*servers)[*total_servers].hostname = host;
	 (*servers)[*total_servers].cSSL = cSSL;
	 (*total_servers)++;
	 printf("Server Added. Total Servers: %d\n", *total_servers);
 }

}

void connect_to_server(struct Server *server[], const char* host, const char* port, int*total_servers){
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
		printf("Connecting to %s with socket %d...\n",  ipstr, sfd);
		connected = connect(sfd, addr->ai_addr, addr->ai_addrlen);
		printf("Is Connected: %d\n", connected);
		if (connected == 0){
			printf("Successfully connected to '%s'\n", host);
			break;
		}else{
			printf("Error connecting to host: '%s' at '%s'\n",host, ipstr);
			break;
		
		}
	 }
	
	if (sfd>=0 && connected==0){
	        SSL_connect_to_server(server,sfd,total_servers ,host);
	}
	

}

// struct Server create_server(char* uniqueId, char* name, char*path, char* starttime, char*userid, char* endtime, float duration){
// 	struct Server server;
// 	server.name = name; //strdup(name);
// 	server.path= path;//strdup(path);
// 	server.Id = uniqueId;//strdup(uniqueId); 
// 	server.starttime = starttime;
// 	server.userid = userid;
// 	server.endtime = endtime;
// 	server.duration = duration;
// 	return Server;
// }

// void insert_server(struct Server server){
// 	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	char sql[576];

// 	if (server.endtime != NULL){
// 		snprintf(sql, sizeof(sql),
// 			"INSERT INTO Server VALUES ('%s', '%s', '%s','%s', '%f' , '%s' ,'%s');",
// 			server.Id
// 			,server.name
// 			,server.starttime
// 			,server.endtime
// 			,server.duration
// 			,server.userid
// 			,server.path);
// 		printf("SQL %s\n", sql);
// 	}else{
	
// 		snprintf(sql, sizeof(sql),
// 			"INSERT INTO Server VALUES ('%s', '%s', '%s',NULL, '%f' , '%s' ,'%s');",
// 			server.Id
// 			,server.name
// 			,server.starttime
// 			,server.duration
// 			,server.userid
// 			,server.path);
// 		printf("SQL %s\n", sql);
	
	
// 	}
// 	query(conn, sql);
// 	close_sql_connection(conn);
// }

// void update_server_value(char* ServerId, char* columnName, char* newValue){

// 	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	char sql[576];
// 		snprintf(sql,sizeof(sql),"UPDATE Server SET %s = '%s' WHERE Id = '%s'", columnName, newValue, ServerId);
// 	query(conn, sql);
// 	close_sql_connection(conn);

// }

// char* convert_servers_to_json(struct Server* Server, int count){
// 	// cJSON *root = cJSON_CreateObject();
// 	// printf("count %d\n",count);
// 	// cJSON_AddNumberToObject(root,"total_count",count);
// 	// cJSON* Servers = cJSON_AddArrayToObject(root, "values");
// 	cJSON *root = cJSON_CreateObject();
// 	// printf("count %d\n",count);
// 	cJSON_AddNumberToObject(root,"total_count",count);
// 	cJSON* Servers = cJSON_AddArrayToObject(root, "values");
// 	if (count == 0){
// 		char *json_string = cJSON_Print(root);
// 		// printf("JSON %s\n", json_string);
// 		cJSON_Delete(root);
// 		return json_string;
// 	}
// 	count = 0;
// 	while (Server[count].Id != NULL) {
// 		cJSON* root_server = cJSON_CreateObject();
// 		cJSON_AddStringToObject(root_server, "Id", Server[count].Id);
// 		cJSON_AddStringToObject(root_server,"userid",Server[count].userid);
// 		cJSON_AddStringToObject(root_server, "name", Server[count].name);
// 		cJSON_AddStringToObject(root_server, "starttime", Server[count].starttime);
// 		cJSON_AddStringToObject(root_server, "endtime", Server[count].endtime);
// 		cJSON_AddNumberToObject(root_server, "duration", Server[count].duration);
// 		cJSON_AddStringToObject(root_server, "path", Server[count].path);
// 		cJSON_AddItemToArray(Servers, root_server);
// 		count++;

// 	}
// 	char *json_string = cJSON_Print(root);
// 	// printf("JSON %s\n", json_string);
// 	cJSON_Delete(root);

	
// 	return json_string;

// } 

// int  get_total_server(){
// 	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	char sql[255];
// 	struct Server server;
// 	snprintf(sql,sizeof(sql), "SELECT COUNT(*)  AS total_count FROM Server");
// 	MYSQL_RES* res = query(conn, sql);
// 	MYSQL_ROW row;

// 	int count = 0;
// 	printf("Query: %s\n", sql);
// 	while((row = mysql_fetch_row(res))!= NULL){
// 		count = atoi(row[0]); 
// 		return count;
// 	}

// 	close_sql_connection(conn);
// 	return count;
// }

// char* get_server_by_hostname(char* userid){
// 	struct Server *Server;
// 	int total_servers = get_total_server_by_userid(userid);

// 	Server = malloc(sizeof(*Server) * (total_servers*1000));
// 	if (total_servers == 0){
// 		char* json = convert_servers_to_json(Server,total_servers);
// 		return json;
// 	}
// 	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	char sql[255];
// 	snprintf(sql,sizeof(sql), "SELECT * FROM Server WHERE userid = '%s'\n", userid);
// 	MYSQL_RES* res = query(conn, sql);
// 	MYSQL_ROW row;
// 	// printf("Query: %s\n", sql);
// 	int count = 0;
// 	while((row = mysql_fetch_row(res))!= NULL){
// 		Server[count].Id = strdup(row[0]);
// 	       	Server[count].name = strdup(row[1]);
// 		Server[count].starttime = strdup(row[2]);
// 		Server[count].duration = atof(row[4]);
// 		if (row[3] != NULL){
// 			Server[count].endtime = strdup(row[3]);
// 		}
// 		Server[count].userid = strdup(row[5]);
// 		Server[count].path = strdup(row[6]);
// 		count++;
// 	}

// 	close_sql_connection(conn);
// 	char* json = convert_servers_to_json(Server, total_servers);
// 	return json;
// }


// char* get_servers(){
// 	struct Server *Server;
// 	int total_servers = get_total_server();

// 	Server = malloc(sizeof(*Server) * (total_servers*1000));

// 	if (total_servers == 0){
// 		char* json = convert_servers_to_json(Server,total_servers);
// 		return json;
// 	}
// 	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	char sql[255];
// 	snprintf(sql,sizeof(sql), "SELECT * FROM Server");
// 	MYSQL_RES* res = query(conn, sql);
// 	MYSQL_ROW row;
// 	// printf("Query: %s\n", sql);

// 	int count = 0;
// 	while((row = mysql_fetch_row(res))!= NULL){
// 		Server[count].Id = strdup(row[0]);
// 	       	Server[count].name = strdup(row[1]);
// 		Server[count].starttime = strdup(row[2]);
// 		Server[count].duration = atof(row[4]);
// 		if (row[3] != NULL){
// 			Server[count].endtime = strdup(row[3]);
// 		}
// 		Server[count].userid = strdup(row[5]);
// 		Server[count].path = strdup(row[6]);
// 		count++;
// 	}

// 	close_sql_connection(conn);
// 	char* json = convert_servers_to_json(Server, total_servers);
// 	return json;
// }

// struct Server get_server(char* ServerId){
// 	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	char sql[255];
// 	struct Server server;
// 	snprintf(sql,sizeof(sql), "SELECT * FROM Server WHERE Id = '%s'", ServerId);
// 	MYSQL_RES* res = query(conn, sql);
// 	MYSQL_ROW row;
// 	printf("Query: %s\n", sql);

// 	server.exists = 0;
// 	while((row = mysql_fetch_row(res))!= NULL){
// 		server.Id = strdup(row[0]);
// 		server.name = strdup(row[1]);
// 		server.starttime = strdup(row[2]);
// 		memcpy(&server.duration, row[4], sizeof(float));
// 		if (row[3] != NULL){
// 			server.endtime = strdup(row[3]);
// 		}
// 		server.userid = strdup(row[5]);
// 		server.path = strdup(row[6]);
// 		server.exists = 1;
// 	   }

// 	close_sql_connection(conn);
// 	return Server;
// }

