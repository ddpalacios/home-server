#include <stdio.h>
#include <openssl/ssl.h>
#include <string.h>
#include "Socket.h"
#include "websocket.h"
#include "route.h"
#include "Invitation.h"
#include "http_utilities.h"
#include "database-server/POST/post_frame.h"
#include "Websocket/GET/start_websocket_session.h"
#include "life-of-sounds/POST/post_user.h"
#include "life-of-sounds/POST/login.h"
#include "life-of-sounds/POST/post_websocket_session.h"
#include "life-of-sounds/POST/post_websocket_client.h"
#include "life-of-sounds/GET/get_websocket_client.h"
#include "life-of-sounds/POST/post_audio.h"
#include "life-of-sounds/POST/post_browser_session.h"
#include "life-of-sounds/GET/new_login.h"
#include "life-of-sounds/GET/studio.h"
#include "life-of-sounds/GET/get_live_page.h"
#include "chicago-transits/GET/get_template.h"
#include "blob-storage/GET/get_blob_storage_files.h"
#include "blob-storage/POST/post_blob.h"
#include "local-server/POST/post_local_server.h"
#include "life-of-sounds/GET/get_web_audio_api_script.h"
#include "life-of-sounds/GET/get_game_of_life_script.h"
#include "life-of-sounds/GET/data_page.h"
#include "life-of-sounds/GET/get_recordings_page.h"
#include "life-of-sounds/GET/get_data_table.h"
#include "life-of-sounds/GET/get_session_messages.h"
#include "life-of-sounds/GET/get_websocket_script.h"
#include "life-of-sounds/GET/get_html_utilities_script.h"
#include "life-of-sounds/PATCH/patch_websocket_client.h"
#include "life-of-sounds/PATCH/patch_browser_session.h"
#include "life-of-sounds/PATCH/patch_websocket_session.h"
#include "life-of-sounds/GET/get_audio.h"
#include "life-of-sounds/GET/get_audio_blob.h"
#include "life-of-sounds/GET/sessioninfo.h"
#include "life-of-sounds/DELETE/sessioninfo.h"
#include "life-of-sounds/DELETE/delete_websocket_session.h"
#include "life-of-sounds/GET/home.h"
#include "life-of-sounds/GET/websocket_protocol.h"
#include "life-of-sounds/GET/get_user.h"
#include "life-of-sounds/GET/login.h"



void process_route(struct Socket *socket,char* http_header, char* body){
	SSL *cSSL =  socket->cSSL;
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

	if (strcmp(request_type, "GET")==0 && strcmp(route, "/") == 0){
		get_live_html(cSSL, http_header, "portfolio/home.html");
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/favicon.ico")!=NULL){
		get_image_file(cSSL, http_header, "/portfolio/images/favicon.ico");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/definitions.js")==0){
		get_gol_script(cSSL, http_header, "/chicago-transits/definitions.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/sounds/graphs.js")==0){
		get_gol_script(cSSL, http_header, "/sounds/graphs.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/graphs.js")==0){
		get_gol_script(cSSL, http_header, "/chicago-transits/graphs.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/map.js")==0){
		get_gol_script(cSSL, http_header, "/chicago-transits/map.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/form.js")==0){
		get_gol_script(cSSL, http_header, "/portfolio/form.js");
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/portfolio/images/")!=NULL){
		if (strcmp(route,"/portfolio/images/scatteredteam.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/scatteredteam.png");
		}
		if (strcmp(route,"/portfolio/images/lifeofsounds.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/lifeofsounds.png");
		}
				if (strcmp(route,"/portfolio/images/livetransits.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/livetransits.png");
		}
		if (strcmp(route,"/portfolio/images/nonprofit.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/nonprofit.png");
		}
		if (strcmp(route,"/portfolio/images/ETL.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/ETL.png");
		}

				if (strcmp(route,"/portfolio/images/auto.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/auto.png");
		}
		if (strcmp(route,"/portfolio/images/team.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/team.png");
		}
				if (strcmp(route,"/portfolio/images/main.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/main.png");
		}
		if (strcmp(route,"/portfolio/images/synapse.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/synapse.png");
		}
		if (strcmp(route,"/portfolio/images/databricks.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/databricks.png");
		}
		if (strcmp(route,"/portfolio/images/gcs.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/gcs.png");
		}
		if (strcmp(route,"/portfolio/images/gol.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/gol.png");
		}
		if (strcmp(route,"/portfolio/images/scrum.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/scrum.png");
		}
		if (strcmp(route,"/portfolio/images/aws.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/aws.png");
		}
		if (strcmp(route,"/portfolio/images/fabric.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/fabric.png");
		}
		if (strcmp(route,"/portfolio/images/cosmos.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/cosmos.png");
		}
		if (strcmp(route,"/portfolio/images/adf.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/adf.png");
		}
		if (strcmp(route,"/portfolio/images/sales.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/sales.png");
		}
		if (strcmp(route,"/portfolio/images/utilization.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/utilization.png");
		}
		if (strcmp(route,"/portfolio/images/salesdash.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/salesdash.png");
		}
		if (strcmp(route,"/portfolio/images/surveys.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/surveys.png");
		}
		if (strcmp(route,"/portfolio/images/internal.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/internal.png");
		}
		if (strcmp(route,"/portfolio/images/helpdesk.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/helpdesk.png");
		}
		if (strcmp(route,"/portfolio/images/finance.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/finance.png");
		}
		if (strcmp(route,"/portfolio/images/marketing.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/marketing.png");
		}
		if (strcmp(route,"/portfolio/images/green.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/green.png");
		}
		if (strcmp(route,"/portfolio/images/dynamics365.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/dynamics365.png");
		}
		if (strcmp(route,"/portfolio/images/hubspot.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/hubspot.png");
		}
		if (strcmp(route,"/portfolio/images/salesloft.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/salesloft.png");
		}
		if (strcmp(route,"/portfolio/images/snowflake.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/snowflake.png");
		}
		if (strcmp(route,"/portfolio/images/sharepoint.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/sharepoint.png");
		}
		if (strcmp(route,"/portfolio/images/graphapi.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/graphapi.png");
		}	
		if (strcmp(route,"/portfolio/images/msft.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/msft.png");
		}
		if (strcmp(route,"/portfolio/images/blue.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/blue.png");
		}
		if (strcmp(route,"/portfolio/images/profile.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/profile.png");
		}
		if (strcmp(route,"/portfolio/images/dialpad.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/dialpad.png");
		}
		if (strcmp(route,"/portfolio/images/halopsa.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/halopsa.png");
		}
		if (strcmp(route,"/portfolio/images/surveymonkey.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/surveymonkey.png");
		}
		if (strcmp(route,"/portfolio/images/airtable.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/airtable.png");
		}
		if (strcmp(route,"/portfolio/images/ceojuice.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/ceojuice.png");
		}
		if (strcmp(route,"/portfolio/images/PowerBIlogo.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/PowerBIlogo.png");
		}
		if (strcmp(route,"/portfolio/images/Tableau.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/Tableau.png");
		}
		if (strcmp(route,"/portfolio/images/sql.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/sql.png");
		}
		if (strcmp(route,"/portfolio/images/raw_data.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/raw_data.png");
		}
		if (strcmp(route,"/portfolio/images/clean_data.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/clean_data.png");
		}
		if (strcmp(route,"/portfolio/images/bronze.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/bronze.png");
		}
		if (strcmp(route,"/portfolio/images/silver.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/silver.png");
		}
		if (strcmp(route,"/portfolio/images/gold.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/gold.png");
		}
		if (strcmp(route,"/portfolio/images/azure.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/azure.png");
		}
		if (strcmp(route,"/portfolio/images/excel.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/excel.png");
		}
		if (strcmp(route,"/portfolio/images/ga.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/ga.png");
		}
		if (strcmp(route,"/portfolio/images/ai.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/ai.png");
		}
		if (strcmp(route,"/portfolio/images/spark.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/spark.png");
		}
		if (strcmp(route,"/portfolio/images/BlackETL.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/BlackETL.png");
		}
		if (strcmp(route,"/portfolio/images/WhiteETL.png") ==0){
				get_image_file(cSSL, http_header, "/portfolio/images/WhiteETL.png");
		}
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/blob-storage/")!=NULL){
		get_blob_storage_files(socket,http_header,body, route);

	}else if (strcmp(request_type, "POST")==0 && strstr(route, "/blob-storage/")!=NULL){
		post_blob(socket,http_header,body, route);

	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/game-of-life/session/join?Id=") != NULL){
		char* sessionId = get_query_parameter(route, "Id");
		if (websocket_session_exists(sessionId)){
			get_live_html(cSSL, http_header, "/game-of-life/home.html");
		}
	

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/connect")==0){
		start_websocket_session(socket,http_header,body, route);

	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/etl/images/")!=NULL){
			if (strcmp(route,"/etl/images/drag.png") ==0){
				get_image_file(cSSL, http_header, "/etl/images/drag.png");
		}
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/neat")==0){
		get_live_html(cSSL, http_header, "/NEAT/simulation_home.html");

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/neat/simulation.js")==0){
		get_gol_script(cSSL, http_header, "/NEAT/simulation.js");
	  
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/neat/initialize")==0){
		post_to_local(socket,http_header,body, route);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/rtneat/initialize")==0){
		post_to_local(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl")==0){
		get_live_html(cSSL, http_header, "/etl/home.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/activities.js")==0){
		get_gol_script(cSSL, http_header, "/etl/activities.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/import.js")==0){
		get_gol_script(cSSL, http_header, "/etl/import.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/filter.js")==0){
		get_gol_script(cSSL, http_header, "/etl/filter.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/run.js")==0){
		get_gol_script(cSSL, http_header, "/etl/run.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/select.js")==0){
		get_gol_script(cSSL, http_header, "/etl/select.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/sort.js")==0){
		get_gol_script(cSSL, http_header, "/etl/sort.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/home-ui.js")==0){
		get_gol_script(cSSL, http_header, "/etl/home-ui.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/home.css")==0){
		get_gol_script(cSSL, http_header, "/etl/home.css");

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/join.js")==0){
		get_gol_script(cSSL, http_header, "/etl/join.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/custom_column.js")==0){
		get_gol_script(cSSL, http_header, "/etl/custom_column.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/replace.js")==0){
		get_gol_script(cSSL, http_header, "/etl/replace.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/fill.js")==0){
		get_gol_script(cSSL, http_header, "/etl/fill.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/clean.js")==0){
		get_gol_script(cSSL, http_header, "/etl/clean.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/dedupe.js")==0){
		get_gol_script(cSSL, http_header, "/etl/dedupe.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/cast.js")==0){
		get_gol_script(cSSL, http_header, "/etl/cast.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/regex.js")==0){
		get_gol_script(cSSL, http_header, "/etl/regex.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/pivot.js")==0){
		get_gol_script(cSSL, http_header, "/etl/pivot.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/window.js")==0){
		get_gol_script(cSSL, http_header, "/etl/window.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/group.js")==0){
		get_gol_script(cSSL, http_header, "/etl/group.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/split.js")==0){
		get_gol_script(cSSL, http_header, "/etl/split.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/combine.js")==0){
		get_gol_script(cSSL, http_header, "/etl/combine.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/append.js")==0){
		get_gol_script(cSSL, http_header, "/etl/append.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/google_sheets.js")==0){
		get_gol_script(cSSL, http_header, "/etl/google_sheets.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/jquery.flowchart.js")==0){
		get_gol_script(cSSL, http_header, "/etl/jquery.flowchart.js");

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/etl/jquery.flowchart.css")==0){
		get_gol_script(cSSL, http_header, "/etl/jquery.flowchart.css");
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/etl/pipeline/order")==0){
		post_run_activity(socket,http_header,body, route);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/etl/run/")==0){
		post_run_activity(socket,http_header,body, route);

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/phrase-matching")==0){
		get_live_html(cSSL, http_header, "/phrase-matching/home.html");
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/phrase-matching/generate")==0){
		post_generate_phrase(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/game-of-life")==0){
		get_live_html(cSSL, http_header, "/game-of-life/home.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/onload_session.js")==0){
		get_gol_script(cSSL, http_header, "/game-of-life/onload_session.js");
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/game-of-life/user")==0){
		post_user(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/game-of-life/user")==0){
		get_user(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/game-of-life/session?") != NULL){
		get_websocket_protocol(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/game_of_life.js")==0){
		get_gol_script(cSSL, http_header, "/game-of-life/game_of_life.js");
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/game-of-life/session")==0){
			post_websocket_session(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/game_of_life/websocket.js")==0){
		get_gol_script(cSSL, http_header, "/game-of-life/websocket.js");	
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/game_of_life/data_staging.js")==0){
		get_gol_script(cSSL, http_header, "/game-of-life/data_staging.js");
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/game-of-life/session/messages")!=NULL){
		get_session_messages(socket, http_header, body, route);

	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/game-of-life/client")!=NULL){
		 get_websocket_client(socket,http_header,body, route);
	}else if (strcmp(request_type, "DELETE")==0 && strstr(route, "/game-of-life/session?Id=") != NULL){
		delete_websocket_session(socket,http_header,body, route);

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds")==0){
		get_live_html(cSSL, http_header, "/sounds/home.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/chicago-transits")==0){
		get_live_html(cSSL, http_header, "/chicago-transits/home.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/create_table.js")==0){
		get_gol_script(cSSL, http_header, "/create_table.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/chicago-transits/onload_session.js")==0){
		get_gol_script(cSSL, http_header, "/chicago-transits/onload_session.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/audio.js")==0){
		get_gol_script(cSSL, http_header, "/sounds/audio.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/chatbox.js")==0){
		get_gol_script(cSSL, http_header, "game-of-life/chatbox.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/websocket.js")==0){
		get_gol_script(cSSL, http_header, "websocket.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/chatbox_style.css")==0){
		get_gol_script(cSSL, http_header, "game-of-life/chatbox_style.css");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/default_body_style.css")==0){
		get_gol_script(cSSL, http_header, "default_body_style.css");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/canvas_style.css")==0){
		get_gol_script(cSSL, http_header, "game-of-life/canvas_style.css");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/websocket_session")==0){
		start_websocket_session(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/chatbox_style.css")==0){
		get_gol_script(cSSL, http_header, "chatbox_style.css");
	}else{
		send_response_code(cSSL, 404);
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
	/*
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/game_of_life/")==0){
		get_live_html(cSSL, http_header, "live_studio.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/game_of_life.js")==0){
		get_gol_script(cSSL, http_header, "game_of_life.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/onload_session.js")==0){
		get_gol_script(cSSL, http_header, "onload_session.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/websocket.js")==0){
		get_gol_script(cSSL, http_header, "websocket.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/canvas_style.css")==0){
		get_gol_script(cSSL, http_header, "canvas_style.css");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/chatbox.js")==0){
		get_gol_script(cSSL, http_header, "chatbox.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/chatbox_style.css")==0){
		get_gol_script(cSSL, http_header, "chatbox_style.css");

	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/game_of_life/session/join?Id=") != NULL){
		char* sessionId = get_query_parameter(route, "Id");
		if (websocket_session_exists(sessionId)){
			get_live_html(cSSL, http_header, "live_studio.html");
		}
	}else if (strcmp(request_type, "DELETE")==0 && strstr(route, "/life-of-sounds/session?Id=") != NULL){
		delete_websocket_session(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/session?") != NULL){
		get_websocket_protocol(socket,http_header,body, route);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/session")==0){
		post_websocket_session(socket,http_header,body, route);

	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/live_studio/session/messages")!=NULL){
		get_session_messages(socket, http_header, body, route);

	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/client")!=NULL){
		 get_websocket_client(socket,http_header,body, route);

	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/user")==0){
		post_user(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/user")==0){
		get_user(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/handle_messages.js")==0){
		get_gol_script(cSSL, http_header, "handle_messages.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/onload_session.js")==0){
		get_gol_script(cSSL, http_header, "onload_session.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/chatbox.js")==0){
		get_gol_script(cSSL, http_header, "chatbox.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/websocket.js")==0){
		get_gol_script(cSSL, http_header, "websocket.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/game_of_life.js")==0){
		get_gol_script(cSSL, http_header, "game_of_life.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/web_audio_api.js")==0){
		get_web_audio_script(cSSL, http_header, "web_audio_api.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/html_utilities.js")==0){
		get_utilities_script(cSSL, http_header, "html_utilities.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/live_studio/user")==0){
		get_user(socket,http_header,body, route);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/login")==0){
		login(cSSL, http_header, body);
	}else if (strcmp(request_type, "PATCH")==0 && strstr(route, "/life-of-sounds/live_studio/session")!=NULL){
		patch_websocket_session(socket,http_header,body, route);
	}else if (strcmp(request_type, "PATCH")==0 && strstr(route, "/life-of-sounds/live_studio/client_session")!=NULL){
		patch_browser_session(socket,http_header,body, route);
	}else if (strcmp(request_type, "PATCH")==0 && strstr(route, "/life-of-sounds/live_studio/client")!=NULL){
		patch_websocket_client(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/live_studio/client")!=NULL){
		 get_websocket_client(socket,http_header,body, route);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/live_studio/client_session")==0){
		post_browser_session(socket, http_header, body, route);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/live_studio/client")==0){
		post_websocket_client(socket,http_header,body, route,1);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/live_studio/session/messages")!=NULL){
		get_session_messages(socket, http_header, body, route);
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/live_studio/session")==0){
		post_websocket_session(socket,http_header,body, route);
	}else if (strcmp(request_type, "DELETE")==0 && strstr(route, "/life-of-sounds/live_studio/session?Id=") != NULL){
		delete_websocket_session(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/live_studio/session?") != NULL){
		get_websocket_protocol(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strstr(route, "/life-of-sounds/live_studio/session/join?Id=") != NULL){
		char* sessionId = get_query_parameter(route, "Id");
		if (websocket_session_exists(sessionId)){
			get_live_html(cSSL, http_header, "live_studio.html");
		}

	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/chicago-transits/home")==0){
		get_live_html(cSSL, http_header, "/chicago-transits/home.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/chicago-transits/websocket.js")==0){
		get_gol_script(cSSL, http_header, "/chicago-transits/websocket.js");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/chicago-transits/onload_session.js")==0){
		get_gol_script(cSSL, http_header, "/chicago-transits/onload_session.js");
	*/
	/*
	else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/login")==0){
		get_login_page(cSSL, http_header, "index.html");
	}else if (strcmp(request_type, "POST")==0 && strcmp(route, "/life-of-sounds/live_studio/user")==0){
		post_user(socket,http_header,body, route);
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/home")==0){
		get_live_html(cSSL, http_header, "home.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/live_studio")==0){
		get_live_html(cSSL, http_header, "live_studio.html");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/canvas_style.css")==0){
		get_gol_script(cSSL, http_header, "canvas_style.css");
	}else if (strcmp(request_type, "GET")==0 && strcmp(route, "/life-of-sounds/chatbox_style.css")==0){
		get_gol_script(cSSL, http_header, "chatbox_style.css");
	*/
