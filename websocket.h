#include <openssl/ssl.h>
typedef struct Websocket{
	char* Id;
	char* userid;
	char* sessionid;
	char* connected_on;
	int socketId;
	int exists;
}websockets;


char* convert_websocket_to_json(struct Websocket websocket);

struct Websocket create_websocket(char* userid, char* sessionid, int socketid);
char* generate_websocket_accptKey(char* websocket_sec_key);
int is_websocket_buffer(unsigned char* buf);
int decode_websocket_buffer(char* buf, char message[]);
void insert_websocket_session(struct Websocket websocket);
struct Websocket get_websocket_by_Id(char* Id);
void delete_websocket(struct Websocket websocket);
char* create_websocket_buffer();
void send_websocket_buffer(SSL* cSSL, char* buf);
void close_websocket_connection();
