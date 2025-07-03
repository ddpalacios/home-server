#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "Client_Connection.h"
#include "SQL.h"
#include "string_utilities.h"

struct ClientConnection create_client_connection(char*ip_address, int fd){
	    struct ClientConnection clientConnection;
	    unsigned char* id = malloc(16);
	    create_unique_identifier(id);
      	    clientConnection.Id = id;
    	    clientConnection.ip_address = strdup(ip_address);
    	    clientConnection.fileDescriptorId = fd; 
	    return clientConnection;
}

void update_client_connecion_value(char* Id, char* columnName, char* newValue){

        MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
        char sql[576];
                snprintf(sql,sizeof(sql),"UPDATE ClientConnection SET %s = '%s' WHERE Id = '%s'", columnName, newValue, Id);
        query(conn, sql);
        close_sql_connection(conn);

}

 void insert_client_connection(struct ClientConnection clientConnection){
	    MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users"); 
	    char sql[255];
	    char id_hex[33];
	    hash_to_hex(clientConnection.Id, 16, id_hex);

	    snprintf(sql, sizeof(sql), 
			    "INSERT INTO ClientConnection VALUES ('%s', '%s', '%d', '%s');"
			    ,
			    id_hex 
			   ,clientConnection.ip_address
			   ,clientConnection.fileDescriptorId
			   ,clientConnection.client_type);
 
	    printf("SQL %s\n", sql);
	    query(conn, sql);
	    close_sql_connection(conn);
 }

void delete_connection_by_fd(int fd){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"DELETE FROM ClientConnection WHERE fileDescriptorId = %d ",
			fd);
	printf("query: %s\n", sql);
	query(conn, sql);
	close_sql_connection(conn);
}

int get_total_connections(){
    MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT COUNT(*)  AS total_count FROM ClientConnection");
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



struct ClientConnection get_client_connection_by_fd(int fd){
	struct ClientConnection connection;
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM ClientConnection WHERE fileDescriptorId = %d", fd);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	connection.exists = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		connection.Id = strdup(row[0]);
		connection.ip_address = strdup(row[1]);
		connection.fileDescriptorId = atoi(row[2]); 
		connection.client_type = strdup(row[3]); 
		// printf("SQL CLIENT ID %s | %s\n",connection.Id , strdup(row[3]));
		connection.exists = 1;
	}
	close_sql_connection(conn);
    return connection;
}


struct ClientConnection* get_client_connections(){
	struct ClientConnection *connections;
	int total_connections = get_total_connections();

	connections = malloc(sizeof(*connections) * (total_connections*1000));


	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM ClientConnection");
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;

	int count = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		connections[count].Id = strdup(row[0]);
		connections[count].ip_address = strdup(row[1]);
		connections[count].fileDescriptorId = atoi(row[2]); 
		count++;
	}
	close_sql_connection(conn);
    return connections;

}



// struct ClientConnection get_client_connection(char* clientConnectionId){}
// void insert_client_connection(struct ClientConnection clientConnection){}
// void delete_client_connection(struct ClientConnection clientConnection){}
// char* get_client_connection(){}
// char* convert_clientConnections_to_json(struct ClientConnection* clientConnection, int count){}
// char* convert_clientConnection_to_json(struct ClientConnection clientConnection){}
