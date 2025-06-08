void hash_to_hex(const unsigned char* in, size_t len, char* out);
void hex_to_bytes(const char *hex, unsigned char *bytes, size_t len);
void hash_string(unsigned char* input, size_t length, unsigned char* output);
void create_unique_identifier(unsigned char* buf);
void replace(const char* str, const char* substring, const char* replacement);