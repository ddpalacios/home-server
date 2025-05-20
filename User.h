typedef struct User{
	int Id; 
	char* email;
	char* password;
	char* fullname;
}users;

struct User create_user(char* fullname, char* password, char* email);
void insert_user(struct User user);
struct User* get_users();
struct User* get_user(char* fullname);
int validate_login(char* fullname, char* password);
