#include <stdio.h>
#include <string.h>
#include <cjson/cJSON.h>
#include "WebsocketClient.h"
#include <time.h>
#include "string_utilities.h"
#include "SQL.h"


void update_username_by_userid(char* userId, char* newValue){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[576];
	snprintf(sql,sizeof(sql),"UPDATE WebsocketClient SET name = '%s' WHERE userId = '%s'", newValue, userId);
	char sql_2[576];

	snprintf(sql_2,sizeof(sql_2),"UPDATE user SET username = '%s' WHERE user_id = '%s'", newValue, userId);
	query(conn, sql_2);
	close_sql_connection(conn);
}

struct WebsocketClient create_websocketclient(char* sessionid, char*socketId,char* userid){
	struct WebsocketClient websocketclient;

	unsigned char* Id  = malloc(16);
	create_unique_identifier(Id);
	char Id_hex[33];
	hash_to_hex(Id, 16, Id_hex);

	websocketclient.Id  =strdup(Id_hex);
	websocketclient.sessionId  = sessionid;
    websocketclient.socketId = socketId;
	// websocketclient.isHost = isHost;
	// websocketclient.name =	username;
	websocketclient.userid = userid;
	
	return websocketclient;
}

char* get_websocketclientsBySessionId_json(char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM WebsocketClient WHERE sessionId = '%s'",
			sessionId
			);
	// printf("%s\n", sql);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	size_t count = 0;
	cJSON *root = cJSON_CreateObject();
	cJSON* sessions_json = cJSON_AddArrayToObject(root, "values");
	while((row = mysql_fetch_row(res))!= NULL){
		cJSON* root_sessions = cJSON_CreateObject();
		cJSON_AddStringToObject(root_sessions, "Id", strdup(row[0]));
		cJSON_AddStringToObject(root_sessions, "socketId", strdup(row[1]));
		cJSON_AddStringToObject(root_sessions, "sessionId", strdup(row[2]));
		cJSON_AddStringToObject(root_sessions, "userId", strdup(row[3]));
		cJSON_AddItemToArray(sessions_json, root_sessions);
		count++;
	}
	cJSON_AddNumberToObject(root,"total_count",count);
	close_sql_connection(conn);
	char *json_string = cJSON_Print(root);
	cJSON_Delete(root);
	return json_string;
}
struct WebsocketClient* get_websocketclients( size_t *total_clients){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM WebsocketClient");
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	struct WebsocketClient *websocketclients;
	websocketclients = malloc(sizeof(*websocketclients) * 1000);
	size_t count = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		  websocketclients[count].Id = strdup(row[0]);
		  websocketclients[count].socketId = strdup(row[1]);
		  websocketclients[count].sessionId = strdup(row[2]);
		  websocketclients[count].exists = 1;
		  count++;

	  }
      close_sql_connection(conn);

	*total_clients = count;
	return websocketclients;
}


struct WebsocketClient* get_websocketclientsBySessionId(char* sessionId, size_t *total_clients){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM WebsocketClient WHERE sessionId = '%s'", sessionId);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	struct WebsocketClient *websocketclients;
	websocketclients = malloc(sizeof(*websocketclients) * 1000);
	size_t count = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		  websocketclients[count].Id = strdup(row[0]);
		  websocketclients[count].socketId = strdup(row[1]);
		  websocketclients[count].sessionId = strdup(row[2]);
		  websocketclients[count].exists = 1;
		  count++;

	  }
      close_sql_connection(conn);

	*total_clients = count;
	// printf("DONE RETRIEVING. Total Count: %d\n",count);
	return websocketclients;
}
struct WebsocketClient get_websocketclientBySocketId(char* socketId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM WebsocketClient WHERE socketId = '%s'", socketId);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	struct WebsocketClient websocketclient;
	websocketclient.exists = 0;
	  while((row = mysql_fetch_row(res))!= NULL){
		   websocketclient.Id = strdup(row[0]);
		  websocketclient.socketId = strdup(row[1]);
		  websocketclient.sessionId = strdup(row[2]);
		//   websocketclient.isHost = atoi(row[3]);
		//   websocketclient.name = strdup(row[3]);
		  websocketclient.userid = strdup(row[3]);
		  websocketclient.exists = 1;
	  }
      close_sql_connection(conn);
	  return websocketclient;
}
struct WebsocketClient get_websocketclient(char* userId, char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM WebsocketClient WHERE userId = '%s' AND sessionId = '%s'", userId, sessionId);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	struct WebsocketClient websocketclient;
	websocketclient.exists = 0;
	  while((row = mysql_fetch_row(res))!= NULL){
		  websocketclient.Id = strdup(row[0]);
		  websocketclient.socketId = strdup(row[1]);
		  websocketclient.sessionId = strdup(row[2]);
		//   websocketclient.isHost = atoi(row[3]);
		//   websocketclient.name = strdup(row[3]);
		  websocketclient.userid = strdup(row[3]);
		  websocketclient.exists = 1;
	  }
      close_sql_connection(conn);
	  return websocketclient;
}

int websocketclient_exists_by_socketid(char* socketId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM WebsocketClient WHERE socketId = '%s'", socketId);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	int exists = 0;
	  while((row = mysql_fetch_row(res))!= NULL){
		  exists=1;
		  break;
	  }
      close_sql_connection(conn);
	  return exists;
}
int websocketclient_exists(char* userid, char* sessionid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM WebsocketClient WHERE userId = '%s' AND sessionId = '%s'", userid, sessionid);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	int exists = 0;
	  while((row = mysql_fetch_row(res))!= NULL){
		  exists=1;
		  break;
	  }
      close_sql_connection(conn);
	  return exists;
}

void insert_websocketclient(struct WebsocketClient websocketclient){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "INSERT INTO WebsocketClient VALUES ('%s', '%s', '%s', '%s');",
			websocketclient.Id,
			websocketclient.socketId,
			websocketclient.sessionId,
			// websocketclient.isHost,
			// websocketclient.name,
			websocketclient.userid);
	query(conn, sql);
	close_sql_connection(conn);
}

void delete_websocketclient_by_Id(char* Id){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"DELETE FROM WebsocketClient WHERE Id = '%s' ",
			Id);
	query(conn, sql);
	close_sql_connection(conn);
}

void delete_websocketclients_by_sessionId(char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"DELETE FROM WebsocketClient WHERE  sessionId = '%s' ", sessionId);
	query(conn, sql);
	close_sql_connection(conn);

}


void delete_websocketclient_by_userid(char* userid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"DELETE FROM WebsocketClient WHERE  userId = '%s' ", userid);
	query(conn, sql);
	close_sql_connection(conn);

}
