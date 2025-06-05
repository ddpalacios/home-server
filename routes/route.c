#include <stdio.h>
#include <string.h>
#include "route.h"
#include "../models/User.h"
#include "HTTP.h"
#include "../models/session.h"
#include "../models/websocket.h"
#include "../models/Audio.h"
#include "../database/FileStorage.h"


void process_websocket_route(char* metadata, char* data){
	char* type = get_string_value_from_json("type", metadata);
	char* userid = get_string_value_from_json("userid", metadata);
	int blob_size = get_int_value_from_json("size", metadata);
	char* blob_id = get_string_value_from_json("Id", metadata);
	char* source = get_string_value_from_json("source", metadata);
	char* database = get_string_value_from_json("database", metadata);
	char* audioName = get_string_value_from_json("audioName", metadata);
	char* path = get_string_value_from_json("path", metadata);

	 if (strcmp(type, "text")==0){
		printf("TEXT Recieved! FROM UserID %s\n", userid);

	}else if (strcmp(type, "audio")==0){
		create_directory(database);
		char database_userid_path[50];
		snprintf(database_userid_path, sizeof(database_userid_path), "%s/%s",database,userid);
		create_directory(database_userid_path);

		char database_userid_source_path[100];
		snprintf(database_userid_source_path, sizeof(database_userid_source_path), "%s/%s",database_userid_path,source);
		create_directory(database_userid_source_path);

		printf("Path: %s\n",path);
		FILE* fptr = fopen(path, "ab");
		fwrite(data, 1, blob_size, fptr);
		fclose(fptr);

	}else{
		printf("TYPE NOT VALID TO READ!!\n");
		printf("VALUE: %s\n",data);
	}

}

void process_route( char* buf, char* request_type, char* route,char* cookie ,char* request_body,SSL* cSSL, int ready_fd){
	printf("Route: %s %s \n", request_type, route);

	if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/login")==0){
		render_template("templates/index.html", cSSL, NULL);

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/logout")==0){
			delete_session(cookie);
			send_response_code(200, cSSL, NULL);

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio")==0){
			printf("Rendering...\n");
			render_template("templates/studio.html", cSSL, cookie);
		
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio/websocket")==0){
			printf("Starting Websocket... FD# %d\n", ready_fd);
			char* websocket_key = get_header_value(buf,"Sec-WebSocket-Key");
			char* wss_accp_key = generate_websocket_accptKey(websocket_key);
			initialize_websocket_protocol(cSSL,  wss_accp_key);
			struct Session session = get_session(cookie);
			struct User user = get_user_by_id(session.userId);
			struct Websocket websocket  = create_websocket(user.Id, cookie, ready_fd);
			insert_websocket_session(websocket);
			printf("Websocket Id %s\n", websocket.Id);
			char* json = convert_websocket_to_json(websocket);
			printf("%s\n", json);
			send_websocket_buffer(cSSL, json); 

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home")==0){
			render_template("templates/home.html", cSSL, cookie);
	
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/session/user")==0){
			struct Session session = get_session(cookie);
			struct User user = get_user_by_id(session.userId);
			char* user_json = convert_user_to_json(user);
			send_json_to_client(cSSL, user_json);

	}else if (strcmp(request_type, "PATCH")==0 && strstr(route, "audio") != NULL){
		char* Id = strchr(strstr(route, "audio"), '/');
		Id++;
		struct Audio audio = get_audio(Id);
		printf("PATCHING Audio ID: %s\n", audio.Id);
		char* res = retrieve_request_body(buf);
		printf("Body: %s\n", res);
		char* userid = get_string_value_from_json("userid", res);
		char* endtime = get_string_value_from_json("endtime", res);

		printf(" userid: %s | endtime: %s\n", userid,endtime);
		update_audio_value(audio.Id, "endtime", endtime);
		int duration = get_audio_duration_by_id(audio.Id);
		float duration_in_minutes = duration/60.0;

		printf(" duration: %f\n", duration_in_minutes);
		update_audio_duration(audio.Id, "duration", duration_in_minutes);

		send_response_code(200, cSSL, NULL);

	}else if (strcmp(request_type, "GET")==0 && strstr(route, "audio") != NULL){

		if (strcmp(route, "/life-of-sounds/studio/audio") ==0 ){
			char* audios_json = get_audios();
			printf("Getting All AUdios\n");
			send_json_to_client(cSSL, audios_json);
		
		}
		char* userid = get_request_parameter(route, "userid");
		char* Id = get_request_parameter(route, "Id");
		
		if (userid == NULL && Id == NULL){
				send_response_code(404, cSSL, NULL);
		}else if (Id != NULL){
			struct Audio audio = get_audio(Id);
			if (!audio.exists) {
				send_response_code(404, cSSL, NULL);
			
			}else{
				char* audio_json = convert_audio_to_json(audio);
				send_json_to_client(cSSL, audio_json);
				send_response_code(200, cSSL, NULL);
			}

		
		}else if (userid != NULL){
			char* userAudios_json = get_audio_by_userid(userid);
			if (userAudios_json != NULL){
				send_json_to_client(cSSL, userAudios_json);
				send_response_code(200, cSSL, NULL);
			}else{
				send_response_code(404, cSSL, NULL);
			}
		
		}

	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/studio/audio")==0){
		printf("%s\n", buf);
		char* res = retrieve_request_body(buf);
		printf("\n\nBODY: %s\n", res);
		char* path = get_string_value_from_json("path", res);
		char* userid = get_string_value_from_json("userid", res);
		char* starttime = get_string_value_from_json("starttime", res);
		char* audioName = get_string_value_from_json("audioName", res);
		char* audioId = get_string_value_from_json("audioId", res);
		char* source = get_string_value_from_json("source", res);
		char* database = get_string_value_from_json("database", res);
		printf("PATH: %s\n", path);
		struct Audio audio = create_audio(audioId, audioName, path, starttime, userid, NULL, 0.0);
		insert_audio(audio);
		send_response_code(200, cSSL, NULL);

	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/login")==0){
		printf("POST %s\n", route);
		struct User user = validate_login(request_body);
		if (!user.exists){
			printf("Incorrect Password!\n");
			send_response_code(401, cSSL, NULL);
		}else{
			printf("Login Successful!\n");
			struct Session session = create_session(user.Id);
			insert_session(session);
			printf("Session ID: %s | %s | %s\n", session.Id, session.userId, session.login_time);
			char* cookie = create_cookie("sessionid",session.Id);
			send_response_code(200, cSSL, cookie);
		}

	}
}
