#include <stdio.h>
#include "string_utilities.h"
#include <uuid/uuid.h>
#include <ctype.h>
#include <string.h>
#include <openssl/sha.h>
#include <openssl/ssl.h>
#include <openssl/evp.h>
#include <cjson/cJSON.h>
#include <time.h>
#include "SQL.h"
#include "websocket.h"



struct Websocket get_websocket_session(char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM Websocket_Session WHERE sessionId = '%s'",
			sessionId
			);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	int exists = 0;
	struct Websocket websocket;
	websocket.exists =0;
	while((row = mysql_fetch_row(res))!=NULL){
		websocket.Id = strdup(row[0]);
		websocket.name = strdup(row[1]);
		websocket.sessionid = strdup(row[2]);
		websocket.userid = strdup(row[3]);
		websocket.exists = 1;
	}
	close_sql_connection(conn);
	return websocket;
}

int websocket_session_exists_by_userid(char* userid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM Websocket_Session WHERE creator_userid = '%s'",
			userid
			);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	int exists = 0;
	while((row = mysql_fetch_row(res))!=NULL){
		exists = 1;
		break;
	}
	close_sql_connection(conn);
	return exists;
}

int websocket_session_exists(char* sessionId){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM Websocket_Session WHERE sessionId = '%s'",
			sessionId
			);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	int exists = 0;
	while((row = mysql_fetch_row(res))!=NULL){
		exists = 1;
		break;
	}
	close_sql_connection(conn);
	return exists;
}

struct Websocket create_websocket_session(char* name, char* userid){
	struct Websocket websocket;
	unsigned char* websocket_sessionid = malloc(16);
	unsigned char* Id = malloc(16);
	
	create_unique_identifier(Id);
	create_unique_identifier(websocket_sessionid);
	char sessionId_hex[33];
	char Id_hex[33];
	hash_to_hex(websocket_sessionid, 16, sessionId_hex);
	hash_to_hex(Id, 16, Id_hex);
	websocket.Id  = strdup(Id_hex);
	websocket.sessionid  = strdup(sessionId_hex);
	websocket.name  = name;
	websocket.userid = userid;

	return websocket;
}
 void insert_websocket_session(struct Websocket websocket){
        MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
        char sql[255];
        snprintf(sql, sizeof(sql),
                        "INSERT INTO Websocket_Session VALUES ('%s', '%s', '%s', '%s')",
                        websocket.Id,
						websocket.name,
						websocket.sessionid,
						websocket.userid);
        query(conn, sql);
        printf("Query %s\n", sql);
        close_sql_connection(conn);
}

void update_sessionName_by_sessionId(char* sessionId, char* name){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[576];
	snprintf(sql,sizeof(sql),"UPDATE Websocket_Session SET Name = '%s' WHERE sessionId = '%s'",   name,sessionId);
	printf("%s\n", sql);
	query(conn, sql);
	close_sql_connection(conn);
}

int  is_active_websocket_client(int fd){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT socketId  FROM websocket WHERE socketId = '%d'", fd);
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;

	printf("Query: %s\n", sql);
	while((row = mysql_fetch_row(res))!= NULL){
		int active_fd = atoi(row[0]); 
		close_sql_connection(conn);
		return 1;
	}
	close_sql_connection(conn);

	return 0;
}

int  get_total_websockets(){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT COUNT(*)  AS total_count FROM websocket");
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
char* convert_websockets_to_json(struct Websocket* websocket, int count){
	cJSON *root = cJSON_CreateObject();
	printf("count %d\n",count);
	cJSON_AddNumberToObject(root,"total_count",count);
	cJSON* websockets = cJSON_AddArrayToObject(root, "values");
	if (count == 0){
		char *json_string = cJSON_Print(root);
		printf("JSON %s\n", json_string);
		cJSON_Delete(root);
		return json_string;
	}
	count = 0;
	while (websocket[count].Id != NULL) {
		cJSON* root_websocket = cJSON_CreateObject();
		cJSON_AddStringToObject(root_websocket, "Id", websocket[count].Id);
		cJSON_AddStringToObject(root_websocket,"userid",websocket[count].userid);
		cJSON_AddStringToObject(root_websocket, "sessionid", websocket[count].sessionid);
		cJSON_AddStringToObject(root_websocket, "connected_on", websocket[count].connected_on);
		//cJSON_AddNumberToObject(root_websocket, "socketId", websocket[count].socketId);
		cJSON_AddItemToArray(websockets, root_websocket);
		count++;

	}
	char *json_string = cJSON_Print(root);
	// printf("JSON %s\n", json_string);
	cJSON_Delete(root);

	
	return json_string;

} 

/*
char* convert_websocket_to_json(struct Websocket websocket){
	cJSON_AddStringToObject(root, "Id", websocket.Id);
	cJSON_AddStringToObject(root,"userid",websocket.userid);
	cJSON_AddStringToObject(root, "sessionid", websocket.sessionid);
	cJSON_AddStringToObject(root, "connected_on", websocket.connected_on);
	//cJSON_AddNumberToObject(root, "socketId", websocket.socketId);
	char* json_string = cJSON_Print(root);
	cJSON_Delete(root);
	return json_string;
}
*/

char* get_websockets(){
	struct Websocket *websocket;
	websocket = malloc(sizeof(*websocket) * 1000);
	int total_websockets = get_total_websockets();
	// printf("Total Websockets: %d\n", total_websockets);
	if (total_websockets == 0){
		char* json = convert_websockets_to_json(websocket,total_websockets);
		return json;
	}

	

	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql,sizeof(sql), "SELECT * FROM websocket");
	MYSQL_RES* res = query(conn, sql);
	MYSQL_ROW row;
	// printf("Query: %s\n", sql);

	int count = 0;
	while((row = mysql_fetch_row(res))!= NULL){
		websocket[count].userid = strdup(row[0]);
		websocket[count].sessionid = strdup(row[1]);
		websocket[count].connected_on = strdup(row[2]);
		websocket[count].Id = strdup(row[3]);
//		websocket[count].socketId =  atoi(row[4]); 
		count++;
	}

	close_sql_connection(conn);
	char* json = convert_websockets_to_json(websocket,total_websockets);
	return json;
}

// int is_websocket_buffer(unsigned char* buf){
// 	int finVal = buf[0] & 0x80;
// 	int opcode = buf[0] & 0x0F;
// 	int mask = buf[1] & 0x80;
// 	if (opcode == 0 && finVal == 0 && mask==0){
// 		  return 0;
// 	  }else{
// 		  return 1;
// 	  }
	
// 	}
	
	

int  decode_websocket_buffer(unsigned char* buf, char message[]){
	int finVal = buf[0] & 0x80;
	int opcode = buf[0] & 0x0F;
	int mask = buf[1] & 0x80;
	int payload_length = buf[1] & 0x7F;
	if (payload_length < 126){
		if (mask){
			int offset = 2;
			unsigned char* masking_key;
			masking_key = malloc(4);
			for (int i=0; i<4; i++){
				masking_key[i] = buf[2+i];
				offset = 2 + i;
			}
			offset++;
			 unsigned char payload[payload_length+1];
			for (int i=0; i<payload_length; i++){
				payload[i] = buf[offset+i];
			}
			for (int i=0; i<payload_length; i++){
				int val = payload[i] ^ masking_key[i%4];
				message[i] = val; 
			}
			free(masking_key);
			return payload_length;
		}
	}else if (payload_length == 126){
		if (mask){
			unsigned int p1 = buf[2];
			unsigned int p2 = buf[3];
			unsigned int extended_payload_length = (p1 <<8) | p2;
			// printf("Length: %d\n" , extended_payload_length);
			unsigned char* masking_key;

			masking_key = malloc(4);
			int offset = 4;
			for (int i=0; i<4; i++){
				masking_key[i] = buf[4+i];
				offset = 4 + i;
			}
			offset++;
			unsigned char payload[extended_payload_length+1];
			for (int i=0; i<extended_payload_length; i++){
				payload[i] = buf[offset+i];
			}
			for (int i=0; i<extended_payload_length; i++){
				int val = payload[i] ^ masking_key[i%4];
				message[i] = val; 
			}
			free(masking_key);
			return extended_payload_length;

		}
	}
}
			/*
			unsigned int p1 = buf[2];
			unsigned int p2 = buf[3];
			unsigned int extended_length = (p1 << 8) | p2;
			unsigned char* masking_key;
			masking_key = malloc(4);
			int offset = 4;
			for (int i=0; i<4; i++){
				masking_key[i] = buf[4+i];
				offset = 4 + i;
			}
			offset++;
			printf("Extended length: %d\n", extended_length);
			// unsigned char payload[extended_length+1];
			
			for (int i=0; i<extended_length; i++){
				payload[i] = buf[offset+i];
			}
			for (int i=0; i<extended_length; i++){
				int val = payload[i] ^ masking_key[i%4];
				message[i] = val; 
			}
			message[extended_length] = '\0';
			return extended_length;
			*/


void delete_websocket_by_fd(int fd){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"DELETE FROM websocket WHERE socketId = %d ",
			fd);
	printf("query: %s\n", sql);
	query(conn, sql);
	close_sql_connection(conn);
}

void delete_websocket_by_sessionid(char* sessionid){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"DELETE FROM Websocket_Session WHERE sessionid = '%s' ",
			sessionid);
	printf("query: %s\n", sql);
	query(conn, sql);
	close_sql_connection(conn);
}

/*
char* convert_websocket_to_json(struct Websocket websocket){
	cJSON *root = cJSON_CreateObject();
	cJSON_AddStringToObject(root, "Id", websocket.Id);
	cJSON_AddStringToObject(root, "userid", websocket.userid);
	cJSON_AddStringToObject(root, "sessionid", websocket.sessionid);
	cJSON_AddStringToObject(root, "connected_on", websocket.connected_on);
	cJSON_AddNumberToObject(root, "socketId", websocket.socketId);
	char* json_string = cJSON_Print(root);
	cJSON_Delete(root);
	return json_string;
}


void delete_websocket(struct Websocket websocket){
	MYSQL* conn = connect_to_sql("testUser",  "testpwd","localhost", "Users");
	char sql[255];
	snprintf(sql, sizeof(sql),"DELETE FROM websocket WHERE Id = '%s' ",
			websocket.Id);
	printf("query: %s\n", sql);
	query(conn, sql);
	close_sql_connection(conn);

}



char* generate_websocket_accptKey(char* websocket_sec_key ){
	char websocket_key[32];
	char* magic_key =  "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
	char combinedKey[200];
	snprintf(combinedKey, sizeof(combinedKey), "%s%s", websocket_sec_key, magic_key);
	unsigned char hash[SHA_DIGEST_LENGTH];
	SHA1((const unsigned char *) combinedKey, strlen(combinedKey), hash);
	static char base64Hash[SHA_DIGEST_LENGTH * 2];
	int base64Length = EVP_EncodeBlock((unsigned char *)base64Hash, hash, SHA_DIGEST_LENGTH);
	return base64Hash;


}



void send_websocket_buffer(SSL* cSSL, char* text) {
    size_t len = strlen(text);
    size_t header_len;
    size_t total_len;

    if (len < 126) {
        header_len = 2;
    } else if (len <= 0xFFFF) {
        header_len = 4;
    } else {
        header_len = 10;
    }

    total_len = header_len + len;
    unsigned char* frame = malloc(total_len);
    if (!frame) {
        perror("malloc failed");
        return;
    }

    frame[0] = 0x81; // FIN=1, opcode=0x1 (text)

    if (len < 126) {
        frame[1] = len;
    } else if (len <= 0xFFFF) {
        frame[1] = 126;
        frame[2] = (len >> 8) & 0xFF;
        frame[3] = len & 0xFF;
    } else {
        frame[1] = 127;
        for (int i = 0; i < 8; ++i)
            frame[2 + i] = (len >> (8 * (7 - i))) & 0xFF;
    }

    memcpy(frame + header_len, text, len);
    SSL_write(cSSL, frame, total_len);
    free(frame);
}
int  decode_websocket_buffer(char* buf, char message[] ){

    // Byte 1
    int finVal = buf[0] & 0x80; // Bit 0
    int opcode = buf[0] & 0x0F; // Bits 4-7

    // Bytes 2 - 10 Payload length
    int mask = buf[1] & 0x80; // Bit 8 Must expect this to be 1

    //printf("finVal %d, opcode: %d, mask: %d\n",finVal,opcode,mask);
    if (mask){
	    int payloadlength = buf[1] & 0x7F;
	    //printf("Initial Payload Length int: %d\n",buf[1]);
	    //printf("Initial Payload Length : %d\n",254 & 0x7F);
	    unsigned char maskingKey[4];
	    if (payloadlength < 126){
		    int offset = 2;
		    for (int i =0; i<4; i++){
			maskingKey[i] = buf[2+i];
			offset = 2 +i;
		    }
		    ++offset;
		    unsigned char payload[payloadlength+1];
		    for (int i =0; i<payloadlength; i++){
			    payload[i] = buf[offset+i];
		    }
		    for (int i=0; i<payloadlength; i++){
			int message_val = payload[i] ^ maskingKey[i%4];
			message[i] = message_val;
		    }
		    message[payloadlength] = '\0';
	    }

	    if (payloadlength == 126){
		    unsigned int p1 = buf[2] & 0xFF;
		    unsigned int p2 = buf[3] & 0xFF;
		    payloadlength = (p1 << 8) | p2;
		    //printf("Payload Length Extracted: %d\n",payloadlength);
		    int offset = 4;
		    for (int i =0; i<4; i++){
			maskingKey[i] = buf[4+i];
			offset = 4 +i;
		    }
		    ++offset;
		    unsigned char payload[payloadlength+1];
		    for (int i =0; i<payloadlength; i++){
			    payload[i] = buf[offset+i];
		    }
		    for (int i=0; i<payloadlength; i++){
			int message_val = payload[i] ^ maskingKey[i%4];
			message[i] = message_val;
		    }
		    message[payloadlength] = '\0';
	    }
	    //printf("True payload Length : %d\n",payloadlength);
	    return payloadlength;
    }
}
*/
