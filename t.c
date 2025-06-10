#include <stdio.h>
#include <stdlib.h>

int main() {
    const char *filename = "users/57f11b2cb0758af0dd4f6f0aa827a2d9/recordings/Name.webm";  
    FILE *file = fopen(filename, "rb"); // Open file in binary read mode
    if (file == NULL) {
        perror("Error opening file");
        return 1;
    }
    
    // Seek to the end of the file to determine its size
    fseek(file, 0, SEEK_END);
    long fileSize = ftell(file);
    // // Allocate memory to hold the file data
     char *buffer = malloc(fileSize);
    // // Read the file into the buffer
    size_t bytesRead = fread(buffer, 1, fileSize, file);
    fwrite(buffer, 1, fileSize, stdout);

    return 0;
}

