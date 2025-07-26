#include <stdio.h>
#include <openssl/ssl.h>
#include <string.h>
#include "Socket.h"
#include "route.h"
#include "http_utilities.h"
#include "database-server/POST/post_frame.h"
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

void process_route(struct Socket *socket,char* http_header, char* body){
	SSL *cSSL =  socket->cSSL;
	int fd = socket->Id;
	char* route_start = strchr(http_header, ' ');	
	route_start++;
	char* route_end = strchr(route_start, ' '); 
	size_t route_len = route_end - route_start;
	char* route = malloc(route_len+1);
	strncpy(route, route_start, route_len);
	route[route_len] = '\0';
	char* request_type_end = strchr(http_header, ' ');
	size_t request_type_len = request_type_end - http_header;
	char* request_type = malloc(request_type_len+1);
	strncpy(request_type, http_header, request_type_len);
	request_type[request_type_len] = '\0';
	printf("Route: '%s %s'\n",request_type,route);
//	printf("route type: '%s'\n", request_type);
	if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/login")==0){
		get_login_page(cSSL, http_header, "index.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/live_studio")==0){
		get_live_html(cSSL, http_header, "live.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/game_of_life.js")==0){
		get_gol_script(cSSL, http_header, "game_of_life.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/web_audio_api.js")==0){
		get_web_audio_script(cSSL, http_header, "web_audio_api.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/html_utilities.js")==0){
		get_utilities_script(cSSL, http_header, "html_utilities.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/websocket")==0){
		get_websocket_protocol(socket,http_header,body);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/login")==0){
		login(cSSL, http_header, body);
	}
	if (route != NULL){
		free(route);
		route = NULL;
	}
	if (request_type != NULL){
		free(request_type);
		request_type = NULL;
	}
}
