#include <stdio.h>
#include <string.h>
#include "session.h"
#include "../database/SQL.h"
#include "../database/password_hashing.h"
#include <time.h>


struct Session create_session( char* userId){
	struct Session session;
	unsigned char* session_id = malloc(16);
	create_unique_identifier(session_id);
	char sessionId_hex[33];
	hash_to_hex(session_id, 16, sessionId_hex);
	session.Id  =strdup(sessionId_hex);
	session.userId = userId;
	time_t current_time = time(NULL);
	static char date_string[20];
	strftime(date_string, 20, "%Y-%m-%d", localtime(&current_time));
	session.login_time = date_string;
	return session;
	
}
void insert_session(struct Session session){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	printf("Inserting ('%s', '%s', '%s')\n", 
			session.Id,
			session.userId,
			session.login_time);
	snprintf(sql,sizeof(sql), "INSERT INTO session VALUES ('%s', '%s', '%s');",
			session.Id,
			session.userId,
			session.login_time
			);
	query(conn, sql);
	close_sql_connection(conn);
}

void delete_session(char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "DELETE FROM session WHERE sessionid = '%s'",
			sessionId
			);
	query(conn, sql);
	close_sql_connection(conn);
}

struct Session get_session(char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM session WHERE sessionid = '%s'",
			sessionId
			);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;

	struct Session newsession = create_session(NULL);
	newsession.exists = 0;
	while((row = mysql_fetch_row(res))!=NULL){
		newsession.Id = strdup(row[0]);
		newsession.userId = strdup(row[1]);
		newsession.login_time = strdup(row[2]);
		newsession.exists = 1;
	}

	close_sql_connection(conn);
	return newsession;
}
