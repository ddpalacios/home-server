#include <stdio.h>
#include <openssl/ssl.h>
#include <string.h>
#include <stdlib.h>
#include <cjson/cJSON.h>
#include "Socket.h"
#include "route.h"
#include "http_utilities.h"
#include "blob-storage/GET/get_blob_storage_files.h"
#include "blob-storage/POST/post_blob.h"
#include "local-server/POST/post_local_server.h"

void process_route(struct Socket *socket, char* http_header, char* body){
	SSL *cSSL = socket->cSSL;
	if (!http_header) {
		return;
	}
	char* route_start = strchr(http_header, ' ');
	if (!route_start) {
		return;
	}
	route_start++;
	char* route_end = strchr(route_start, ' ');
	if (!route_end) {
		return;
	}
	size_t route_len = route_end - route_start;
	if (route_len == 0 || route_len > 8192) {
		return;
	}
	char* route = malloc(route_len + 1);
	strncpy(route, route_start, route_len);
	route[route_len] = '\0';
	char* request_type_end = strchr(http_header, ' ');
	if (!request_type_end) {
		free(route);
		return;
	}
	size_t request_type_len = request_type_end - http_header;
	if (request_type_len == 0 || request_type_len > 16) {
		free(route);
		return;
	}
	char* request_type = malloc(request_type_len + 1);
	strncpy(request_type, http_header, request_type_len);
	request_type[request_type_len] = '\0';
	printf("Route: '%s %s'\n", request_type, route);

	/* Blob storage — generic file CRUD. */
	if (strcmp(request_type, "GET") == 0 && strstr(route, "/blob-storage/") != NULL) {
		get_blob_storage_files(socket, http_header, body, route);

	} else if (strcmp(request_type, "POST") == 0 && strstr(route, "/blob-storage/") != NULL) {
		post_blob(socket, http_header, body, route);

	/* ETL home page + static assets. */
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl") == 0) {
		get_live_html(cSSL, http_header, "/etl/home.html");
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/images/") != NULL) {
		if (strcmp(route, "/etl/images/drag.png") == 0) {
			get_image_file(cSSL, http_header, "/etl/images/drag.png");
		}
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/activities.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/activities.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/import.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/import.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/filter.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/filter.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/run.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/run.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/select.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/select.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/sort.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/sort.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/stream.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/stream.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/home-ui.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/home-ui.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/etl-design-system.css") == 0) {
		get_gol_script(cSSL, http_header, "/etl/etl-design-system.css");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/home.css") == 0) {
		get_gol_script(cSSL, http_header, "/etl/home.css");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/join.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/join.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/custom_column.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/custom_column.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/replace.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/replace.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/fill.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/fill.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/clean.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/clean.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/dedupe.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/dedupe.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/cast.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/cast.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/regex.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/regex.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/pivot.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/pivot.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/window.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/window.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/flatten.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/flatten.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/group.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/group.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/split.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/split.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/combine.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/combine.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/append.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/append.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/google_sheets.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/google_sheets.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/dataflow.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/dataflow.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/pipeline.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/pipeline.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/notebook_activity.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/notebook_activity.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/sql_activity.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/sql_activity.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/http_request.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/http_request.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/jquery.flowchart.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/jquery.flowchart.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/jquery.flowchart.css") == 0) {
		get_gol_script(cSSL, http_header, "/etl/jquery.flowchart.css");

	/* ETL pipeline / dataflow execution. */
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/pipeline/order") == 0) {
		post_run_activity(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/run/") == 0) {
		post_run_activity(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/call") == 0) {
		post_run_activity(socket, http_header, body, route);

	/* ETL Spark client + notebook + trigger backend (proxied to local Python). */
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/sparkclient/stream") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/sparkclient/stream/execute") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/sparkclient/stream/start") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/sparkclient/stream/restart") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/sparkclient/process") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/sparkclient/stream/execute/result") != NULL) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/google/login") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/trigger/cron") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/trigger/cron/delete") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/trigger/runs") != NULL) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/pipeline/runs") != NULL) {
		get_from_local(socket, http_header, body, route);
	/* ETL parallel-pipeline executor routes (slices 3, 3b, 4):
	 * - SSE event stream per run (per-activity status, completion).
	 * - Per-run history detail.
	 * - Cancel whole run / single in-flight activity. */
	} else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/etl/pipeline/events/", 21) == 0) {
		proxy_sse_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/etl/pipeline/run?", 18) == 0) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/pipeline/cancel") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/pipeline/cancel_activity") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/google/status") == 0) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/google/callback") != NULL) {
		get_from_local(socket, http_header, body, route);

	/* ETL notebook routes. */
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/notebook.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/notebook.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/notebook.css") == 0) {
		get_gol_script(cSSL, http_header, "/etl/notebook.css");

	/* ETL shared path picker (used by activity settings panels). */
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/path_picker.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/path_picker.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/blob_storage_activity.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/blob_storage_activity.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/blob_storage_preview.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/blob_storage_preview.js");

	/* ETL SQL activity static assets + backend proxy. */
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/sql_persistence.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/sql_persistence.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/sql_ui.js") == 0) {
		get_gol_script(cSSL, http_header, "/etl/sql_ui.js");
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/sql.css") == 0) {
		get_gol_script(cSSL, http_header, "/etl/sql.css");
	/* ETL Blob Storage Data Preview. Shares Spark resources with /etl/sql. */
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/preview") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/preview/cancel") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/sql/execute") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/sql/cancel") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/etl/sql/tables", 15) == 0) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/notebook/execute") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/notebook/lint") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/notebook/cancel") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/notebook/restart") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/notebook/save") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/notebook/delete") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/notebook/load") != NULL) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/notebook/list") == 0) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/notebook/variables") != NULL) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/notebook/export") != NULL) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/notebook/dataframe/csv") != NULL) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strstr(route, "/etl/notebook/spark/status") != NULL) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/notebook/submit") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/etl/notebook/events/", 21) == 0) {
		proxy_sse_to_local(socket, http_header, body, route);

	/* ETL Spark config / status. */
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/spark/configs") == 0) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/spark/configs") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "DELETE") == 0 && strncmp(route, "/etl/spark/configs/", 19) == 0) {
		delete_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/etl/spark/activate") == 0) {
		post_to_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/etl/spark/status") == 0) {
		get_from_local(socket, http_header, body, route);
	} else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/etl/spark/logs", 15) == 0) {
		get_from_local(socket, http_header, body, route);

	} else {
		send_response_code(cSSL, 404);
	}

	if (route != NULL) {
		free(route);
		route = NULL;
	}
	if (request_type != NULL) {
		free(request_type);
		request_type = NULL;
	}
}
