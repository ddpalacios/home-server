typedef struct WebsocketClient {
	char* Id;
    char* socketId;
    char* userid;
	char* sessionId;
	char* name;
	int exists;
}websocketclients;
struct WebsocketClient create_websocketclient(char* sessionid, char*socketId, char* username,  char* userid);
struct WebsocketClient get_websocketclient(char* userId, char* sessionId);
struct WebsocketClient* get_websocketclientsBySessionId(char* sessionId, size_t *total_clients);
struct WebsocketClient get_websocketclientBySocketId(char* socketId);
void insert_websocketclient(struct WebsocketClient websocketclient);
int websocketclient_exists_by_socketid(char* socketId);
int websocketclient_exists(char* userid, char* sessionid);
void  delete_websocketclients_by_sessionId(char* sessionId);
void delete_websocketclient_by_userid(char* userid);
void delete_websocketclient_by_Id(char* Id);
void update_username_by_userid(char* userId, char* newValue);
