#include <mysql/mysql.h>

MYSQL* connect(char* username,char* server, char* password, char* database);
void query(MYSQL* conn,char* query);
void close(MYSQL *conn);


