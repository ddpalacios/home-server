#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"


unsigned char *read_binary_file(const char *filename, size_t *out_size) {
    FILE *fp = fopen(filename, "rb");
    if (!fp) {
        perror(filename);
        return NULL;
    }

    if (fseek(fp, 0L, SEEK_END) != 0) {
        perror("fseek");
        fclose(fp);
        return NULL;
    }

    long size = ftell(fp);
    if (size < 0) {
        perror("ftell");
        fclose(fp);
        return NULL;
    }
    rewind(fp);

    unsigned char *buffer = malloc(size);
    if (!buffer) {
        perror("malloc");
        fclose(fp);
        return NULL;
    }

    size_t bytes_read = fread(buffer, 1, size, fp);
    fclose(fp);

    if (bytes_read != (size_t)size) {
        perror("fread");
        free(buffer);
        return NULL;
    }

    *out_size = size;
    return buffer;
}

void get_image_file(SSL* cSSL, char* request, char* template_name){
	char template_dir[50] = "templates/";
	strcat(template_dir, template_name);
	size_t image_size;

	if (strstr(template_name, ".ico") != NULL ){
		unsigned char *image_data = read_binary_file(template_dir, &image_size);
		send_favicon_response_code(cSSL,200, image_size);
		SSL_write(cSSL, image_data, image_size);	 
		free(image_data);

	 }
	 else if (strstr(template_name, ".png") != NULL ){
				unsigned char *image_data = read_binary_file(template_dir, &image_size);
				send_image_response_code(cSSL,200, image_size);
				SSL_write(cSSL, image_data, image_size);	 
				free(image_data);
	 }
}


void get_video_file(SSL* cSSL, char* request, char* template_name){
	 if (strstr(template_name, ".mp4") != NULL){
				char template_dir[50] = "templates/";
				strcat(template_dir, template_name);
				size_t mp4_size;
				unsigned char *mp4_data = read_binary_file(template_dir, &mp4_size);
				send_video_response_code(cSSL,200, mp4_size);
				SSL_write(cSSL, mp4_data, mp4_size);	 
				free(mp4_data);
	 }
}

void get_gol_script(SSL* cSSL, char* request, char* template_name){
	//  char* request_cookie = get_cookie(request);
	 char *html_buffer = open_html_template_page(template_name, request);

	 if (html_buffer != NULL){
		 int code = 200;
		 int html_length = strlen(html_buffer);
		if (strstr(template_name, ".css") != NULL){
			send_css_response_code(cSSL,200, html_length);
		}else{
			send_html_response_code(cSSL,200, html_length);
		}
		SSL_write(cSSL, html_buffer, html_length);	 
		free(html_buffer);
	 }else{
	 	int code = 404;
		printf("COULD NOT FIND %s\n", template_name);
	 
	 }

}
