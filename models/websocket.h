#include <openssl/ssl.h>
typedef struct Websocket{
	char* Id;
	char* userid;
	char* sessionid;
	char* connected_on;
	int socketId;
	int exists;
}websockets;
int is_active_websocket_client(int fd);


char* convert_websockets_to_json(struct Websocket* websocket, int count);
char* convert_websocket_to_json(struct Websocket websocket);
struct Websocket create_websocket(char* userid, char* sessionid, int socketid);
char* generate_websocket_accptKey(char* websocket_sec_key);
int is_websocket_buffer(unsigned char* buf);
int decode_websocket_buffer(char* buf, char message[]);
void insert_websocket_session(struct Websocket websocket);
struct Websocket get_websocket_by_Id(char* Id);
char* create_websocket_buffer();
void send_websocket_buffer(SSL* cSSL, char* buf);
void close_websocket_connection();
int  decode_websocket_buffer(char* buf, char message[] );
int is_websocket_buffer(unsigned char* buf);
int update_websocket(char* Id,char* userid,char* sessionid,char* connected_on);
char*  get_websockets();
void delete_websocket_by_fd(int fd);
void delete_websocket_by_sessionid(char* sessionid, char*userid);