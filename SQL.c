#include <mysql/mysql.h>
#include <stdio.h>

MYSQL* connect_to_sql(char* username, char* password,char* server,char* database){
	MYSQL* conn = mysql_init(NULL);
	if (!mysql_real_connect(conn ,server ,username, password, database,0,NULL,0)){
		fprintf(stderr, "%s\n", mysql_error(conn));
		exit(1);
	}else{
		printf("Connected to SQL!\n");
	}
	return conn;
}

MYSQL_RES* query(MYSQL* conn,char* query){
	MYSQL_RES *res;
	if (mysql_query(conn, query)){
		fprintf(stderr, "%s\n", mysql_error(conn));
		exit(1);
	}
	res = mysql_use_result(conn);
	return res;

	/*
	MYSQL_ROW row;
	while((row = mysql_fetch_row(res))!=NULL){
		printf("%s \n", row[0]);
	}
	mysql_free_result(res);
	*/
}

void close_sql_connection(MYSQL *conn){
	mysql_close(conn);
	printf("SQL Connection closed!\n");
}

