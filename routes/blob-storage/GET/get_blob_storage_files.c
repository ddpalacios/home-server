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
            else if (strstr(route, "/getpatterns")){
                char* result = get_file_buffer("../blob-storage/bronze_CTA_ctabustracker_getpatterns.json");
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
