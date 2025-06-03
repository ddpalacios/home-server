#include <stdio.h>
#include <string.h>
#include "route.h"
#include "User.h"
#include "HTTP.h"
#include "session.h"
#include "websocket.h"

void process_route( char* buf, char* request_type, char* route,char* cookie ,char* request_body,SSL* cSSL){
	printf("Route: %s %s \n", request_type, route);

	if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/login")==0){
		render_template("index.html", cSSL, NULL);

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/logout")==0){
			delete_session(cookie);
			send_response_code(200, cSSL, cookie);

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio")==0){
			printf("Rendering...\n");
			render_template("studio.html", cSSL, cookie);
		
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home/studio/websocket")==0){
			printf("Starting Websocket...\n");
			char* websocket_key = get_header_value(buf,"Sec-WebSocket-Key");
			char* wss_accp_key = generate_websocket_accptKey(websocket_key);
			initialize_websocket_protocol(cSSL,  wss_accp_key);
			struct Session session = get_session(cookie);
			struct User user = get_user_by_id(session.userId);
			insert_websocket_session(user.Id, cookie);

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home")==0){
			render_template("home.html", cSSL, cookie);
	
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/session/user")==0){
			struct Session session = get_session(cookie);
			struct User user = get_user_by_id(session.userId);
			char* user_json = convert_user_to_json(user);
			send_json_to_client(cSSL, user_json);

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
