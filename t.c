#include <stdio.h>
#include <string.h>
#include <openssl/sha.h>

void hash_password(const char *password, unsigned char *outputBuffer) {
    SHA256((unsigned char*)password, strlen(password), outputBuffer);
}

void print_hash(unsigned char *hash) {
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        printf("%02x", hash[i]);
    }
    printf("\n");
}

int main() {
    const char *password = "my_secure_password";
    unsigned char hash[SHA256_DIGEST_LENGTH];

    hash_password(password, hash);
    printf("SHA-256 hash of '%s': ", password);
    print_hash(hash);

    return 0;
}
