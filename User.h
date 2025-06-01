
typedef struct User{
	char* Id; 
	char* email;
	unsigned char* password;
	unsigned char* salt;
	char* fullname;
	int  exists;
}users;

struct User create_user(char* fullname, char* password, char* email);
void insert_user(struct User user);
struct User* get_users();
struct User get_user_by_name(char* fullname);
struct User validate_login(char* res);
struct User get_user_by_id(char* userid);
void create_login(char *res);
