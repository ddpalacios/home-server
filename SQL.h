#include <mysql/mysql.h>

MYSQL* connect_to_sql(char* username, char* password, char* server,char* database);
MYSQL_RES* query(MYSQL* conn,char* query);
void close_sql_connection(MYSQL *conn);


