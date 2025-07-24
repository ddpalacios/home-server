#include <stdio.h>
#include <string.h>

void processInBatches(const char *input, size_t batchSize) {
    size_t length = strlen(input);
    size_t i = 0;

    while (i < length) {
        char buffer[batchSize + 1]; // +1 for null terminator
        size_t j;

        for (j = 0; j < batchSize && (i + j) < length; j++) {
            buffer[j] = input[i + j];
        }

        buffer[j] = '\0'; // Null-terminate the batch
        printf("Batch: %s\n", buffer);

        i += batchSize;
    }
}

int main() {
    const char *inputString = "This is a sample string to process in batches.";
    size_t batchSize = 10;

    processInBatches(inputString, batchSize);

    return 0;
}

