
typedef struct User{
	char* Id; 
	char* email;
	unsigned char* password;
	unsigned char* salt;
	char* fullname;
	int  exists;
}users;
char* convert_user_to_json(struct User user);
struct User create_user(char* fullname, char* password, char* email);
void insert_user(struct User user);
struct User get_user_by_name(char* fullname);
int validate_login(char* username, char* password);
struct User get_user_by_id(char* userid);
void create_login(char *res);
char* get_users();
