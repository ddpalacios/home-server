#include <stdio.h>

void getSub(char *s, char *ss, int pos, int l) {
    int i = 0;

    // Copy substring into ss
    while (i < l) {
        ss[i] = s[pos + i];
        i++;
    }
    
    // Null terminate the substring
    ss[i] = '\0';  
}


int main() {
    char s[] = "Hello, Geeks!";
  
    // Char array to store the substring
    char ss[20];  

    // Extract substring starting from 
    // index 7 with length 5 ("Geeks")
    getSub(s, ss, 7, 5);

    printf("%s\n", ss);
    return 0;
}
