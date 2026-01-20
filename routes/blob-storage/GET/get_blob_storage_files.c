#include <openssl/ssl.h>
#include "json_utilities.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "http_utilities.h"
#include "session.h"
#include "User.h"
#include "Socket.h"
#include <dirent.h>
#include <sys/stat.h>

static int ends_with(const char *value, const char *suffix) {
  size_t value_len = strlen(value);
  size_t suffix_len = strlen(suffix);
  if (value_len < suffix_len) {
    return 0;
  }
  return strcmp(value + value_len - suffix_len, suffix) == 0;
}

static int csv_push_field(char ***fields, size_t *count, size_t *cap, const char *value) {
  if (*count >= *cap) {
    size_t next_cap = (*cap == 0) ? 8 : (*cap * 2);
    char **next = realloc(*fields, next_cap * sizeof(char *));
    if (!next) {
      return -1;
    }
    *fields = next;
    *cap = next_cap;
  }
  (*fields)[*count] = strdup(value ? value : "");
  if (!(*fields)[*count]) {
    return -1;
  }
  (*count)++;
  return 0;
}

static void csv_free_fields(char **fields, size_t count) {
  if (!fields) {
    return;
  }
  for (size_t i = 0; i < count; i++) {
    free(fields[i]);
  }
  free(fields);
}

static int csv_commit_row(cJSON *values, char **headers, size_t header_count, char **fields, size_t field_count) {
  if (!values || !headers || header_count == 0) {
    return -1;
  }
  cJSON *row = cJSON_CreateObject();
  for (size_t i = 0; i < header_count; i++) {
    const char *header = headers[i] ? headers[i] : "";
    const char *value = (i < field_count && fields[i]) ? fields[i] : "";
    cJSON_AddStringToObject(row, header, value);
  }
  cJSON_AddItemToArray(values, row);
  return 0;
}

static char *csv_to_json_string(const char *csv_text) {
  if (!csv_text) {
    return NULL;
  }
  cJSON *root = create_json_object();
  cJSON_AddStringToObject(root, "filetype", "csv");
  cJSON *values = cJSON_AddArrayToObject(root, "values");

  char **headers = NULL;
  size_t header_count = 0;
  int has_headers = 0;

  char **fields = NULL;
  size_t field_count = 0;
  size_t field_cap = 0;

  size_t buf_cap = 128;
  size_t buf_len = 0;
  char *buffer = malloc(buf_cap);
  int in_quotes = 0;
  if (!buffer) {
    cJSON_Delete(root);
    return NULL;
  }

  const char *p = csv_text;
  while (p && *p) {
    char c = *p;
    if (in_quotes) {
      if (c == '"') {
        if (*(p + 1) == '"') {
          if (buf_len + 1 >= buf_cap) {
            buf_cap *= 2;
            char *next = realloc(buffer, buf_cap);
            if (!next) {
              break;
            }
            buffer = next;
          }
          buffer[buf_len++] = '"';
          p += 2;
          continue;
        }
        in_quotes = 0;
        p++;
        continue;
      }
      if (buf_len + 1 >= buf_cap) {
        buf_cap *= 2;
        char *next = realloc(buffer, buf_cap);
        if (!next) {
          break;
        }
        buffer = next;
      }
      buffer[buf_len++] = c;
      p++;
      continue;
    }
    if (c == '"') {
      in_quotes = 1;
      p++;
      continue;
    }
    if (c == ',' || c == '\n' || c == '\r' || c == '\0') {
      buffer[buf_len] = '\0';
      if (csv_push_field(&fields, &field_count, &field_cap, buffer) != 0) {
        break;
      }
      buf_len = 0;
      if (c == '\r' && *(p + 1) == '\n') {
        p++;
      }
      if (c == '\n' || c == '\r' || c == '\0') {
        if (!has_headers) {
          headers = fields;
          header_count = field_count;
          fields = NULL;
          field_count = 0;
          field_cap = 0;
          has_headers = 1;
        } else if (field_count > 0 || (header_count == 1 && (fields && fields[0] && fields[0][0] != '\0'))) {
          csv_commit_row(values, headers, header_count, fields, field_count);
          csv_free_fields(fields, field_count);
          fields = NULL;
          field_count = 0;
          field_cap = 0;
        } else {
          csv_free_fields(fields, field_count);
          fields = NULL;
          field_count = 0;
          field_cap = 0;
        }
      }
      if (c == '\0') {
        break;
      }
      p++;
      continue;
    }
    if (buf_len + 1 >= buf_cap) {
      buf_cap *= 2;
      char *next = realloc(buffer, buf_cap);
      if (!next) {
        break;
      }
      buffer = next;
    }
    buffer[buf_len++] = c;
    p++;
  }
  if (buf_len > 0 || (p && *p == '\0')) {
    buffer[buf_len] = '\0';
    csv_push_field(&fields, &field_count, &field_cap, buffer);
  }
  if (!has_headers && fields) {
    headers = fields;
    header_count = field_count;
          fields = NULL;
    field_count = 0;
    field_cap = 0;
    has_headers = 1;
  } else if (has_headers && fields && field_count > 0) {
    csv_commit_row(values, headers, header_count, fields, field_count);
    csv_free_fields(fields, field_count);
    fields = NULL;
    field_count = 0;
    field_cap = 0;
  }

  free(buffer);
  csv_free_fields(fields, field_count);
  csv_free_fields(headers, header_count);

  char *json_string = cJSON_Print(root);
  cJSON_Delete(root);
  return json_string;
}

void get_blob_storage_files(struct Socket* socket,char* http_header, char*body, char* route){
    SSL* cSSL = socket->cSSL;
    if (strstr(route, "/blob-storage/etl/pipeline/load") != NULL){
      char* pipelineId = get_query_parameter(route, "pipelineId");
      if (pipelineId == NULL){
        send_response_code(cSSL, 400);
        return;
      }
      char path[2048];
      snprintf(path, sizeof(path), "../blob-storage/raw/etl/pipeline/%s.json", pipelineId);
      char* result = get_file_buffer(path);
      if (result == NULL){
        send_response_code(cSSL, 404);
        return;
      }
      send_JSON_response_code(cSSL, 200, result);
      free(result);
      return;
    }
    if (strstr(route, "/blob-storage/etl/trigger/load") != NULL){
      char* triggerId = get_query_parameter(route, "triggerId");
      if (triggerId == NULL){
        send_response_code(cSSL, 400);
        return;
      }
      char path[2048];
      snprintf(path, sizeof(path), "../blob-storage/raw/etl/trigger/%s.json", triggerId);
      char* result = get_file_buffer(path);
      if (result == NULL){
        send_response_code(cSSL, 404);
        return;
      }
      send_JSON_response_code(cSSL, 200, result);
      free(result);
      return;
    }
    if (strstr(route, "/blob-storage/etl/pipeline/list") != NULL){
      char* googleId = get_query_parameter(route, "googleId");
      if (googleId == NULL){
        send_response_code(cSSL, 400);
        return;
      }
      const char *home = getenv("HOME");
      if (!home || !home[0]){
        send_response_code(cSSL, 500);
        return;
      }
      char pipeline_dir[2048];
      snprintf(pipeline_dir, sizeof(pipeline_dir), "%s/home-server/blob-storage/raw/etl/pipeline", home);
      DIR *dir = opendir(pipeline_dir);
      if (dir == NULL){
        send_response_code(cSSL, 500);
        return;
      }
      cJSON* root = create_json_object();
      cJSON* values = cJSON_AddArrayToObject(root, "values");
      struct dirent *entry;
      while ((entry = readdir(dir)) != NULL){
        if (entry->d_type != DT_REG){
          continue;
        }
        if (!strstr(entry->d_name, ".json")){
          continue;
        }
        if (strncmp(entry->d_name, "triggers_", 9) == 0){
          continue;
        }
        char path[2048];
        snprintf(path, sizeof(path), "%s/home-server/blob-storage/raw/etl/pipeline/%s", home, entry->d_name);
        char* content = get_file_buffer(path);
        if (content == NULL){
          continue;
        }
        cJSON* parsed = cJSON_Parse(content);
        free(content);
        if (parsed == NULL){
          continue;
        }
        cJSON* stored_google = cJSON_GetObjectItem(parsed, "google_id");
        if (!cJSON_IsString(stored_google) || strcmp(stored_google->valuestring, googleId) != 0){
          cJSON_Delete(parsed);
          continue;
        }
        cJSON* item = cJSON_CreateObject();
        char pipeline_id[256];
        snprintf(pipeline_id, sizeof(pipeline_id), "%s", entry->d_name);
        char* dot = strstr(pipeline_id, ".json");
        if (dot){
          *dot = '\0';
        }
        cJSON_AddStringToObject(item, "pipeline_id", pipeline_id);
        cJSON* pipeline_name = cJSON_GetObjectItem(parsed, "pipeline_name");
        if (cJSON_IsString(pipeline_name)) {
          cJSON_AddStringToObject(item, "pipeline_name", pipeline_name->valuestring);
        } else {
          cJSON_AddStringToObject(item, "pipeline_name", "Untitled Pipeline");
        }
        cJSON* description = cJSON_GetObjectItem(parsed, "description");
        if (cJSON_IsString(description)) {
          cJSON_AddStringToObject(item, "description", description->valuestring);
        } else {
          cJSON_AddStringToObject(item, "description", "");
        }
        cJSON* stored_pipeline = cJSON_GetObjectItem(parsed, "pipeline_id");
        if (cJSON_IsString(stored_pipeline)) {
          cJSON_AddStringToObject(item, "pipeline_id", stored_pipeline->valuestring);
        } else {
          cJSON_AddStringToObject(item, "pipeline_id", "");
        }
        cJSON_AddItemToArray(values, item);
        cJSON_Delete(parsed);
      }
      closedir(dir);
      char* json_string = cJSON_Print(root);
      send_JSON_response_code(cSSL, 200, json_string);
      free(json_string);
      cJSON_Delete(root);
      return;
    }
    if (strstr(route, "/blob-storage/etl/trigger/list") != NULL){
      char* googleId = get_query_parameter(route, "googleId");
      if (googleId == NULL){
        send_response_code(cSSL, 400);
        return;
      }
      const char *home = getenv("HOME");
      if (!home || !home[0]){
        send_response_code(cSSL, 500);
        return;
      }
      char trigger_dir[2048];
      snprintf(trigger_dir, sizeof(trigger_dir), "%s/home-server/blob-storage/raw/etl/trigger", home);
      DIR *dir = opendir(trigger_dir);
      if (dir == NULL){
        send_response_code(cSSL, 500);
        return;
      }
      cJSON* root = create_json_object();
      cJSON* values = cJSON_AddArrayToObject(root, "values");
      struct dirent *entry;
      while ((entry = readdir(dir)) != NULL){
        if (entry->d_type != DT_REG){
          continue;
        }
        if (!strstr(entry->d_name, ".json")){
          continue;
        }
        if (strncmp(entry->d_name, "triggers_", 9) != 0){
          continue;
        }
        char path[2048];
        snprintf(path, sizeof(path), "%s/home-server/blob-storage/raw/etl/trigger/%s", home, entry->d_name);
        char* content = get_file_buffer(path);
        if (content == NULL){
          continue;
        }
        cJSON* parsed = cJSON_Parse(content);
        free(content);
        if (parsed == NULL){
          continue;
        }
        cJSON* stored_google = cJSON_GetObjectItem(parsed, "google_id");
        if (!cJSON_IsString(stored_google) || strcmp(stored_google->valuestring, googleId) != 0){
          cJSON_Delete(parsed);
          continue;
        }
        cJSON* item = cJSON_CreateObject();
        char trigger_id[256];
        snprintf(trigger_id, sizeof(trigger_id), "%s", entry->d_name);
        char* dot = strstr(trigger_id, ".json");
        if (dot){
          *dot = '\0';
        }
        cJSON_AddStringToObject(item, "trigger_id", trigger_id);
        cJSON* trigger_name = cJSON_GetObjectItem(parsed, "name");
        if (cJSON_IsString(trigger_name)) {
          cJSON_AddStringToObject(item, "name", trigger_name->valuestring);
        } else {
          cJSON_AddStringToObject(item, "name", "Untitled Trigger");
        }
        cJSON* description = cJSON_GetObjectItem(parsed, "description");
        if (cJSON_IsString(description)) {
          cJSON_AddStringToObject(item, "description", description->valuestring);
        } else {
          cJSON_AddStringToObject(item, "description", "");
        }
        cJSON_AddItemToArray(values, item);
        cJSON_Delete(parsed);
      }
      closedir(dir);
      char* json_string = cJSON_Print(root);
      send_JSON_response_code(cSSL, 200, json_string);
      free(json_string);
      cJSON_Delete(root);
      return;
    }
    if (strstr(route, "/blob-storage/raw/") != NULL || strstr(route, "/blob-storage/processed/") != NULL){
      const char *home = getenv("HOME");
      if (!home || !home[0]){
        send_response_code(cSSL, 500);
        return;
      }
      const char *needle = NULL;
      const char *prefix = NULL;
      if (strstr(route, "/blob-storage/raw/") != NULL) {
        needle = "/blob-storage/raw/";
        prefix = "/home-server/blob-storage/raw/";
      } else {
        needle = "/blob-storage/processed/";
        prefix = "/home-server/blob-storage/processed/";
      }
      char *start = strstr(route, needle);
      if (start == NULL){
        send_response_code(cSSL, 404);
        return;
      }
      start += strlen(needle);
      char rel_path[2048];
      size_t idx = 0;
      while (start[idx] && start[idx] != '?' && idx < sizeof(rel_path) - 1){
        rel_path[idx] = start[idx];
        idx++;
      }
      rel_path[idx] = '\0';
      if (rel_path[0] == '\0' || rel_path[0] == '/' || strstr(rel_path, "..") != NULL || strchr(rel_path, '\\') != NULL){
        send_response_code(cSSL, 400);
        return;
      }
      char full_path[2048];
      size_t needed = strlen(home) + strlen(prefix) + strlen(rel_path) + 1;
      if (needed >= sizeof(full_path)){
        send_response_code(cSSL, 414);
        return;
      }
      snprintf(full_path, sizeof(full_path), "%s%s%s", home, prefix, rel_path);
      struct stat st;
      if (stat(full_path, &st) != 0){
        send_response_code(cSSL, 404);
        return;
      }
      if (S_ISDIR(st.st_mode)){
        DIR *dir = opendir(full_path);
        if (dir == NULL){
          send_response_code(cSSL, 500);
          return;
        }
        cJSON* root = create_json_object();
        cJSON_AddStringToObject(root, "path", rel_path);
        cJSON* entries = cJSON_AddArrayToObject(root, "entries");
        struct dirent *entry;
        while ((entry = readdir(dir)) != NULL){
          if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0){
            continue;
          }
          cJSON* item = cJSON_CreateObject();
          cJSON_AddStringToObject(item, "name", entry->d_name);
          if (entry->d_type == DT_DIR){
            cJSON_AddStringToObject(item, "type", "dir");
          } else {
            cJSON_AddStringToObject(item, "type", "file");
          }
          cJSON_AddItemToArray(entries, item);
        }
        closedir(dir);
        char* json_string = cJSON_Print(root);
        send_JSON_response_code(cSSL, 200, json_string);
        free(json_string);
        cJSON_Delete(root);
        return;
      }
      char* result = get_file_buffer(full_path);
      if (result == NULL){
        send_response_code(cSSL, 404);
        return;
      }
      if (ends_with(rel_path, ".csv")) {
        char *json_string = csv_to_json_string(result);
        free(result);
        if (json_string == NULL) {
          send_response_code(cSSL, 500);
          return;
        }
        send_JSON_response_code(cSSL, 200, json_string);
        free(json_string);
        return;
      }
      send_JSON_response_code(cSSL, 200, result);
      free(result);
      return;
    }
    
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
               else if (strstr(route, "/predictions")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_predictions.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
              }
              else if (strstr(route, "/stop_delays")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_stop_delays.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
              } else if (strstr(route, "/route_delays")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_route_delays.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
              } else if (strstr(route, "/direction_delays")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_direction_delays.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
             }
             else if (strstr(route, "/delays")){
                char* result = get_file_buffer("../blob-storage/silver_CTA_ctabustracker_delays.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);

            }else if (strstr(route, "/getroutestops")){
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
   else if (strstr(route, "blob-storage/gold/")){
      if (strstr(route, "CTA/")){
           if (strstr(route, "/ctabustracker/")){
              if (strstr(route, "/delays")){
                char* result = get_file_buffer("../blob-storage/gold_CTA_ctabustracker_delays.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
              }
              else if (strstr(route, "/direction_delays")){
                char* result = get_file_buffer("../blob-storage/gold_CTA_ctabustracker_direction_delays.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
              }
              else if (strstr(route, "/route_delays")){
                char* result = get_file_buffer("../blob-storage/gold_CTA_ctabustracker_route_delays.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
              }
                else if (strstr(route, "/stop_delays")){
                char* result = get_file_buffer("../blob-storage/gold_CTA_ctabustracker_stop_delays.json");
                send_JSON_response_code(cSSL, 200, result);
                free(result);
              }
           }
          }

   }
}
