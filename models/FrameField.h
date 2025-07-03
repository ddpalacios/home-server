#pragma once
#define TABLE_SIZE 10
typedef struct FrameField {
	char* Id;
	char* frame_id; 
	char* frame_name; 
	char* name; 
	char* datatype;
	int byte_offset;
	int byte_length;
	char* description;
	int position;
	int is_length_prefix;
	int exists;
}frameFields;

// Node structure for chaining
typedef struct Node {
    char *key;
    struct FrameField *value;
    struct Node *next;
} Node;

// Hashmap structure
typedef struct HashMap {
    Node *table[TABLE_SIZE];
} HashMap;

struct FrameField create_frameField(char* Id,char* name, char*datatype, int byte_offset, int byte_length, char* description, int position, int is_length_prefix);
void insert_frameField(struct FrameField frameField);


HashMap *createHashMap();
void insert(HashMap *map, const char *key, struct FrameField* value);
struct FrameField* search(HashMap *map, const char *key);
void freeHashMap(HashMap *map);

HashMap *get_frameFields_as_map();
