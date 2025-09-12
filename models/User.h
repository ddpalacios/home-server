
typedef struct User{
	char* Id; 
	char* email;
	char* session_token;
	unsigned char* password;
	unsigned char* salt;
	char* fullname;
	int isHost;
	char* sessionId;
	int  exists;
}users;
void update_user_session_token_by_userId(char* userId, char* new_token);
struct User get_user_by_session_token(char* session_token);
char* convert_user_to_json(struct User user);
struct User create_user(char* fullname, char* password, char* email);
void insert_user(struct User user);
struct User get_user_by_name(char* fullname);
int validate_login(char* username, char* password);
struct User get_user_by_id(char* userid);
void create_login(char *res);
char* get_users();
