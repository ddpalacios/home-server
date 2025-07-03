#include <stdio.h>
#include <string.h>
#include <cjson/cJSON.h>
#include "session.h"
#include "string_utilities.h"
#include "SQL.h"

struct Session create_session(char* userId, char* login_time){
	struct Session session;
	unsigned char* session_id = malloc(16);
	create_unique_identifier(session_id);
	char sessionId_hex[33];
	hash_to_hex(session_id, 16, sessionId_hex);
	session.Id  =strdup(sessionId_hex);
	session.userId = userId;
	session.login_time = login_time;
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
struct Session get_session(char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM session WHERE sessionid = '%s'",
			sessionId
			);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;

	struct Session newsession;
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

void delete_session(char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "DELETE FROM session WHERE sessionid = '%s'",
			sessionId
			);
	query(conn, sql);
	close_sql_connection(conn);
}

char* convert_sessions_to_json(struct Session* session, int count){
	cJSON *root = cJSON_CreateObject();
	printf("count %d\n",count);
	cJSON_AddNumberToObject(root,"total_count",count);
	cJSON* sessions = cJSON_AddArrayToObject(root, "values");
	if (count == 0){
		char *json_string = cJSON_Print(root);
		printf("JSON %s\n", json_string);
		cJSON_Delete(root);
		return json_string;
	}
	count = 0;
	while (session[count].Id != NULL) {
		cJSON* root_session = cJSON_CreateObject();
		cJSON_AddStringToObject(root_session, "sessionid", session[count].Id);
		cJSON_AddStringToObject(root_session,"userid",session[count].userId);
		cJSON_AddStringToObject(root_session, "login_time", session[count].login_time);
		cJSON_AddItemToArray(sessions, root_session);
		count++;

	}
	char *json_string = cJSON_Print(root);
	printf("JSON %s\n", json_string);
	cJSON_Delete(root);

	
	return json_string;

} 


int  get_total_sessions(){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT COUNT(*)  AS total_count FROM session");
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;

	int count = 0;
	printf("Query: %s\n", sql);
	while((row = mysql_fetch_row(res))!= NULL){
		count = atoi(row[0]); 
		return count;
	}

	close_sql_connection(conn);
	return count;
}

char* get_sessions(){
	struct Session *session;
	session = malloc(sizeof(*session) *1000 );
	int total_sessions = get_total_sessions();
	if (total_sessions == 0){
		char* json = convert_sessions_to_json(session,total_sessions);
		return json;
	}
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM session");
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	printf("Query: %s\n", sql);

	int count = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		session[count].Id = strdup(row[0]);
		session[count].userId = strdup(row[1]);
		session[count].login_time = strdup(row[2]);
		count++;
	}

	close_sql_connection(conn);
	char* json = convert_sessions_to_json(session, total_sessions);
	return json;
}