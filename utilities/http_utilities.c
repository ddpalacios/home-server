#include <string.h>
#include <openssl/ssl.h>
#include <openssl/sha.h>
#include <openssl/evp.h>
#include <stdio.h>
#include <stdlib.h>
#include <cjson/cJSON.h>
#include "string_utilities.h"
#include "session.h"
#include "json_utilities.h"

char* retrieve_request_body(char* buf){
	    char* buf_cpy = malloc(5076);
	    strcpy(buf_cpy, buf);

		char* requestBody = strstr(buf_cpy, "\r\n\r\n");
		if (strchr(requestBody, '}') == NULL){
			return NULL;
		}

	    requestBody +=4;
	    if (strlen(requestBody) >0){
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

char* create_cookie(char*path,char* key, char* value){
	static char cookie[255];
	snprintf(cookie, sizeof(cookie), "%s=%s;Path=%s;Secure;",key,value, path);
	return cookie;
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
	return NULL;
}

/*
char *get_file_buffer(char* filename){
	FILE *html_pcontent;
	long content_size;
	char *buffer; 
	html_pcontent = fopen(filename, "rb");
	if (!html_pcontent){
		perror(filename);
		return NULL;
	}
	printf("Fseeking..\n");
	fseek(html_pcontent, 0L, SEEK_END);

	printf("File Opened\n");
	content_size = ftell(html_pcontent);
	
	printf("Content Size \n");
	rewind(html_pcontent);
	printf("Rewinded \n");
	printf("Content Size %ld\n", content_size);
	buffer = malloc(content_size+1);
	if (!buffer){
		fclose(html_pcontent);
		free(buffer);
		fputs("Entire read fails", stderr);
		return NULL;
	}
	if (1 != fread(buffer, content_size, 1, html_pcontent)){
		fclose(html_pcontent);
		free(buffer);
		fputs("entire reads fail", stderr);
		return NULL;
	}
	buffer[content_size] = '\0';
	fclose(html_pcontent);
	return buffer;
}
*/
char *get_file_buffer(char* filename) {
    FILE *html_pcontent = fopen(filename, "rb");
    if (!html_pcontent) {
        perror(filename);
        return NULL;
    }

    if (fseek(html_pcontent, 0L, SEEK_END) != 0) {
	printf("ERROR..\n");
        perror("fseek");
        fclose(html_pcontent);
        return NULL;
    }

    long content_size = ftell(html_pcontent);
    if (content_size == -1L) {
        perror("ftell");
        fclose(html_pcontent);
        return NULL;
    }

    rewind(html_pcontent);
    char *buffer = malloc(content_size + 1);
    if (!buffer) {
        perror("malloc");
        fclose(html_pcontent);
        return NULL;
    }

    size_t bytes_read = fread(buffer, 1, content_size, html_pcontent);
    if (bytes_read != content_size) {
        perror("fread");
        free(buffer);
        fclose(html_pcontent);
        return NULL;
    }

    buffer[content_size] = '\0';
    fclose(html_pcontent);
    return buffer;
}


char* open_html_template_page(char*template_name, char* request){
	char* request_cookie = get_cookie(request);
	char template_dir[50] = "../templates/";

	if (request_cookie == NULL && strstr(template_name, "index.html") == NULL && strstr(template_name, "new_login.html") == NULL){
		template_name = "index.html";
		strcat(template_dir, template_name);

		char *html_buffer = get_file_buffer(template_dir);
		return html_buffer;
	}else if ( strstr(template_name, "new_login.html") != NULL){
				strcat(template_dir, template_name);
				char *html_buffer = get_file_buffer(template_dir);
				return html_buffer;
	}else if ( strstr(template_name, "index.html") != NULL){
				strcat(template_dir, template_name);
				char *html_buffer = get_file_buffer(template_dir);
				return html_buffer;
	}else{
		struct Session session = get_session(request_cookie);
		if (!session.exists){
				template_name = "index.html";
				strcat(template_dir, template_name);
				char *html_buffer = get_file_buffer(template_dir);
				return html_buffer;
		}else{
				strcat(template_dir, template_name);
				char *html_buffer = get_file_buffer(template_dir);
				return html_buffer;
			}
	}
}
	


void set_and_send_cookie(SSL* cSSL, char*cookie){
	char http_header[2048];
	snprintf(http_header, sizeof(http_header),
			"HTTP/1.1 200 OK\r\n"
			"Set-Cookie: %s\r\n"
			"\r\n", cookie);
	SSL_write(cSSL, http_header, strlen(http_header));
}

void send_response_code(SSL *cSSL,int code ){
	char http_header[2048];
	if (code == 200){
			snprintf(http_header, sizeof(http_header),
					"HTTP/1.1 200 OK\r\n"
					"\r\n");
	SSL_write(cSSL, http_header, strlen(http_header));
	}else if (code == 201) {
			snprintf(http_header, sizeof(http_header),
					"HTTP/1.1 201 Created\r\n"
					"\r\n");
	SSL_write(cSSL, http_header, strlen(http_header));

	}else if (code == 400) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 400 Bad Request\r\n"
				"\r\n");

	SSL_write(cSSL, http_header, strlen(http_header));

	}else if (code == 401) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 401 Unauthorized\r\n"
				"\r\n");

	SSL_write(cSSL, http_header, strlen(http_header));
	}else if (code == 409) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 409 Conflict\r\n"
				"\r\n");

	SSL_write(cSSL, http_header, strlen(http_header));

	}else if (code == 404) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 404 Not Found\r\n"
				"\r\n");

	SSL_write(cSSL, http_header, strlen(http_header));
	
	}else if (code == 405) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 405 Not Allowed\r\n"
				"\r\n");

	SSL_write(cSSL, http_header, strlen(http_header));
	}

}
int get_http_header(char* request, char*header_result){
		char*header_end = strstr(request, "\r\n\r\n");
		size_t header_length= header_end - request;
		strncpy(header_result, request, header_length);
		return header_length;
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

void send_websocket_buffer(SSL* cSSL, char* buf){
	unsigned char frame[2 + strlen(buf)];
	frame[0] = 0x81; 
	frame[1] = strlen(buf);
	for (int i =0; i<strlen(buf); i++){
		frame[2+i] = buf[i];
	
	}
	SSL_write(cSSL, buf, 2+strlen(buf));

}


int switch_to_websocket_protocol(SSL *cSSL, char* websocket_sec_acceptKey){
	printf("Switching Protocols...\n");
	char http_header[1024];
	snprintf(http_header, sizeof(http_header),
			"HTTP/1.1 101 Switching Protocols\r\n"
			"Upgrade: websocket\r\n"
			"Connection: Upgrade\r\n"
			"Sec-WebSocket-Accept: %s\r\n"
			"Access-Control-Allow-Origin: *\r\n"
			"\r\n", websocket_sec_acceptKey);
	int res = SSL_write(cSSL, http_header, strlen(http_header));
	return res;
}

void send_buffer_response_code(SSL* cSSL, int code, char* buffer, size_t buffer_length){
	char http_header[2048];
	char* code_text = malloc(50);
		if (code == 200) {
		code_text = "200 OK";
				snprintf(http_header, sizeof(http_header),
						"HTTP/1.1 %s\r\n"
						"Content-Type:  application/octet-stream\r\n"
						"Connection: close\r\n"
						"Content-Length: %zu\r\n"
						"\r\n", code_text,buffer_length);
			SSL_write(cSSL, http_header, strlen(http_header));
			SSL_write(cSSL,buffer,buffer_length);
		}



}


void send_html_response_code(SSL* cSSL,int code, int content_length){
	char http_header[2048];
	char* code_text = malloc(50);
	if (code == 200) {
		code_text = "200 OK";
		snprintf(http_header, sizeof(http_header),
				 "HTTP/1.1 %s\r\n"
				  "Content-Type: text/html\r\n"
				   "Connection: close\r\n"
				   "Content-Length: %d\r\n"
				   "\r\n", code_text,content_length);
	 SSL_write(cSSL, http_header, strlen(http_header));
	}else if (code == 404){
		code_text = "404 Not Found";
		snprintf(http_header, sizeof(http_header),
				 "HTTP/1.1 %s\r\n"
				  "Content-Type: text/html\r\n"
				   "Connection: close\r\n"
				   "\r\n", code_text);
	 SSL_write(cSSL, http_header, strlen(http_header));
	}
}
char* get_query_parameter(char*route, char*param){
	 char* route_copy = malloc(255); 
	 strcpy(route_copy, route);
	 char* parameters = strchr(route_copy, '?');
	 if (parameters == NULL){
		 return NULL;
	 
	 }

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
		  if (Id == NULL){
		  	return NULL;
		  }
		  strncpy(val, token, length);
		  val[length] = '\0';
		  Id++;
		  replace(Id, "%27", "");
		  replace(Id, "%20", "");
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

char* get_code_message(int code){
if (code == 401) {
		return "Unauthorized";
	}else if (code == 201) {
		return "Created";
	}else if (code == 409) {
		return "Conflict";
	}else if (code == 404) {
		return "Not Found";
	}else if (code == 405) {
		return "Not Allowed";
	}else if (code == 400) {
		return "Bad Request";
	}else{
		return "Unknown error code";
	}
}
void send_JSON_response_code( SSL *cSSL,int code, char* json){
		char http_header[2048];
		int json_length = strlen(json);
	if (code == 200){
			snprintf(http_header, sizeof(http_header),
					"HTTP/1.1 200 OK\r\n"
				  "Content-Type: application/json\r\n"
				  "Connection: close\r\n"
				  "Content-Length: %d\r\n"
				  "\r\n", json_length);
	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL,json,json_length);
	}else if (code == 201) {
			snprintf(http_header, sizeof(http_header),
					"HTTP/1.1 201 Created\r\n"
				  "Content-Type: application/json\r\n"
				  "Connection: close\r\n"
				  "Content-Length: %d\r\n"
				  "\r\n", json_length);
	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL,json,json_length);

	}else if (code == 401) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 401 Unauthorized\r\n"
				  "Content-Type: application/json\r\n"
				  "Connection: close\r\n"
				"Content-Length: %d\r\n"
				"\r\n", json_length);
	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL,json,json_length);
	}else if (code == 400) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 400 Bad Request\r\n"
				  "Content-Type: application/json\r\n"
				  "Connection: close\r\n"
				"Content-Length: %d\r\n"
				"\r\n", json_length);
	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL,json,json_length);
	}else if (code == 409) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 409 Conflict\r\n"
				  "Content-Type: application/json\r\n"
				  "Connection: close\r\n"
				"Content-Length: %d\r\n"
				"\r\n", json_length);
	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL,json,json_length);

	}else if (code == 404) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 404 Not Found\r\n"
				  "Content-Type: application/json\r\n"
				  "Connection: close\r\n"
				"Content-Length: %d\r\n"
				"\r\n", json_length);
	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL,json,json_length);
	
	}else if (code == 405) {
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 405 Not Allowed\r\n"
				  "Content-Type: application/json\r\n"
				  "Connection: close\r\n"
				"Content-Length: %d\r\n"
				"\r\n", json_length);
	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL,json,json_length);
	}

}


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

int get_content_length(char*http_header){
		char* content_length_start = strstr(http_header,"Content-Length: ");
		if (content_length_start != NULL){
			char* content_length = strchr(content_length_start,' ');
			content_length++;
			int body_length = atoi(content_length);
			return body_length;
		}
		return 0;
}

int is_connection_keep_alive(char*http_header){
		char* connection_header = strstr(http_header, "Connection: ");
		if (connection_header != NULL){
			char* keep_alive_start= strchr(connection_header, ' ');
			keep_alive_start++;
			char* keep_alive_end= strchr(keep_alive_start, '\r');
			size_t keep_alive_len =   keep_alive_end - keep_alive_start; 
			char*keep_alive = malloc(keep_alive_len);
			strncpy(keep_alive, keep_alive_start, keep_alive_len);
			keep_alive[keep_alive_len] = '\0';
			if (strcmp(keep_alive, "keep-alive") !=0){
				return 0;
			}else{
				return 1;
			
			}
		}else{
			return 0;
		}
}
