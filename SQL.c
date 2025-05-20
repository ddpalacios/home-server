#include <mysql/mysql.h>
#include <stdio.h>

MYSQL* connect(char* username,char*server,  char* password,char* database){
	MYSQL* conn = mysql_init(NULL);
	if (!mysql_real_connect(conn ,server ,username, password, database,0,NULL,0)){
		fprintf(stderr, "%s\n", mysql_error(conn));
		exit(1);
	}
	return conn;
}

void query(MYSQL* conn,char* query){
	MYSQL_RES *res;
	MYSQL_ROW row;
	if (mysql_query(conn, query)){
		fprintf(stderr, "%s\n", mysql_error(conn));
		exit(1);
	}
	res = mysql_use_result(conn);

	while((row = mysql_fetch_row(res))!=NULL){
		printf("%s \n", row[0]);
	}
	mysql_free_result(res);
}

void close(MYSQL *conn){
	mysql_close(conn);
}

