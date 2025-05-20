#include "stdio.h"
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
	printf("Inserting user %s\n", user.fullname);
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];

	snprintf(sql, sizeof(sql),
		    "INSERT INTO user VALUES (NULL, '%s', '%s', '%s');",
		    user.fullname,
		    user.password,
		    user.email);

	printf("SQL: %s\n", sql);
	//MYSQL_RES* query("INSERT INTO user VALUES (NULL, , 'test', 'test@gmail.com');");
	close_sql_connection(conn);

}


struct User* get_users(){



}


struct User* get_user(char* fullname){


}


int validate_login(char* fullname, char* password){


}

