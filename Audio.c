#include "Audio.h"
#include <cjson/cJSON.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "SQL.h"
char* convert_audio_to_json(struct Audio audio){
	cJSON *root = cJSON_CreateObject();
	cJSON_AddStringToObject(root, "Id", audio.Id);
	cJSON_AddStringToObject(root,"userid",audio.userid);
	cJSON_AddStringToObject(root, "name", audio.name);
	cJSON_AddStringToObject(root, "starttime", audio.starttime);
	cJSON_AddStringToObject(root, "endtime", audio.endtime);
	cJSON_AddNumberToObject(root, "duration", audio.duration);
	cJSON_AddStringToObject(root, "path", audio.path);
	char* json_string = cJSON_Print(root);
	cJSON_Delete(root);
	return json_string;
}

char* convert_audios_to_json(struct Audio* audio){
	cJSON *root = cJSON_CreateObject();
	int count = 0;
	while (audio[count].Id != NULL) {
		count++;
	}
	printf("count %d\n",count);
	cJSON_AddNumberToObject(root,"total_count",count);
	cJSON* audios = cJSON_AddArrayToObject(root, "values");
	count = 0;
	while (audio[count].Id != NULL) {
		cJSON* root_audio = cJSON_CreateObject();
		cJSON_AddStringToObject(root_audio, "Id", audio[count].Id);
		cJSON_AddStringToObject(root_audio,"userid",audio[count].userid);
		cJSON_AddStringToObject(root_audio, "name", audio[count].name);
		cJSON_AddStringToObject(root_audio, "starttime", audio[count].starttime);
		cJSON_AddStringToObject(root_audio, "endtime", audio[count].endtime);
		cJSON_AddNumberToObject(root_audio, "duration", audio[count].duration);
		cJSON_AddStringToObject(root_audio, "path", audio[count].path);
		cJSON_AddItemToArray(audios, root_audio);
		count++;

	}
	char *json_string = cJSON_Print(root);
	printf("JSON %s\n", json_string);
	cJSON_Delete(root);

	
	return json_string;

} 


struct Audio get_audio(char* audioId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	struct Audio audio;
	snprintf(sql,sizeof(sql), "SELECT * FROM Audio WHERE Id = '%s'", audioId);
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

int  get_total_audio(){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	struct Audio audio;
	snprintf(sql,sizeof(sql), "SELECT COUNT(*)  AS total_count FROM Audio");
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
int  get_total_audio_by_userid(char* userid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	struct Audio audio;
	snprintf(sql,sizeof(sql), "SELECT COUNT(*)  AS total_count FROM Audio WHERE userid = '%s' ", userid);
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
		return duration;
	}

	close_sql_connection(conn);
	return 0.0;



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
char* get_audios(){
	int total_audios = get_total_audio();
	if (total_audios == 0){
		return NULL;
	}
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM Audio");
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	printf("Query: %s\n", sql);
	struct Audio *audio;
	audio = malloc(sizeof(*audio) * (total_audios*10));
	int count = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		audio[count].Id = strdup(row[0]);
	       	audio[count].name = strdup(row[1]);
		audio[count].starttime = strdup(row[2]);
		audio[count].duration = atof(row[4]);
		if (row[3] != NULL){
			audio[count].endtime = strdup(row[3]);
		}
		audio[count].userid = strdup(row[5]);
		audio[count].path = strdup(row[6]);
		count++;
	}

	close_sql_connection(conn);
	char* json = convert_audios_to_json(audio);
	return json;
}

char* get_audio_by_userid(char* userid){
	if (userid == NULL){
		return NULL;
	}
	int total_audios = get_total_audio_by_userid(userid);
	if (total_audios == 0){
		return NULL;
	}
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM Audio WHERE userid = '%s'", userid);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	printf("Query: %s\n", sql);
	struct Audio *audio;
	audio = malloc(sizeof(*audio) * (total_audios*10));
	int count = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		audio[count].Id = strdup(row[0]);
	       	audio[count].name = strdup(row[1]);
		audio[count].starttime = strdup(row[2]);
		audio[count].duration = atof(row[4]);
		if (row[3] != NULL){
			audio[count].endtime = strdup(row[3]);
		}
		audio[count].userid = strdup(row[5]);
		audio[count].path = strdup(row[6]);
		count++;
	}

	close_sql_connection(conn);
	if (count == 0){
		return NULL;
	}
	char* json = convert_audios_to_json(audio);
	return json;
}
