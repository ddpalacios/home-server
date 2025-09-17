#include "Websocket_Message.h"
#include <stdio.h>
#include <string.h>
#include <cjson/cJSON.h>
#include <mysql/mysql.h>
#include <time.h>
#include "string_utilities.h"
#include "SQL.h"


struct Websocket_Message create_message(char* sessionId, char* content, char* timestamp, char* username, char* userid, int is_notification){
    	struct Websocket_Message message;
    	unsigned char* Id  = malloc(16);
		create_unique_identifier(Id);

		char Id_hex[33];
		hash_to_hex(Id, 16, Id_hex);

        message.Id  = strdup(Id_hex);;
        message.sessionId  = strdup(sessionId);
        message.content = strdup(content);
        message.timestamp = strdup(timestamp);
        message.username =	strdup(username);
        message.userid =	strdup(userid);
        message.is_notification =	is_notification;
		
		if (Id != NULL){
			free(Id);
			Id = NULL;
		}
        return message;

}

// struct Websocket_Message* get_messages_by_sessionid(char* sessionid){
//     MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
// 	char sql[255];
// 	snprintf(sql, sizeof(sql),"SELECT * FROM Websocket_Message WHERE sessionId = '%s'", sessionid);
// 	MYSQL_RES* res = query(conn, sql);
// 	MYSQL_ROW row;
// 	struct Websocket_Message *messages;
// 	messages = malloc(sizeof(*messages) * 1000);
// 	size_t count = 0;
// 	while((row = mysql_fetch_row(res))!= NULL){
// 		  messages[count].Id = strdup(row[0]);
// 		  messages[count].sessionId = strdup(row[1]);
// 		  messages[count].content = strdup(row[2]);
// 		  messages[count].timestamp = strdup(row[3]);
// 		  messages[count].username = strdup(row[4]);
// 		  messages[count].exists = 1;
// 		  count++;

// 	  }
//       close_sql_connection(conn);
// 	return messages;
// }


char* get_messages_by_sessionid_json(char* sessionid){
		MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
		char sql[255];
		snprintf(sql, sizeof(sql),"SELECT * FROM Websocket_Message WHERE sessionId = '%s'", sessionid);
		printf("%s\n", sql);
		MYSQL_RES* res = query(conn, sql);
		MYSQL_ROW row;
		size_t count = 0;
		cJSON *root = cJSON_CreateObject();
		cJSON* messages_json = cJSON_AddArrayToObject(root, "values");
		while((row = mysql_fetch_row(res))!= NULL){
			cJSON* root_messages = cJSON_CreateObject();
			cJSON_AddStringToObject(root_messages, "Id", strdup(row[0]));
			cJSON_AddStringToObject(root_messages, "sessionId", strdup(row[1]));
			cJSON_AddStringToObject(root_messages, "content", strdup(row[2]));
			cJSON_AddStringToObject(root_messages, "timestamp", strdup(row[3]));
			cJSON_AddStringToObject(root_messages, "username", strdup(row[4]));
			cJSON_AddStringToObject(root_messages, "userid", strdup(row[5]));
			cJSON_AddNumberToObject(root_messages, "is_notification", atoi(row[6]));
			cJSON_AddItemToArray(messages_json, root_messages);
			count++;
		}
		cJSON_AddNumberToObject(root,"total_count",count);
		close_sql_connection(conn);
		char *json_string = cJSON_Print(root);
		cJSON_Delete(root);
		return json_string;
}


void delete_messages_by_sessionid(char* sessionid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"DELETE FROM Websocket_Message WHERE  sessionId = '%s' ", sessionid);
	query(conn, sql);
	close_sql_connection(conn);
}



void insert_message(struct Websocket_Message message){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[2045];
	snprintf(sql,sizeof(sql), "INSERT INTO Websocket_Message VALUES ('%s', '%s', '%s', '%s', '%s', '%s', '%d');",
			message.Id,
			message.sessionId,
			message.content,
			message.timestamp,
			message.username,
			message.userid,
			message.is_notification);
	query(conn, sql);
	close_sql_connection(conn);
}
