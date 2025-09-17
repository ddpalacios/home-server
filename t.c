#include <stdio.h>
#include <time.h>

int main() {
    // Get the current time
    time_t now = time(NULL);
    if (now == -1) {
        perror("Failed to get the current time");
        return 1;
    }

    // Convert to local time structure
    struct tm *local_time = localtime(&now);
    if (local_time == NULL) {
        perror("Failed to convert to local time");
        return 1;
    }

    // Print the current date and time
    printf("Current date and time: %s", asctime(local_time));

    // Add one day
    local_time->tm_mday += 1;

    // Normalize the time structure (handles overflow, e.g., month change)
    if (mktime(local_time) == -1) {
        perror("Failed to normalize the time structure");
        return 1;
    }

    // Print the updated date and time
    printf("Date and time after adding one day: %s", asctime(local_time));

    return 0;
}

