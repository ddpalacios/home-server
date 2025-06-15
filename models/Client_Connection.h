
typedef struct ClientConnection {
	char* Id;
	char* name;
    char*type;
    char* ip_address;
    char* connected_on;
	char*client_type;
    char* status;
    char* task;
    int fileDescriptorId;
	int exists;

} clientConnections;

struct ClientConnection get_client_connection_by_fd(int fd);
struct ClientConnection create_client_connection(char*ip_address, int fd);
void insert_client_connection(struct ClientConnection clientConnection);
void delete_connection_by_fd(int fd);
void update_client_connecion_value(char* Id, char* columnName, char* newValue);
struct ClientConnection* get_client_connections();

// struct ClientConnection get_client_connection(char* clientConnectionId);
// struct ClientConnection create_client_connection(char* Id, char* name, char* type, char* ip_address, char* connected_on, char* status, char* task);
// void insert_client_connection(struct ClientConnection clientConnection);
// void delete_client_connection(struct ClientConnection clientConnection);
// char* get_client_connection();
// char* convert_clientConnections_to_json(struct ClientConnection* clientConnection, int count);
// char* convert_clientConnection_to_json(struct ClientConnection clientConnection);
