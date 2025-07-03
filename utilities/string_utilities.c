#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <openssl/sha.h>
#include <openssl/rand.h>


void hash_to_hex(const unsigned char* in, size_t len, char* out){
	 for (size_t i = 0; i < len; i++) {
		  sprintf(out + i * 2, "%02x", in[i]);
	 }
	  out[len * 2] = '\0';


}
void hex_to_bytes(const char *hex, unsigned char *bytes, size_t len) {
	for (size_t i = 0; i < len; i++) {
	 sscanf(hex + 2*i, "%2hhx", &bytes[i]);

	}
}

void create_unique_identifier(unsigned char* buf){
 if (RAND_bytes(buf, 16) != 1) {
	 fprintf(stderr, "Error generating salt\n");
 }

}
void hash_string(unsigned char* input, size_t length, unsigned char* output) {
	SHA256(input, length, output);
}
void replace(const char* str, const char* substring, const char* replacement) {
	char* _substr = strstr(str, substring);
	 while (_substr != NULL && strcmp(substring, replacement) != 0) {
		 sprintf(_substr, "%s%s", replacement, _substr + strlen(substring));
		 _substr = strstr(str, substring);
	 }
}
