#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "User.h"
#include "User_Token.h"
#include "session.h"
#include "Socket.h"

int get_cookie_value (char* http_header, char* key, char value[]){
	char* s = strstr(http_header, key);
	if (s != NULL){
		s += strlen(key) + 1;
		char* end = strchr(s, ';');
		size_t jsonLength = 0;
		if (end != NULL) {
			jsonLength = end - s ;
		}else{
			end = strchr(s, '\r');
			jsonLength = strlen(s);
		}
		strncpy(value, s, jsonLength);
		value[jsonLength] = '\0';
		return jsonLength;
	}
	return -1;
}
void trim(char* value, char result[]){
	char *end = strchr(value, '\r');
	size_t t_len = (end != NULL) ? (size_t)(end - value) : strlen(value);
	result[t_len + 1];
	memcpy(result, value, t_len);
	result[t_len] = '\0';
}


void get_user(struct Socket* socket,char* http_header, char*body, char* route){
	SSL* cSSL = socket->cSSL;
	printf("%s\n",http_header);
	if (strstr(http_header, "session_token=") != NULL){
		char* cookie_key = "session_token";
		char session_token[255];
		int session_token_length = get_cookie_value(http_header, cookie_key, session_token);
		if (session_token_length > 0){
			char trimmed_token[64];
			trim(session_token, trimmed_token);
			printf("SESSION TOKEN: '%s'\n", trimmed_token);
			struct User user =  get_user_by_session_token(trimmed_token);
			if (user.exists){
				char* user_json= convert_user_to_json(user);
				send_JSON_response_code(cSSL,200, user_json);
			}else{
				printf("COULD NOT FIND USER\n");
				send_response_code(cSSL,404);
			}
		}
	 }
	else if (strstr(http_header, "refresh_token=") != NULL){
		char* refresh_key = "refresh_token";
		char refresh_token[255];
		int refresh_token_length = get_cookie_value(http_header, refresh_key, refresh_token);
		char trimmed_token[64];
		trim(refresh_token, trimmed_token);
		printf("REFRESH TOKEN '%s'\n",  trimmed_token);
		struct User_Token user_token = get_token(trimmed_token);
		if (user_token.exists){
			char* path = "/life-of-sounds/";
			struct User user = get_user_by_id(user_token.userId);
			struct User_Token session_token = create_token(user.Id);
			char* session_cookie = create_session_cookie(path, session_token.token);
			char* user_json =  convert_user_to_json(user);
			char http_header[2048];
			int json_length = strlen(user_json);
			snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 200 OK\r\n"
				"Content-Type: application/json\r\n"
				"Connection: close\r\n"
				"Set-Cookie: %s\r\n" 
				"Content-Length: %d\r\n"
				"\r\n",session_cookie ,json_length);
			SSL_write(cSSL, http_header, strlen(http_header));
			SSL_write(cSSL,user_json,json_length);
			update_user_session_token_by_userId(user.Id, session_token.token);

			if (session_cookie != NULL){
				free(session_cookie);
				session_cookie = NULL;
			}
		}else{
			send_response_code(cSSL,404);
		}
	}else{
		printf("NO COOKIES FOUND\n");
		send_response_code(cSSL,404);
	}
	
}
