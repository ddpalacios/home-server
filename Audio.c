#include "Audio.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "SQL.h"



struct Audio create_audio(char* uniqueId, char* name, char*path, char* starttime, char*userid, char* endtime, float duration){
	struct Audio audio;
	audio.name = name; //strdup(name);
	audio.path= path;//strdup(path);
	audio.Id = uniqueId;//strdup(uniqueId); 
	audio.starttime = starttime;
	audio.userid = userid;
	audio.endtime = endtime;
	audio.duration = duration;


	return audio;
}

int  get_audio_duration_by_id(char* audioId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	struct Audio audio;
	snprintf(sql,sizeof(sql), "SELECT  CAST(TIMESTAMPDIFF(SECOND,starttime, endtime) AS INT) AS duration FROM Audio WHERE Id = '%s' ", audioId);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;

	printf("Query: %s\n", sql);
	while((row = mysql_fetch_row(res))!= NULL){
		int duration = atoi(row[0]); //(int*)row[0] ; 


		//printf("Duration: %d\n", row[0]);
		return duration;
	}

	close_sql_connection(conn);



}

struct Audio get_active_audio_by_userid(char* userid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	struct Audio audio;
	snprintf(sql,sizeof(sql), "SELECT * FROM Audio WHERE userid = '%s' AND endtime IS NULL", userid);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	printf("Query: %s\n", sql);

	audio.exists = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		audio.Id = strdup(row[0]);
		audio.name = strdup(row[1]);
		audio.starttime = strdup(row[2]);
		memcpy(&audio.duration, row[4], sizeof(float));
		if (row[3] != NULL){
			audio.endtime = strdup(row[3]);
		}
		audio.userid = strdup(row[5]);
		audio.path = strdup(row[6]);
		audio.exists = 1;
	   }

	close_sql_connection(conn);
	return audio;



}


void update_audio_duration(char* audioId, char* columnName, float newValue){

	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[576];
	if (strcmp(columnName, "duration")==0){
		snprintf(sql,sizeof(sql),"UPDATE Audio SET %s = '%f' WHERE Id = '%s'", columnName, newValue, audioId);
	}

	query(conn, sql);
	close_sql_connection(conn);
}

void update_audio_value(char* audioId, char* columnName, char* newValue){

	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[576];
		snprintf(sql,sizeof(sql),"UPDATE Audio SET %s = '%s' WHERE Id = '%s'", columnName, newValue, audioId);
	query(conn, sql);
	close_sql_connection(conn);

}

void insert_audio(struct Audio audio){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[576];

	if (audio.endtime != NULL){
		snprintf(sql, sizeof(sql),
			"INSERT INTO Audio VALUES ('%s', '%s', '%s','%s', '%f' , '%s' ,'%s');",
			audio.Id
			,audio.name
			,audio.starttime
			,audio.endtime
			,audio.duration
			,audio.userid
			,audio.path);
		printf("SQL %s\n", sql);
	}else{
	
		snprintf(sql, sizeof(sql),
			"INSERT INTO Audio VALUES ('%s', '%s', '%s',NULL, '%f' , '%s' ,'%s');",
			audio.Id
			,audio.name
			,audio.starttime
			,audio.duration
			,audio.userid
			,audio.path);
		printf("SQL %s\n", sql);
	
	
	}
	query(conn, sql);
	close_sql_connection(conn);



}



