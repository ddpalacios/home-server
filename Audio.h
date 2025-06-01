
typedef struct Audio {
	char* Id;
	char* starttime;
	char* endtime;
	char* name;
	float duration;
	char* userid;
	char* path;
	int exists;

} audios;
struct Audio get_active_audio_by_userid(char* userid);
int  get_audio_duration_by_id(char* audioId);
void update_audio_value(char* audioId, char* columnName, char* newValue);
void update_audio_duration(char* audioId, char* columnName, float newValue);
struct Audio create_audio( char* uniqueId, char* name, char*path, char* starttime, char* userid, char* endtime, float duration);
struct Audio get_audio(char* Id);
void insert_audio(struct Audio audio);
void delete_audio(struct Audio audio);
char* get_audio_by_userid(char* userid);


