#include <stdio.h>
#include <stdlib.h>
#include <cjson/cJSON.h>
#include <string.h>
#include "User.h"
#include "SQL.h"
#include "string_utilities.h"
#include <openssl/sha.h>

char* convert_users_to_json(struct User* user, int count){
	//  cJSON *root = cJSON_CreateObject();
	//  int count =0;
	//  while(user[count].Id != NULL){
	//  	count++;
	//  }
	//  cJSON_AddNumberToObject(root,"total_count",count);
	//  cJSON* users = cJSON_AddArrayToObject(root, "values");

	cJSON *root = cJSON_CreateObject();
	printf("count %d\n",count);
	cJSON_AddNumberToObject(root,"total_count",count);
	cJSON* users = cJSON_AddArrayToObject(root, "values");
	if (count == 0){
		char *json_string = cJSON_Print(root);
		printf("JSON %s\n", json_string);
		cJSON_Delete(root);
		return json_string;
	}
	 count = 0;
	 while (user[count].Id != NULL) {
		 cJSON* root_users = cJSON_CreateObject();
		 cJSON_AddStringToObject(root_users, "Id", user[count].Id);
		 cJSON_AddStringToObject(root_users, "fullname", user[count].fullname);
		 cJSON_AddStringToObject(root_users, "email", user[count].email);
		 cJSON_AddItemToArray(users, root_users);
		 count++;
	 }

	 char* json_string = cJSON_Print(root);
	 cJSON_Delete(root);
	 return json_string;
}

char* convert_user_to_json(struct User user){
	 cJSON *root = cJSON_CreateObject();
	 cJSON_AddStringToObject(root, "Id", user.Id);
	 cJSON_AddStringToObject(root, "fullname", user.fullname);
	 cJSON_AddStringToObject(root, "email", user.email);
	 char* json_string = cJSON_Print(root);
	 cJSON_Delete(root);
	 return json_string;
}

struct User create_user(char* fullname, char* password, char* email){
	    struct User user;
	    unsigned char* user_id = malloc(16);
	    create_unique_identifier(user_id);

	    unsigned char* salt = malloc(16);
	    create_unique_identifier(salt);

	    size_t password_len = strlen(password);
	    unsigned char* combined = malloc(password_len + 16);
	    memcpy(combined, password, password_len);
	    memcpy(combined + password_len, salt, 16);

	    unsigned char* hash = malloc(SHA256_DIGEST_LENGTH);
	    hash_string(combined, password_len + 16, hash);

	    free(combined);

	    user.Id = user_id;
	    user.fullname = strdup(fullname);
	    user.email = strdup(email);
	    user.password = hash;
	    user.salt = salt;

	    return user;
}
struct User get_user_by_name(char* fullname){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM user WHERE username = '%s'", fullname);

        struct User user;
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	while((row = mysql_fetch_row(res))!= NULL){
		//printf("%s\n", row[0]);
		user.Id = strdup( row[0]);
		user.fullname = strdup(row[1]);
		user.password = strdup(row[2]);
		user.email = strdup(row[3]);
		user.salt = strdup(row[4]);
		user.exists = 1;
		close_sql_connection(conn);
		return user;
	}
	close_sql_connection(conn);
	struct User null_user = {0};	
	null_user.exists = 0;
	return null_user;
	
}
void insert_user(struct User user){
	//printf("Inserting user %s\n", user.fullname);
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	char id_hex[33];
	char salt_hex[33];
	char password_hex[SHA256_DIGEST_LENGTH * 2 + 1];
	hash_to_hex(user.Id, 16, id_hex);
	hash_to_hex(user.salt, 16, salt_hex);
	hash_to_hex(user.password, SHA256_DIGEST_LENGTH, password_hex);

	snprintf(sql, sizeof(sql),
		    "INSERT INTO user VALUES ('%s', '%s', '%s', '%s', '%s');",
		    id_hex,
		    user.fullname,
		    password_hex,
		    user.email,
		    salt_hex);

	printf("SQL: %s\n", sql);
	query(conn, sql);
	close_sql_connection(conn);

}

int validate_login(char* username, char* password){
	printf("Validating Login...\n");
	 struct User user = get_user_by_name(username);
	     if (user.exists) {
		size_t password_len = strlen(password);
		unsigned char salt[16];
		hex_to_bytes(user.salt, salt, 16);
		unsigned char* combined = malloc(password_len + 16);
		memcpy(combined, password, password_len);
		memcpy(combined + password_len, salt, 16);
		unsigned char* hash = malloc(SHA256_DIGEST_LENGTH);
		hash_string(combined, password_len + 16, hash);
		char password_hex[SHA256_DIGEST_LENGTH * 2 + 1];
		hash_to_hex(hash, SHA256_DIGEST_LENGTH, password_hex);
		unsigned char stored_hash[SHA256_DIGEST_LENGTH];
		hex_to_bytes(user.password, stored_hash, SHA256_DIGEST_LENGTH);
		if (memcmp(hash, stored_hash, SHA256_DIGEST_LENGTH) == 0) {
			free(combined);
			free(hash);
			return 1;
		} else {
			free(combined);
			free(hash);
			return 0;
		}

	     }

	     return -1;

}

struct User get_user_by_id(char* userid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM user WHERE user_id = '%s'", userid);

        struct User user;
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	while((row = mysql_fetch_row(res))!= NULL){
		//printf("%s\n", row[0]);
		user.Id = strdup( row[0]);
		user.fullname = strdup(row[1]);
		user.password = strdup(row[2]);
		user.email = strdup(row[3]);
		user.exists = 1;
		close_sql_connection(conn);
		return user;
	}
	close_sql_connection(conn);
	struct User null_user = {0};	
	null_user.exists = 0;
	return null_user;

}

int get_total_users(){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	 char sql[255];
	 struct User users;
	 snprintf(sql,sizeof(sql), "SELECT COUNT(*)  AS total_count FROM user ");
	 MYSQL_RES* res = query(conn, sql);
	  MYSQL_ROW row;
	  int count = 0;
	   while((row = mysql_fetch_row(res))!= NULL){
		   count = atoi(row[0]);
		   return count;
	   }

	close_sql_connection(conn);
	return count;

}


char*  get_users(){
	struct User *user;
	user = malloc(sizeof(*user) *1000 );
	int total_users = get_total_users();
	if (total_users == 0){
		char* json = convert_users_to_json(user,total_users);
		return json;
	}

	 MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	 char sql[255];
	 snprintf(sql,sizeof(sql), "SELECT * FROM user");
	 MYSQL_RES* res = query(conn, sql);
	 MYSQL_ROW row;
	 int count = 0;
	 while((row = mysql_fetch_row(res))!= NULL){
		 user[count].Id = strdup(row[0]);
		 user[count].fullname = strdup(row[1]);
		 user[count].email = strdup(row[3]);
		 count++;
	 
	 }
	  
	close_sql_connection(conn);
	char* json = convert_users_to_json(user,total_users);
	return json;

}
/*








void create_login(char *res){
	printf("Creating Login...\n");
	 cJSON *json = cJSON_Parse(res);
	 cJSON *username = cJSON_GetObjectItem(json, "username");
	 cJSON *password = cJSON_GetObjectItem(json, "password");
	 cJSON *email = cJSON_GetObjectItem(json, "email");

	 if (cJSON_IsString(username) && cJSON_IsString(password) && cJSON_IsString(email) ) {
			struct User user = create_user(username->valuestring,  password->valuestring, email->valuestring);
			insert_user(user);

	 }


}



*/
