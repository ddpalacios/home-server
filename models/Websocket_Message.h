typedef struct Websocket_Message {
	char* Id;
	char* sessionId;
	char* userid;
	char* content;
	char* timestamp;
	char* username;
	int exists;
} messages;
struct Websocket_Message create_message(char* sessionId, char* content, char* timestamp, char* username, char* userid);
void insert_message(struct Websocket_Message message);
struct Websocket_Message* get_messages_by_sessionid(char* sessionid);
char* get_messages_by_sessionid_json(char* sessionid);

