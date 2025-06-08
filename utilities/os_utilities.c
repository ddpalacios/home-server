#include <sys/types.h>
#include <stdio.h>
#include <sys/stat.h>
#include <unistd.h>


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