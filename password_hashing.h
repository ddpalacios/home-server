void hash_user_password(unsigned char* input, size_t length, unsigned char* output);
void hash_to_hex(const unsigned char* in, size_t len, char* out);
void hex_to_bytes(const char *hex, unsigned char *bytes, size_t len);
void create_unique_identifier(unsigned char* buf);
