#include <stdio.h>
#include <openssl/ssl.h>
#include <string.h>
#include "route.h"
#include "json_utilities.h"
#include "os_utilities.h"
#include "session.h"

#include "life-of-sounds/POST/new_user.h"
#include "life-of-sounds/POST/login.h"
#include "life-of-sounds/POST/post_audio.h"
#include "life-of-sounds/GET/new_login.h"
#include "life-of-sounds/GET/studio.h"
#include "life-of-sounds/GET/get_live_page.h"
#include "life-of-sounds/GET/get_web_audio_api_script.h"
#include "life-of-sounds/GET/get_game_of_life_script.h"
#include "life-of-sounds/GET/data_page.h"
#include "life-of-sounds/GET/get_recordings_page.h"
#include "life-of-sounds/GET/get_data_table.h"
#include "life-of-sounds/GET/get_websocket_script.h"
#include "life-of-sounds/GET/get_html_utilities_script.h"
#include "life-of-sounds/PATCH/patch_websocket.h"
#include "life-of-sounds/PATCH/patch_audio.h"
#include "life-of-sounds/GET/get_audio.h"
#include "life-of-sounds/GET/get_audio_blob.h"
#include "life-of-sounds/GET/sessioninfo.h"
#include "life-of-sounds/DELETE/sessioninfo.h"
#include "life-of-sounds/DELETE/delete_websocket.h"
#include "life-of-sounds/GET/home.h"
#include "life-of-sounds/GET/websocket_protocol.h"
#include "life-of-sounds/GET/users.h"
#include "life-of-sounds/GET/login.h"


void process_websocket_route(char* metadata, char* data){
	// printf("%s\n",metadata);
	char* type = get_string_value_from_json("type", metadata);

	 if (strcmp(type, "text")==0){
		char* userid = get_string_value_from_json("userid", metadata);

	}else if (strcmp(type, "audio")==0){
		int blob_size = get_int_value_from_json("size", metadata);
		char* blob_id = get_string_value_from_json("Id", metadata);
		char* source = get_string_value_from_json("source", metadata);
		char* database = get_string_value_from_json("database", metadata);
		char* audioName = get_string_value_from_json("audioName", metadata);
		char* sessionid = get_string_value_from_json("sessionid", metadata);
		struct Session session = get_session(sessionid);
		// printf("Session ID %s\n", session.Id);
		if (session.exists){
			char* userid = session.userId;
			// printf("User ID %s\n", userid);
			char database_path[500] = "../";
			strcat(database_path, database);
			create_directory(database_path);
			char database_userid_path[600];
			snprintf(database_userid_path, sizeof(database_userid_path), "%s/%s",database_path,userid);
			create_directory(database_userid_path); 
			char database_userid_source_path[900];
			snprintf(database_userid_source_path, sizeof(database_userid_source_path), "%s/%s/",database_userid_path,source);
			create_directory(database_userid_source_path);
			strcat(database_userid_source_path,audioName);
			// printf("Path: %s\n",database_userid_source_path);
			FILE* fptr = fopen(database_userid_source_path, "ab");
			fwrite(data, 1, blob_size, fptr);
			fclose(fptr);
		}
	}else{
		printf("TYPE NOT VALID TO READ!!\n");
		printf("VALUE: %s\n",data);
	}

}

void process_route(SSL* cSSL, char* request, char* request_type, char* route, int fd){
	printf("Route: %s %s \n", request_type, route);
	if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/login")==0){
		get_login_page(cSSL,request,"index.html");  
	}else if (strcmp(request_type, "DELETE")==0 && strstr(route, "/life-of-sounds/websocket") != NULL){
		delete_websocket(cSSL, route, request);
	}else if (strcmp(request_type, "DELETE")==0 && strstr(route, "/life-of-sounds/session/") != NULL){
		delete_sessioninfo(cSSL, route, request);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/session") != NULL){
		get_sessioninfo(cSSL, route, request);
	}else if (strcmp(request_type, "PATCH")==0 && strcmp(route, "/life-of-sounds/audio")==0){
		 update_audio_info(cSSL, route, request);
	}else if (strcmp(request_type, "PATCH")==0 && strcmp(route, "/life-of-sounds/websocket")==0){
		// update_websocket_info(cSSL, route, request);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/websocket")==0){
		get_websocket_protocol(cSSL,route, request, fd);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/recordings")==0){
		get_data_page(cSSL, request, "recordings.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/data")==0){
		get_data_page(cSSL, request, "data.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio/html_utilities.js")==0){
		get_utilities_script(cSSL,  request, "html_utilities.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/game_of_life.js")==0){
		get_gol_script(cSSL,  request, "game_of_life.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio/websocket.js")==0){
		get_websocket_script(cSSL,  request, "websocket.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/live_studio/web_audio_api.js")==0){
		get_web_audio_script(cSSL, request,"web_audio_api.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio/data_table.js")==0){
		get_data_table_script(cSSL,  request, "data_table.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/live_studio")==0){
		get_live_html(cSSL, request, "live.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio")==0){
		get_studio_page( cSSL, request,  "studio.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home")==0){
		get_home_page(cSSL, request, "home.html");
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/login")==0){
		login(cSSL, request);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/new_login")==0){
		get_new_login_page(cSSL, request, "new_login.html");
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/audio")==0){
		create_new_audio(cSSL, request);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/user")==0){
		create_new_user(cSSL,request);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/audio_blob") != NULL){
		get_audio_blob(cSSL,route, request);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/audio") != NULL){
		retrieve_audio(cSSL, route, request);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/user") != NULL){
		get_user(cSSL, route, request);
	}
}