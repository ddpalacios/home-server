#include "User_Token.h"
#include <stdio.h>
#include <string.h>
#include <cjson/cJSON.h>
#include <mysql/mysql.h>
#include <time.h>
#include "string_utilities.h"
#include "http_utilities.h"
#include "SQL.h"

struct User_Token create_token(char* userId){
    	struct User_Token token;
    	unsigned char* Id  = malloc(16);
		create_unique_identifier(Id);

		char Id_hex[33];
		hash_to_hex(Id, 16, Id_hex);


        unsigned char* refresh_token  = malloc(16);
		create_unique_identifier(refresh_token);

		char token_hex[33];
		hash_to_hex(refresh_token, 16, token_hex);

        char buff[20];
        time_t now = time(NULL) + get_refresh_token_max_age_in_seconds();;
        strftime(buff, 20, "%Y-%m-%d %H:%M:%S", localtime(&now));
        token.Id  = strdup(Id_hex);
        token.userId =	strdup(userId);
        token.token =	strdup(token_hex);
        token.expiration_date = strdup(buff);
		if (Id != NULL){
			free(Id);
			Id = NULL;
		}
        return token;

}
struct User_Token get_token(char* token){
    MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
    char sql[255];
	snprintf(sql, sizeof(sql),"SELECT * FROM User_Token WHERE refresh_token = '%s'", token);
    struct User_Token ut;
	ut.exists = 0;
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	while((row = mysql_fetch_row(res))!= NULL){
		ut.Id = strdup( row[0]);
		ut.token = strdup(row[1]);
		ut.userId = strdup(row[2]);
		ut.exists = 1;
        break;
	}
	close_sql_connection(conn);
	return ut;

}

void insert_token(struct User_Token token){
    MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[2045];
	snprintf(sql,sizeof(sql), "INSERT INTO User_Token VALUES ('%s', '%s', '%s', '%s');",
			token.Id,
			token.token,
			token.userId
            ,token.expiration_date);
	printf("%s\n", sql);
	query(conn, sql);
	close_sql_connection(conn);

}
void delete_expired_tokens(){
    MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql)," DELETE ut, u FROM User_Token ut JOIN user u ON ut.userId = u.user_Id WHERE ut.expiration_date < NOW();");
	query(conn, sql);
	close_sql_connection(conn);


}