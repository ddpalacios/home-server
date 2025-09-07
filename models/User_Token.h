typedef struct User_Token {
	char* Id;
    char* token;
	char* userId;
	char* expiration_date;
	int exists;
} user_tokens;
struct User_Token create_token(char* userId);
struct User_Token get_token(char* token);
void insert_token(struct User_Token token);
void delete_expired_tokens();

