#include <mysql/mysql.h>

MYSQL* connect(char* username, char* password, char* database);
MYSQL_RES* query(char* query);

void close(MYSQL *conn);


