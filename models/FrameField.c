#include <stdio.h>
#include "FrameField.h"
#include "SQL.h"
#include <stdlib.h>
#include <string.h>



struct FrameField create_frameField(char* Id, char* name, char*datatype, int byte_offset, int byte_length, char* description, int position, int is_length_prefix){
	struct FrameField frame_field;
	frame_field.Id = Id;
	frame_field.name = name;
	frame_field.datatype = datatype;
	frame_field.byte_offset = byte_offset;
	frame_field.byte_length = byte_length;
	frame_field.description = description;
	frame_field.position = position;
	frame_field.is_length_prefix = is_length_prefix;
	return frame_field;
}


void insert_frameField(struct FrameField frameField){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Protocol");
	char sql[255];
	snprintf(sql, sizeof(sql),
		    "INSERT INTO FrameField VALUES ('%s', '%s', '%s', '%d', '%d', '%s', '%d', '%d');",
		    frameField.Id,
		    frameField.name,
		    frameField.datatype,
		    frameField.byte_offset,
		    frameField.byte_length,
		    frameField.description,
		    frameField.position,
		    frameField.is_length_prefix
		);

	query(conn, sql);
	close_sql_connection(conn);

}



// Hash function
unsigned int hash(const char *key) {
    unsigned int hash = 0;
    while (*key) {
        hash = (hash * 31) + *key++;
    }
    return hash % TABLE_SIZE;
}

// Initialize hashmap
HashMap *createHashMap() {
    HashMap *map = malloc(sizeof(HashMap));
    for (int i = 0; i < TABLE_SIZE; i++) {
        map->table[i] = NULL;
    }
    return map;
}

// Insert key-value pair
void insert(HashMap *map, const char *key, struct FrameField* value) {
    unsigned int index = hash(key);
    Node *newNode = malloc(sizeof(Node));
    newNode->key = strdup(key);
    newNode->value = value;
    newNode->next = map->table[index];
    map->table[index] = newNode;
}

// Search for a key
 struct FrameField* search(HashMap *map, const char *key) {
    unsigned int index = hash(key);
    Node *current = map->table[index];
    while (current) {
        if (strcmp(current->key, key) == 0) {
	   current->value->exists = 1;
            return current->value;
        }
        current = current->next;
    }
    struct FrameField *frameField = malloc(sizeof(struct FrameField) * 10);
    return frameField; // Key not found
}

// Free memory
void freeHashMap(HashMap *map) {
    for (int i = 0; i < TABLE_SIZE; i++) {
        Node *current = map->table[i];
        while (current) {
            Node *temp = current;
            current = current->next;
            free(temp->key);
            free(temp);
        }
    }
    free(map);
}


 HashMap *get_frameFields_as_map(){
	HashMap *map = createHashMap();
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Protocol");
	char sql[255];
	snprintf(sql,sizeof(sql), " SELECT f.name, COUNT(*) AS total_fields, f.ip_addr FROM Frame f INNER JOIN FrameField ff ON ff.Id = f.Id GROUP BY f.name;");
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	int row_count = mysql_num_rows(res);
	MYSQL_ROW *rows = malloc(sizeof(MYSQL_ROW) * row_count);
	int i = 0;
       while ((row = mysql_fetch_row(res)) != NULL) {
		rows[i] = malloc(sizeof(char *) * 2);
		rows[i][0] = strdup(row[0]);  // name
		rows[i][1] = strdup(row[1]);  // total_fields
		rows[i][2] = strdup(row[2]);  // ip_addr
		i++;
	    }
       mysql_free_result(res);
       for (int j = 0; j < i; j++) {
		char *name = rows[j][0];
		char *ip_addr = rows[j][2];
		int total_fields = atoi(rows[j][1]);	
		struct FrameField *ff = malloc(sizeof(struct FrameField) * total_fields);
		char fields_sql[255];
		snprintf(fields_sql, sizeof(fields_sql),
			 "SELECT ff.* FROM FrameField ff "
			 "INNER JOIN Frame f ON f.Id = ff.Id "
			 "WHERE f.ip_addr = '%s'", ip_addr);
		MYSQL_RES *ffres = query(conn, fields_sql);
		MYSQL_ROW ffrow;
		int count = 0;
		 while ((ffrow = mysql_fetch_row(ffres)) != NULL) {
		    ff[count].Id               = strdup(ffrow[0]);
		    ff[count].name             = strdup(ffrow[1]);
		    ff[count].datatype         = strdup(ffrow[2]);
		    ff[count].byte_offset      = atoi(ffrow[3]);
		    ff[count].byte_length      = atoi(ffrow[4]);
		    ff[count].description      = strdup(ffrow[5]);
		    ff[count].position         = atoi(ffrow[6]);
		    ff[count].is_length_prefix = atoi(ffrow[7]);
		    count++;
		}
		  mysql_free_result(ffres);
		  insert(map, ip_addr, ff);
       }
	close_sql_connection(conn);
	return map;
}

