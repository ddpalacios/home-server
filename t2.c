#include <openssl/rand.h>
#include <stdio.h>
#include <stdlib.h>

int main() {
    unsigned char buffer[16]; // 16 bytes = 128 bits

    if (RAND_bytes(buffer, sizeof(buffer)) != 1) {
        fprintf(stderr, "Error generating random bytes\n");
        return EXIT_FAILURE;
    }

    printf("Random bytes: ");
    for (size_t i = 0; i < sizeof(buffer); i++) {
        printf("%02x", buffer[i]);
    }
    printf("\n");

    return EXIT_SUCCESS;
}

