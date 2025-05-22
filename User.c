#include <stdio.h>
#include <cjson/cJSON.h>
#include <string.h>
#include "SQL.h"
#include "User.h"

struct User create_user(char* fullname, char* password, char* email){

	struct User user;
	user.fullname = fullname;
	user.email = email;
	user.password = password;
	return user;

}

void insert_user(struct User user){
	//printf("Inserting user %s\n", user.fullname);
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	char *password;
	password = (char*) malloc(20);
	strcpy(password,user.password);
	encrypt(password, 0xFACA);
	char* enc = b64_encode((const unsigned char *)password, strlen(password));

	/*
	 * DECRYPTION 
	size_t out_len = b64_decoded_size(enc)+1;
	char* out = malloc(out_len);

	if (!b64_decode(enc, (unsigned char *)out, out_len)) {
		printf("Decode Failure\n");
	}
	out[out_len] = '\0';
	printf("Decoded b64: %s\n", out);
	decrypt(out, 0xFACA);
	printf("decrypted b64: %s\n", out);
	
	*/
	

	snprintf(sql, sizeof(sql),
		    "INSERT INTO user VALUES (NULL, '%s', '%s', '%s');",
		    user.fullname,
		    enc,
		    user.email);

	//printf("SQL: %s\n", sql);
	 query(conn, sql);
	close_sql_connection(conn);

}


struct User* get_users(){



}


struct User get_user(char* fullname){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM user WHERE username = '%s'", fullname);

	struct User user = create_user(NULL, NULL, NULL);
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


int validate_login(char *res){
	printf("Validating Login...\n");
	 cJSON *json = cJSON_Parse(res);
	 cJSON *username = cJSON_GetObjectItem(json, "username");
	 cJSON *password = cJSON_GetObjectItem(json, "password");
	 if (cJSON_IsString(username) && cJSON_IsString(password) ) {
		 //printf("Username: %s\n", username->valuestring);
		  //printf("password: %s\n", password->valuestring);
		 struct User user = get_user(username->valuestring);
		 if (user.exists){
			 //printf("User found! %s\n", user.fullname);

			size_t out_len = b64_decoded_size(user.password)+1;
			char* out = malloc(out_len);
			if (!b64_decode(user.password, (unsigned char *)out, out_len)) {
				printf("Decode Failure\n");
			}
			out[out_len] = '\0';
			//printf("Decoded b64: %s\n", out);
			decrypt(out, 0xFACA);
			out[strlen(out)-1] = '\0';
			//printf("decrypted b64: '%s'\n", out);
			if (strcmp(out,password->valuestring)==0){
				return 1;
			}else{
				return 0;
			}
		 
		 }else{
			 //printf("User NOT found! %s\n", username->valuestring);
			 return 0;
		 
		 
		 }
	 }



}

