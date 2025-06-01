#include <stdio.h>
#include <cjson/cJSON.h>
#include <string.h>
#include "SQL.h"
#include "User.h"
#include "password_hashing.h"
#include <openssl/sha.h>


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
	    hash_user_password(combined, password_len + 16, hash);

	    free(combined);

	    user.Id = user_id;
	    user.fullname = strdup(fullname);
	    user.email = strdup(email);
	    user.password = hash;
	    user.salt = salt;

	    return user;
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


struct User* get_users(){



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


struct User validate_login(char *res){
	printf("Validating Login...\n");
	 cJSON *json = cJSON_Parse(res);
	 cJSON *username = cJSON_GetObjectItem(json, "username");
	 cJSON *password = cJSON_GetObjectItem(json, "password");
	 struct User user = get_user_by_name(username->valuestring);

	     if (user.exists) {

		size_t password_len = strlen(password->valuestring);
		unsigned char salt[16];
		hex_to_bytes(user.salt, salt, 16);

		unsigned char* combined = malloc(password_len + 16);
		memcpy(combined, password->valuestring, password_len);
		memcpy(combined + password_len, salt, 16);

		unsigned char* hash = malloc(SHA256_DIGEST_LENGTH);
		hash_user_password(combined, password_len + 16, hash);

		char password_hex[SHA256_DIGEST_LENGTH * 2 + 1];
		hash_to_hex(hash, SHA256_DIGEST_LENGTH, password_hex);

		unsigned char stored_hash[SHA256_DIGEST_LENGTH];
		hex_to_bytes(user.password, stored_hash, SHA256_DIGEST_LENGTH);

		if (memcmp(hash, stored_hash, SHA256_DIGEST_LENGTH) == 0) {
		    printf("Password Match!\n");
			user.exists = 1;
			return user;
		} else {
		    printf("Password Mismatch!\n");
			user.exists = 0;
			return user;
		}

		free(combined);
		free(hash);
	     }

	     return user;

}

