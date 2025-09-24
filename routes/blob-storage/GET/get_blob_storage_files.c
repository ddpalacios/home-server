#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"
#include "Socket.h"

void get_blob_storage_files(struct Socket* socket,char* http_header, char*body, char* route){
    SSL* cSSL = socket->cSSL;
    
    if (strstr(route, "blob-storage/bronze/")){
      if (strstr(route, "CTA/")){
          if (strstr(route, "/api.transitchicago/")){
            if (strstr(route, "/tlines")){
                char* result = get_file_buffer("../blob-storage/bronze_CTA_api.transitchicago_tlines.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
          }
          else if (strstr(route, "/ctabustracker/")){
            if (strstr(route, "/getroutes")){
                char* result = get_file_buffer("../blob-storage/bronze_CTA_ctabustracker_getroutes.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
            else if (strstr(route, "/predictions")){
		char* rt = get_query_parameter(route, "rt");
		char* stpid = get_query_parameter(route, "stpid");
		char* rtdir = get_query_parameter(route, "rtdir");
		if (rt != NULL ){
			char path[2048];
			snprintf(path, sizeof(path),"../blob-storage/bronze_CTA_ctabustracker_%s_predictions.json", rt);
			char* result = get_file_buffer(path);
			if (result == NULL){
				send_response_code(cSSL, 404);
			}else{
				cJSON* target_json = cJSON_Parse(result);
				cJSON *target_values = cJSON_GetObjectItem(target_json, "values");
				cJSON* new_result_root = create_json_object();
				cJSON* values = cJSON_AddArrayToObject(new_result_root, "values");
				int array_size = cJSON_GetArraySize(target_values);
				for (int i = 0; i < array_size; i++) {
					cJSON *subitem = cJSON_GetArrayItem(target_values, i);
					cJSON* t_rt  = cJSON_GetObjectItem(subitem, "rt");
					cJSON* t_stpid  = cJSON_GetObjectItem(subitem, "stpid");
					cJSON* t_rtdir  = cJSON_GetObjectItem(subitem, "rtdir");
					if (strcmp(t_rt->valuestring , rt)==0 ){
						if (stpid != NULL){
							if (rtdir != NULL){
								if (strcmp(t_rtdir->valuestring , rtdir) ==0 && strcmp(t_stpid->valuestring , stpid) ==0){
									 cJSON *copy = cJSON_Duplicate(subitem, 1); 
									 cJSON_AddItemToArray(values, copy);
								}
							}else{
								if (strcmp(t_stpid->valuestring , stpid) ==0){
									 cJSON *copy = cJSON_Duplicate(subitem, 1); 
									 cJSON_AddItemToArray(values, copy);
								}
							}
						}else{
							 cJSON *copy = cJSON_Duplicate(subitem, 1); 
							 cJSON_AddItemToArray(values, copy);
						}
						
					}
				}
				char *json_string = cJSON_Print(new_result_root);
				send_JSON_response_code(cSSL, 200, json_string);
				cJSON_Delete(target_json);
				cJSON_Delete(new_result_root);
				free(result);
			}
		}else{
			send_response_code(cSSL, 404);
		}
            }
            else if (strstr(route, "/getpatterns")){
                char* result = get_file_buffer("../blob-storage/bronze_CTA_ctabustracker_getpatterns.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
          }
        }
      else if (strstr(route, "DataLake/")){
          if (strstr(route, "/Definitions/")){
            if (strstr(route, "/tableDefinition")){
                char* result = get_file_buffer("../blob-storage/bronze_DataLake_Definitions_tableDefinition.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
          }
      }
  }
    else if (strstr(route, "blob-storage/silver/")){
      if (strstr(route, "CTA/")){
           if (strstr(route, "/ctabustracker/")){
            if (strcmp(route, "/blob-storage/silver/CTA/ctabustracker/getroutes") == 0){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_CTA_BusRoute.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
            else if (strstr(route, "/getroutestops")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_CTA_BusStop.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
            else if (strstr(route, "/getroutenames")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_CTA_BusRouteName.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
            else if (strstr(route, "/getpatterns")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_CTA_BusPattern.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
            else if (strstr(route, "/getpatternroutes")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_CTA_BusPatternRoute.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
            }
          }
        }
  }
}
