typedef struct WebsocketClient {
	char* Id;
    char* socketId;
	char* sessionId;
	int exists;
}websocketclients;
struct WebsocketClient create_websocketclient(char* sessionid, char*socketId);
struct WebsocketClient get_websocketclient(char* websocketclientid);
struct WebsocketClient* get_websocketclientsBySessionId(char* sessionId, size_t *total_clients);
struct WebsocketClient get_websocketclientBySocketId(char* socketId);
void insert_websocketclient(struct WebsocketClient websocketclient);
void delete_websocketclient(struct WebsocketClient websocketclient);
int websocketclient_exists(char* websocketclientid);
