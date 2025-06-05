#include <mysql/mysql.h>

MYSQL* connect_to_sql(char* username, char* password, char* server,char* database);
MYSQL_RES* query(MYSQL* conn,char* query);
void close_sql_connection(MYSQL *conn);
void encrypt(char password[], int key);
void decrypt(char password[], int key);
char* b64_encode(const unsigned char *in, size_t len);
int b64_decode(const char *in, unsigned char *out, size_t outlen);
size_t b64_decoded_size(const char *in);
