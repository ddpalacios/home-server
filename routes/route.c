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
#include "life-of-sounds/PATCH/patch_websocket.h"
#include "life-of-sounds/PATCH/patch_audio.h"
#include "life-of-sounds/GET/get_audio.h"
#include "life-of-sounds/GET/sessioninfo.h"
#include "life-of-sounds/DELETE/sessioninfo.h"
#include "life-of-sounds/DELETE/delete_websocket.h"
#include "life-of-sounds/GET/home.h"
#include "life-of-sounds/GET/websocket_protocol.h"
#include "life-of-sounds/GET/users.h"
#include "life-of-sounds/GET/login.h"


void process_websocket_route(char* metadata, char* data){
	printf("%s\n",metadata);
	char* type = get_string_value_from_json("type", metadata);

	 if (strcmp(type, "text")==0){
		char* userid = get_string_value_from_json("userid", metadata);
		printf("TEXT Recieved! FROM UserID %s %s\n", userid, data);

	}else if (strcmp(type, "audio")==0){
		int blob_size = get_int_value_from_json("size", metadata);
		char* blob_id = get_string_value_from_json("Id", metadata);
		char* source = get_string_value_from_json("source", metadata);
		char* database = get_string_value_from_json("database", metadata);
		char* audioName = get_string_value_from_json("audioName", metadata);
		char* sessionid = get_string_value_from_json("sessionid", metadata);
		struct Session session = get_session(sessionid);
		printf("Session ID %s\n", session.Id);
		if (session.exists){
			char* userid = session.userId;
			printf("User ID %s\n", userid);
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
			printf("Path: %s\n",database_userid_source_path);
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
	}else if (strcmp(request_type, "DELETE")==0 && strstr(route, "/life-of-sounds/home/sessioninfo/") != NULL){
		delete_sessioninfo(cSSL, route, request);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/home/sessioninfo/") != NULL){
		get_sessioninfo(cSSL, route, request);
	}else if (strcmp(request_type, "PATCH")==0 && strcmp(route, "/life-of-sounds/audio/")==0){
		 update_audio_info(cSSL, route, request);
	}else if (strcmp(request_type, "PATCH")==0 && strcmp(route, "/life-of-sounds/home/studio/websocket")==0){
		update_websocket_info(cSSL, route, request);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio/websocket")==0){
		get_websocket_protocol(cSSL,route, request, fd);
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
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/audio") != NULL){
		retrieve_audio(cSSL, route, request);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/user") != NULL){
		get_user(cSSL, route, request);
	}
	/*
	if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/login")==0){
		get_template(cSSL,request,"templates/index.html");
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
	*/
	/*
	printf("Route: %s %s \n", request_type, route);
	if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/login")==0){
		get_template("templates/index.html", cSSL, NULL);

		//render_template("templates/index.html", cSSL, NULL);

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
*/
}
