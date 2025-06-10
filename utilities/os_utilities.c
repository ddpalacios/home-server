#include <sys/types.h>
#include <stdio.h>
#include <sys/stat.h>
#include <unistd.h>


#include <fcntl.h>
#include <inttypes.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>
unsigned char* get_file_contents(char* filename, long* out_size){
    FILE *file = fopen(filename, "rb");
    if (!file) {
        perror("Error opening file");
        return NULL;
    }

    fseek(file, 0, SEEK_END);
    long fileSize = ftell(file);
    rewind(file);

    unsigned char *buffer = (unsigned char *)malloc(fileSize);
    if (!buffer) {
        perror("Memory allocation failed");
        fclose(file);
        return NULL;
    }

    size_t bytesRead = fread(buffer, 1, fileSize, file);
    if (bytesRead != fileSize) {
        perror("Error reading file");
        free(buffer);
        fclose(file);
        return NULL;
    }

    fclose(file);
    *out_size = fileSize;  
    return buffer;

    // FILE *file = fopen(filename, "rb"); // Open file in binary read mode
    // if (file == NULL) {
    //     perror("Error opening file");
    //     return NULL;
    // }

    // // Seek to the end of the file to determine its size
    // fseek(file, 0, SEEK_END);
    // long fileSize = ftell(file);
    // rewind(file);

    // // Allocate memory to hold the file data
    // unsigned char *buffer = (unsigned char *)malloc(fileSize);
    // if (buffer == NULL) {
    //     perror("Memory allocation failed");
    //     fclose(file);
    //     return NULL;
    // }

    // // Read the file into the buffer
    // size_t bytesRead = fread(buffer, 1, fileSize, file);
    // if (bytesRead != fileSize) {
    //     perror("Error reading file");
    //     free(buffer);
    //     fclose(file);
    //     return NULL;
    // }

    // printf("Successfully read %ld bytes from %s\n", fileSize, filename);

    // // Process the binary data (e.g., parse WAV header, extract audio samples, etc.)
    // // For now, we just print the first few bytes as an example
    // for (int i = 0; i < 16 && i < fileSize; i++) {
    //     printf("%02X ", buffer[i]);
    // }
    // printf("\n");
    // // Clean up
    // fclose(file);
    // return buffer;

}

int directory_exists(char* path){
	struct stat s;
	int err = stat(path, &s);	
    	if(S_ISDIR(s.st_mode)) {
		return 1;
	    } 
	return 0;

}


int create_directory(char* path){
    int check = mkdir(path,0777);

    if (!check){
    	return check;
    	
    }else {
	return check;
    }

}