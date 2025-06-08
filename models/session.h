typedef struct Session {
	char* Id;
	char* userId;
	char* login_time;
	int exists;


}sessions;


void insert_session(struct Session session);
void delete_session(char* sessionId);
struct Session get_session(char* sessionId);
struct Session create_session(char* userId, char* login_time);


