#include <openssl/ssl.h>

char* retrieve_request_body(unsigned char* buf){
            char* requestBody = strstr(buf, "\r\n\r\n");
	    
            if (requestBody != NULL) {
                requestBody += 4;	
		const char *end = strchr(requestBody, '}');
	        size_t jsonLength = end - requestBody + 1; 
	        char jsonPart[jsonLength + 1];             
	        strncpy(jsonPart, requestBody, jsonLength);
	        jsonPart[jsonLength] = '\0';
		printf("JSON: %s\n", jsonPart);
		static char buffer[100];
		strcpy(buffer, jsonPart);
		return buffer;

	    }

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

void render_template(unsigned char *buf, SSL *cSSL){
	char *html_buffer = get_file_buffer(buf);
	int html_length = strlen(html_buffer);
	char http_header[2048];
	snprintf(http_header, sizeof(http_header),
			"HTTP/1.1 200 OK\r\n"
			"Content-Type: text/html\r\n"
			"Connection: close\r\n"
			"Content-Length: %d\r\n"
			"\r\n", html_length);
	printf("Sending %s to client\n", buf);
	SSL_write(cSSL, http_header, strlen(http_header));
	SSL_write(cSSL, html_buffer, html_length);
	free(html_buffer);
}


void send_response_code(int code, SSL *cSSL){
	char http_header[2048];
	if (code == 200){
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 200 OK\r\n"
				"\r\n");
		SSL_write(cSSL, http_header, strlen(http_header));
	}else if (code == 401){
		snprintf(http_header, sizeof(http_header),
				"HTTP/1.1 401 Unauthorized\r\n"
				"\r\n");
		SSL_write(cSSL, http_header, strlen(http_header));
	
	
	
	}
}



