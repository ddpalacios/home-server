#include <openssl/ssl.h>

typedef struct Server {
	char* Id;
	char*ip_addr;
	const char*hostname;
	char*port;
	SSL* cSSL;


} server;

void connect_to_server(struct Server *server[], const char* host, const char* port, int*total_servers);

// struct Server get_server(char* ServerId);
// void update_server_value(char* ServerId, char* columnName, char* newValue);
// struct Server create_server( char* uniqueId, char* name, char*path, char* starttime, char* userid, char* endtime, float duration);
// void insert_server(struct Server Server);
// void delete_server(struct Server Server);
// char* get_servers();
// char* convert_servers_to_json(struct Server* Server, int count);
// char* convert_server_to_json(struct Server Server);
