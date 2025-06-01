#include <openssl/ssl.h>
#include <cjson/cJSON.h>
#include <time.h>
#include <uuid/uuid.h>
#include "SQL.h"
#include "session.h"
#include "User.h"




char*  get_header_value(const char* buf, const char* key){
	static char value[64];
	size_t value_size = sizeof(value);
        char *key_start = strstr(buf, key);
        if (key_start){
                key_start += strlen(key);
                while(*key_start == ' ' || *key_start == ':')key_start++;
                char *line_end = strstr(key_start, "\r\n");

                if (line_end){
                        size_t len= line_end - key_start;
                        if (len >= value_size) len = value_size -1;
                        strncpy(value, key_start, len);
                        value[len] = '\0';
                }
        }else{
                value[0] = '\0';
        }
	return value;
}


 char* get_cookie(unsigned char* buf){
	char *cookie_header = strstr(buf, "Cookie: ");
	if (cookie_header != NULL){
		const char *end = strchr(cookie_header, '=');
		const char* cookie = end+1;
		const char *start = cookie;
		static char guid[32];  
		strncpy(guid, start, 32);
		guid[32] = '\0';
		return guid; 
	}
}

char* retrieve_request_body(unsigned char* buf){
            char* requestBody = strstr(buf, "\r\n\r\n");
            if (requestBody != NULL) {
                requestBody += 4;	
		const char *end = strchr(requestBody, '}');
	        size_t jsonLength = end - requestBody + 1; 
	        char jsonPart[jsonLength + 1];             
	        strncpy(jsonPart, requestBody, jsonLength);
	        jsonPart[jsonLength] = '\0';
		static char buffer[100];
		strcpy(buffer, jsonPart);
		return buffer;
	    }
}
float  get_float_value_from_json(char* key, char* target_json){
	cJSON *json = cJSON_Parse(target_json);
	cJSON *value = cJSON_GetObjectItem(json, key);

    if (cJSON_IsNumber(value)) {
	 float res = value->valuedouble;
	return res;
    }
}

int  get_int_value_from_json(char* key, char* target_json){
	cJSON *json = cJSON_Parse(target_json);
	cJSON *value = cJSON_GetObjectItem(json, key);

    if (cJSON_IsNumber(value)) {
	 int res = value->valueint;
	return res;
    }


}
char* get_string_value_from_json(char* key, char* target_json){
	cJSON *json = cJSON_Parse(target_json);
	cJSON *value = cJSON_GetObjectItem(json, key);

    if (cJSON_IsString(value) && (value->valuestring != NULL)) {
	    char* res = value->valuestring;
	    return res; 
    }
    printf("COULD NOT FIND %s\n", key); 
    return NULL;

}


char *get_file_buffer(char* filename){
	FILE *html_pcontent;
	long content_size;
	char *buffer; 
	html_pcontent = fopen(filename, "r");
	if (!html_pcontent){
		perror(filename);
		exit(1);
	}
	fseek(html_pcontent, 0L, SEEK_END);
	content_size = ftell(html_pcontent);
	rewind(html_pcontent);
	buffer = malloc(content_size+1);
	if (!buffer){
		fclose(html_pcontent);
		free(buffer);
		fputs("Entire read fails", stderr);
		exit(1);
	}
	if (1 != fread(buffer, content_size, 1, html_pcontent)){
		fclose(html_pcontent);
		free(buffer);
		fputs("entire reads fail", stderr);
		exit(1);
	}
	buffer[content_size] = '\0';
	fclose(html_pcontent);
	return buffer;


}

char *get_route(unsigned char* buf){
	char *route = buf + 4;
	char *end =  strchr(route, ' ');
	if (end) {
		*end = '\0';
		return route;
	}
}


void send_json_to_client(SSL *cSSL, char*json){
	int html_length = strlen(json);
	char http_header[2048];
	snprintf(http_header, sizeof(http_header),
			"HTTP/1.1 200 OK\r\n"
			"Content-Type: application/json\r\n"
			"Content-Length: %d\r\n"
			"\r\n", html_length);
	printf("%s\n", http_header);
	if (SSL_write(cSSL, http_header, strlen(http_header)) <=0){
		printf("ERROR HTTP HEADER SENDING DATA TO CLIENT\n");
	}
	if(SSL_write(cSSL, json, html_length)<=0){
		printf("ERROR SENDING JSON DATA TO CLIENT\n");
	}
}



void render_template(unsigned char *buf, SSL *cSSL, char* request_cookie){
	if (!strcmp(buf, "index.html")==0 && !strcmp(buf, "new_user.html")==0){
		printf("RENDERDING\n");
		if (request_cookie == NULL){	
			printf("No Request cookie found.\n");
			buf = "index.html";
		}else{
			struct Session session = get_session(request_cookie);
			if (!session.exists){
				printf("SESSION DOES NOT EXIST.\n");
				buf = "index.html";
			}
		}
	}
	printf("Request cookie '%s' to render %s\n",  request_cookie, buf);
	char *html_buffer = get_file_buffer(buf);
	int html_length = strlen(html_buffer);
	char http_header[2048];
	snprintf(http_header, sizeof(http_header),
			"HTTP/1.1 200 OK\r\n"
			"Content-Type: text/html\r\n"
			"Connection: close\r\n"
			"Content-Length: %d\r\n"
			"\r\n", html_length);

	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL, html_buffer, html_length);
	free(html_buffer);
}


char* create_cookie(char* key, char* value){
	static char cookie[255];
	snprintf(cookie, sizeof(cookie), "%s=%s;Path=/home;Secure;HttpOnly",key,value);
	return cookie;
}

void send_JSON_response_code(int code, SSL *cSSL, char* json){
	char http_header[2048];
	if (code == 200){
		int json_length = strlen(json);
		 snprintf(http_header,sizeof(http_header),
				  "HTTP/1.1 200 OK\r\n"
				  "Content-Type: text/json\r\n"
				  "Content-Length: %d\r\n"
				  "\r\n", json_length);
		  SSL_write(cSSL,http_header,strlen(http_header));
		  SSL_write(cSSL,json,json_length);

	}else if (code == 401) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 401 Unauthorized\r\n"
				"\r\n");
		SSL_write(cSSL, http_header, strlen(http_header));
	}
}

void send_response_code(int code, SSL *cSSL, char* cookie){
	char http_header[2048];
	if (code == 200){
		if (cookie == NULL) {
			printf("NO COOKIE BEING SENT!!!\n");
			snprintf(http_header, sizeof(http_header),
					"HTTP/1.1 200 OK\r\n"
					"\r\n");
		
		}else{
			snprintf(http_header, sizeof(http_header),
					"HTTP/1.1 200 OK\r\n"
					"Set-Cookie: %s\r\n"
					"\r\n", cookie);
			printf("Sending %s\n", http_header);
		}
		SSL_write(cSSL, http_header, strlen(http_header));
	}else if (code == 401) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 401 Unauthorized\r\n"
				"\r\n");
		SSL_write(cSSL, http_header, strlen(http_header));
	
	}
}
void initialize_websocket_protocol(SSL *cSSL, char* websocket_sec_acceptKey){
	char http_header[2048];
	snprintf(http_header, sizeof(http_header),
			"HTTP/1.1 101 Switching Protocols\r\n"
			"Upgrade: websocket\r\n"
			"Connection: Upgrade\r\n"
			"Sec-WebSocket-Accept: %s\r\n"
			"Access-Control-Allow-Origin: *\r\n"
			"\r\n", websocket_sec_acceptKey);
	SSL_write(cSSL, http_header, strlen(http_header));
}

void replace(const char* str, const char* substring, const char* replacement) {
	char* _substr = strstr(str, substring);
	 while (_substr != NULL && strcmp(substring, replacement) != 0) {
		 sprintf(_substr, "%s%s", replacement, _substr + strlen(substring));
		 _substr = strstr(str, substring);
	 }
}

char* get_request_parameter(char*route, char*param){
	 char* route_copy = malloc(255); 
	 strcpy(route_copy, route);

	 char* parameters = strchr(route_copy, '?');
	 char* token = strtok(parameters, "?");
	 if (token == NULL){
	 	return NULL;
	 }
	 token = strtok(parameters, "&");
	 int count = 0;
	 cJSON *root = cJSON_CreateObject();
	 while (token != NULL) {
		 if (count == 0) {
			 token++;
		 }
		  char* Id = strchr(token, '=');
		  char* val = malloc(50);
		  char* pos = strchr(token, '=');
		  size_t length = pos - token;
		  strncpy(val, token, length);
		  val[length] = '\0';
		  Id++;
		  replace(Id, "%27", "");
		  cJSON_AddStringToObject(root, val, Id);
		  token = strtok(NULL, "&");
		  count++;
	 }
	char *json_string = cJSON_Print(root);
	if (json_string) {
		char* result = get_string_value_from_json(param, json_string);	
		free(json_string);
		cJSON_Delete(root);
		return result;
	}
	cJSON_Delete(root);
	return NULL;
}
