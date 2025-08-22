#include <stdio.h>
#include <string.h>
#include <cjson/cJSON.h>
#include "Invitation.h"
#include <time.h>
#include "string_utilities.h"
#include "SQL.h"

struct Invitation create_invitation(char* sessionid){
	struct Invitation invitation;
	unsigned char* invitationid  = malloc(16);
	create_unique_identifier(invitationid);
	char invitationid_hex[33];
	hash_to_hex(invitationid, 16, invitationid_hex);
	invitation.Id  =strdup(invitationid_hex);
	invitation.sessionid = sessionid;
	time_t now = time(NULL);
	struct tm *local_time = localtime(&now);
	local_time->tm_mday += 1;
	if (mktime(local_time) == -1){
		perror("Failed to normalize the time structure");
	}
	char* exp_date = asctime(local_time);
	exp_date[strlen(exp_date)-1] = '\0';
	invitation.expiration_date = exp_date;
	return invitation;
}
struct Invitation get_invitation(char* invitationid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM Invitation WHERE Id = '%s'", invitationid);
	// printf("%s\n", sql);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	struct Invitation invitation;
	invitation.exists = 0;
	  while((row = mysql_fetch_row(res))!= NULL){
		  invitation.Id = strdup(row[0]);
		  invitation.sessionid = strdup(row[1]);
		  invitation.expiration_date = strdup(row[2]);
		  invitation.exists = 1;
	  }
	  close_sql_connection(conn);
	  return invitation;
}

int invitation_exists(char* invitationid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];    
	snprintf(sql, sizeof(sql),"SELECT * FROM Invitation WHERE Id = '%s'", invitationid);
	// printf("%s\n", sql);
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

void insert_invitation(struct Invitation invitation){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	// printf("Inserting ('%s', '%s', '%s')\n",
	// 		invitation.Id,
	// 		invitation.sessionid,
	// 		invitation.expiration_date);
	snprintf(sql,sizeof(sql), "INSERT INTO Invitation VALUES ('%s', '%s', '%s');",
			invitation.Id,
			invitation.sessionid,
			invitation.expiration_date);
	query(conn, sql);
	close_sql_connection(conn);
}
void delete_invitation(struct Invitation invitation){

}
