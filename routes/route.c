#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <openssl/ssl.h>
#include <cjson/cJSON.h>
#include "Socket.h"
#include "route.h"
#include "http_utilities.h"
#include "local-server/GET/get_local_server.h"
#include "local-server/POST/post_local_server.h"
#include "blob-storage/POST/post_blob.h"
#include "read_message.h"

static char from_hex(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return 0;
}

static char *url_decode(const char *src) {
    if (!src) return NULL;
    size_t len = strlen(src);
    char *out = malloc(len + 1);
    if (!out) return NULL;
    char *dst = out;
    for (size_t i = 0; i < len; i++) {
        if (src[i] == '%' && i + 2 < len) {
            char hi = from_hex(src[i + 1]);
            char lo = from_hex(src[i + 2]);
            *dst++ = (char)((hi << 4) | lo);
            i += 2;
        } else if (src[i] == '+') {
            *dst++ = ' ';
        } else {
            *dst++ = src[i];
        }
    }
    *dst = '\0';
    return out;
}

static cJSON *parse_form_urlencoded(const char *body) {
    if (!body) return NULL;
    cJSON *root = cJSON_CreateObject();
    const char *cursor = body;
    while (*cursor) {
        const char *amp = strchr(cursor, '&');
        size_t chunk_len = amp ? (size_t)(amp - cursor) : strlen(cursor);
        const char *eq = memchr(cursor, '=', chunk_len);
        size_t key_len = eq ? (size_t)(eq - cursor) : chunk_len;
        size_t val_len = eq ? (size_t)((cursor + chunk_len) - (eq + 1)) : 0;

        char *raw_key = malloc(key_len + 1);
        char *raw_val = malloc(val_len + 1);
        if (!raw_key || !raw_val) {
            free(raw_key);
            free(raw_val);
            break;
        }
        memcpy(raw_key, cursor, key_len);
        raw_key[key_len] = '\0';
        if (eq && val_len > 0) {
            memcpy(raw_val, eq + 1, val_len);
        }
        raw_val[val_len] = '\0';

        char *key = url_decode(raw_key);
        char *val = url_decode(raw_val);
        free(raw_key);
        free(raw_val);
        if (key) {
            cJSON_DeleteItemFromObjectCaseSensitive(root, key);
            cJSON_AddStringToObject(root, key, val ? val : "");
        }
        free(key);
        free(val);

        if (!amp) break;
        cursor = amp + 1;
    }
    return root;
}

static char *get_query_param(const char *route, const char *key) {
    if (!route || !key) return NULL;
    const char *q = strchr(route, '?');
    if (!q) return NULL;
    q++;
    size_t key_len = strlen(key);
    while (*q) {
        const char *amp = strchr(q, '&');
        size_t chunk_len = amp ? (size_t)(amp - q) : strlen(q);
        if (chunk_len > key_len + 1 && strncmp(q, key, key_len) == 0 && q[key_len] == '=') {
            const char *val_start = q + key_len + 1;
            size_t val_len = chunk_len - key_len - 1;
            char *raw = malloc(val_len + 1);
            if (!raw) return NULL;
            memcpy(raw, val_start, val_len);
            raw[val_len] = '\0';
            char *decoded = url_decode(raw);
            free(raw);
            return decoded;
        }
        if (!amp) break;
        q = amp + 1;
    }
    return NULL;
}

static void send_twilio_voice_stream_response(SSL *ssl, const char *http_header) {
    char host[128];
    char *header_host = get_header_value(http_header, "Host");
    if (header_host && header_host[0] != '\0') {
        snprintf(host, sizeof(host), "%s", header_host);
    } else {
        snprintf(host, sizeof(host), "localhost:9030");
    }

    char twiml[1024];
    int twiml_len = snprintf(twiml, sizeof(twiml),
                             "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                             "<Response>"
                             "<Connect>"
                             "<Stream url=\"wss://%s/twilio/media-stream\">"
                             "<Parameter name=\"accountid\" value=\"cust_0b0df4b8\" />"
                             "<Parameter name=\"kb_type\" value=\"client\" />"
                             "</Stream>"
                             "</Connect>"
                             "</Response>",
                             host);
    if (twiml_len <= 0 || twiml_len >= (int)sizeof(twiml)) {
        send_response_code(ssl, 500);
        return;
    }

    char response_header[512];
    int header_len = snprintf(response_header, sizeof(response_header),
                              "HTTP/1.1 200 OK\r\n"
                              "Content-Type: text/xml; charset=utf-8\r\n"
                              "Content-Length: %d\r\n"
                              "Connection: close\r\n"
                              "\r\n",
                              twiml_len);
    if (header_len <= 0 || header_len >= (int)sizeof(response_header)) {
        send_response_code(ssl, 500);
        return;
    }

    SSL_write(ssl, response_header, header_len);
    SSL_write(ssl, twiml, twiml_len);
}

void process_route(struct Socket *socket, char *http_header, char *body, size_t body_len) {
    SSL *cSSL = socket->cSSL;
    if (!http_header) {
        return;
    }

    char *route_start = strchr(http_header, ' ');
    if (!route_start) {
        return;
    }
    route_start++;
    char *route_end = strchr(route_start, ' ');
    if (!route_end) {
        return;
    }
    size_t route_len = route_end - route_start;
    if (route_len == 0) {
        return;
    }
    if (route_len > 65535) {
        send_response_code(cSSL, 400);
        return;
    }

    char *route = malloc(route_len + 1);
    strncpy(route, route_start, route_len);
    route[route_len] = '\0';
    char *route_with_query = strdup(route);
    char *query_start = strchr(route, '?');
    if (query_start) {
        *query_start = '\0';
    }

    char *request_type_end = strchr(http_header, ' ');
    if (!request_type_end) {
        free(route);
        free(route_with_query);
        return;
    }
    size_t request_type_len = request_type_end - http_header;
    if (request_type_len == 0 || request_type_len > 16) {
        free(route);
        free(route_with_query);
        return;
    }

    char *request_type = malloc(request_type_len + 1);
    strncpy(request_type, http_header, request_type_len);
    request_type[request_type_len] = '\0';

    // Print a decoded route for cleaner logs (do not affect routing).
    char *decoded_route = NULL;
    {
        decoded_route = malloc(route_len + 1);
        if (decoded_route) {
            size_t di = 0;
            for (size_t i = 0; i < route_len; i++) {
                if (route[i] == '%' && i + 2 < route_len) {
                    char hex[3] = { route[i + 1], route[i + 2], '\0' };
                    char *endptr = NULL;
                    long val = strtol(hex, &endptr, 16);
                    if (endptr && *endptr == '\0') {
                        decoded_route[di++] = (char)val;
                        i += 2;
                        continue;
                    }
                }
                decoded_route[di++] = route[i];
            }
            decoded_route[di] = '\0';
        }
    }
    printf("Route: '%s %s'\n", request_type, decoded_route ? decoded_route : route);
    if (decoded_route) {
        free(decoded_route);
    }

    if (strcmp(request_type, "OPTIONS") == 0) {
        char http_header[512];
        snprintf(http_header, sizeof(http_header),
                 "HTTP/1.1 204 No Content\r\n"
                 "Access-Control-Allow-Origin: *\r\n"
                 "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                 "Access-Control-Allow-Headers: Content-Type\r\n"
                 "Connection: close\r\n"
                 "\r\n");
        SSL_write(cSSL, http_header, strlen(http_header));
        free(route);
        free(route_with_query);
        free(request_type);
        return;
    }

    if (strcmp(request_type, "POST") == 0 &&
        (strcmp(route, "/twilio/voice") == 0 || strcmp(route, "/voice") == 0)) {
        printf("Twilio live voice webhook received — proxying to Flask for phone-to-account lookup.\n");
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/voice-legacy") == 0) {
        printf("Twilio Voice webhook received.\n");
        printf("Raw Headers:\n%s\n", http_header);
        if (body) {
            printf("Raw Body:\n%s\n", body);
        }
        char *content_type = get_header_value(http_header, "Content-Type");
        cJSON *parsed = NULL;
        if (body && *body) {
            if (content_type && strstr(content_type, "application/json")) {
                parsed = cJSON_Parse(body);
            } else if (content_type && strstr(content_type, "application/x-www-form-urlencoded")) {
                parsed = parse_form_urlencoded(body);
            } else {
                parsed = parse_form_urlencoded(body);
            }
        }
        if (parsed) {
            char *pretty = cJSON_Print(parsed);
            if (pretty) {
                printf("Parsed Body (cJSON):\n%s\n", pretty);
                free(pretty);
            }
        }

        const char *from = NULL;
        const char *to = NULL;
        const char *account_sid = NULL;
        const char *accountid_value = NULL;
        if (parsed) {
            cJSON *item = NULL;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "From");
            if (cJSON_IsString(item)) from = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "To");
            if (cJSON_IsString(item)) to = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "AccountSid");
            if (cJSON_IsString(item)) account_sid = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "accountid");
            if (cJSON_IsString(item)) accountid_value = item->valuestring;
        }

        char *accountid = strdup(
            (accountid_value && *accountid_value) ? accountid_value : "cust_0b0df4b8"
        );

        cJSON *out = cJSON_CreateObject();
        cJSON_AddStringToObject(out, "message", "Sorry I missed your call. How can I help you?");
        cJSON_AddStringToObject(out, "accountid", accountid ? accountid : "");
        if (from) cJSON_AddStringToObject(out, "from", from);
        if (to) cJSON_AddStringToObject(out, "to", to);
        if (account_sid) cJSON_AddStringToObject(out, "twilio_account_sid", account_sid);
        cJSON_AddStringToObject(out, "source", "twilio_sms");
        cJSON_AddStringToObject(out, "event_type", "voice");
        cJSON_AddBoolToObject(out, "skip_model", 1);
        char *payload = cJSON_PrintUnformatted(out);
        cJSON_Delete(out);

        if (!payload) {
            send_response_code(cSSL, 500);
        } else {
            post_to_local(socket, http_header, payload, payload ? strlen(payload) : 0, "/chat", "9000");
            free(payload);
        }

        free(accountid);
        if (parsed) cJSON_Delete(parsed);
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/twilio/sms", 11) == 0) {
        printf("Twilio SMS webhook received.\n");
        printf("Raw Headers:\n%s\n", http_header);
        if (body) {
            printf("Raw Body:\n%s\n", body);
        }
        char *content_type = get_header_value(http_header, "Content-Type");
        cJSON *parsed = NULL;
        if (body && *body) {
            if (content_type && strstr(content_type, "application/json")) {
                parsed = cJSON_Parse(body);
            } else if (content_type && strstr(content_type, "application/x-www-form-urlencoded")) {
                parsed = parse_form_urlencoded(body);
            } else {
                parsed = parse_form_urlencoded(body);
            }
        }
        if (parsed) {
            char *pretty = cJSON_Print(parsed);
            if (pretty) {
                printf("Parsed Body (cJSON):\n%s\n", pretty);
                free(pretty);
            }
        }

        const char *msg = NULL;
        const char *from = NULL;
        const char *to = NULL;
        const char *account_sid = NULL;
        const char *event_type = NULL;
        const char *skip_model = NULL;
        const char *demo_role = NULL;
        const char *accountid_value = NULL;
        if (parsed) {
            cJSON *item = NULL;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "Body");
            if (cJSON_IsString(item)) msg = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "From");
            if (cJSON_IsString(item)) from = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "To");
            if (cJSON_IsString(item)) to = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "AccountSid");
            if (cJSON_IsString(item)) account_sid = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "EventType");
            if (cJSON_IsString(item)) event_type = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "SkipModel");
            if (cJSON_IsString(item)) skip_model = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "DemoRole");
            if (cJSON_IsString(item)) demo_role = item->valuestring;
            item = cJSON_GetObjectItemCaseSensitive(parsed, "accountid");
            if (cJSON_IsString(item)) accountid_value = item->valuestring;
        }

        char *accountid = strdup(
            (accountid_value && *accountid_value) ? accountid_value : "cust_0b0df4b8"
        );

        cJSON *out = cJSON_CreateObject();
        cJSON_AddStringToObject(out, "message", msg ? msg : "");
        cJSON_AddStringToObject(out, "accountid", accountid ? accountid : "");
        if (from) cJSON_AddStringToObject(out, "from", from);
        if (to) cJSON_AddStringToObject(out, "to", to);
        if (account_sid) cJSON_AddStringToObject(out, "twilio_account_sid", account_sid);
        cJSON_AddStringToObject(out, "source", "twilio_sms");
        cJSON_AddStringToObject(out, "event_type", event_type ? event_type : "sms");
        if (demo_role) cJSON_AddStringToObject(out, "demo_role", demo_role);
        if (skip_model && (strcmp(skip_model, "1") == 0 || strcasecmp(skip_model, "true") == 0)) {
            cJSON_AddBoolToObject(out, "skip_model", 1);
        }
        char *payload = cJSON_PrintUnformatted(out);
        cJSON_Delete(out);

        if (!payload) {
            send_response_code(cSSL, 500);
        } else {
            post_to_local(socket, http_header, payload, payload ? strlen(payload) : 0, "/chat", "9000");
            free(payload);
        }

        free(accountid);
        if (parsed) cJSON_Delete(parsed);
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/twiliobot") == 0) {
        get_live_html(cSSL, http_header, "portfolio/twiliobot.html");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/privacy") == 0) {
        get_live_html(cSSL, http_header, "portfolio/privacy.html");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/privacy/", 9) == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/terms") == 0) {
        get_live_html(cSSL, http_header, "portfolio/terms.html");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/terms/", 7) == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/") == 0) {
        get_live_html(cSSL, http_header, "portfolio/home.html");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/home") == 0) {
        get_live_html(cSSL, http_header, "portfolio/palacios.html");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/test") == 0) {
        get_live_html(cSSL, http_header, "portfolio/tst.html");
    } else if (strcmp(request_type, "GET") == 0 &&
               (strcmp(route, "/landscaping") == 0 || strcmp(route, "/landscaping/") == 0)) {
        get_live_html(cSSL, http_header, "landscaping/index.html");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/landscaping/landscaping.js") == 0) {
        get_live_js(cSSL, http_header, "landscaping/landscaping.js");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/sitemap.xml") == 0) {
        get_live_file_typed(cSSL, "landscaping/sitemap.xml", "application/xml; charset=utf-8");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/robots.txt") == 0) {
        get_live_file_typed(cSSL, "landscaping/robots.txt", "text/plain; charset=utf-8");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/favicon.ico") != NULL) {
        get_image_file(cSSL, http_header, "/portfolio/images/favicon.ico");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/dashboard/dist/", 16) == 0) {
        // Serve compiled bundle output from templates/AIdashboard/dist/.
        // The bundle assets are produced by `npm run build` in /web.
        // We map /dashboard/dist/<path> to AIdashboard/dist/<path>.
        char rel_path[512];
        snprintf(rel_path, sizeof(rel_path), "AIdashboard/dist/%s", route + 16);
        // Detect MIME type by extension; default to application/octet-stream.
        const char *mime = "application/octet-stream";
        const char *ext = strrchr(route, '.');
        if (ext) {
            if (strcmp(ext, ".js") == 0)        mime = "application/javascript; charset=utf-8";
            else if (strcmp(ext, ".css") == 0)  mime = "text/css; charset=utf-8";
            else if (strcmp(ext, ".map") == 0)  mime = "application/json; charset=utf-8";
            else if (strcmp(ext, ".json") == 0) mime = "application/json; charset=utf-8";
            else if (strcmp(ext, ".svg") == 0)  mime = "image/svg+xml";
            else if (strcmp(ext, ".woff2") == 0)mime = "font/woff2";
            else if (strcmp(ext, ".woff") == 0) mime = "font/woff";
        }
        get_live_file_typed(cSSL, rel_path, mime);
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/dashboard/static/", 18) == 0) {
        /* Hand-written reusable client modules — Flask serves them. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/dashboard") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/social") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/social/", 8) == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/dashboard/instagram", 20) == 0) {
        /* New Instagram integration — page + OAuth start + status/pages/media/DM API. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/dashboard/linkedin", 19) == 0) {
        /* LinkedIn-as-its-own-tab — page + JSON status/posts/rate APIs. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/api/ai/", 8) == 0) {
        /* Inline AI editor — rewrite-selection endpoint + hooks +
         * preview + voice rules. Auth-gated server-side. */
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/api/ai/", 8) == 0) {
        /* GET endpoints under /api/ai/ — voice rules, etc. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/dashboard/linkedin/", 20) == 0) {
        /* LinkedIn composer publish + image upload + library + AI drafts. */
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "DELETE") == 0 && strncmp(route, "/dashboard/linkedin/", 20) == 0) {
        /* Library item deletion + AI draft deletion + account disconnect. */
        delete_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "PATCH") == 0 && strncmp(route, "/dashboard/linkedin/", 20) == 0) {
        /* Library item edit. Forwarded as POST since the underlying
         * proxy helper bridges PATCH→POST for the upstream Flask app. */
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/oauth/linkedin/", 16) == 0) {
        /* LinkedIn OAuth callback. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/dashboard/instagram/", 21) == 0) {
        /* /dashboard/instagram/api/pick-page (JSON), /publish (multipart),
         * /disconnect (no body). */
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/me") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && (strcmp(route, "/try") == 0 || strncmp(route, "/try/", 5) == 0)) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && (strcmp(route, "/try") == 0 || strncmp(route, "/try/", 5) == 0)) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/integrations/", 14) == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/integrations/", 14) == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/webhooks/", 10) == 0) {
        /* Meta webhook verification handshake — Flask validates
         * hub.verify_token and echoes hub.challenge. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/webhooks/", 10) == 0) {
        /* Meta webhook event delivery — Flask verifies X-Hub-Signature-256
         * with META_APP_SECRET before processing the JSON envelope. */
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/ig-media/", 10) == 0) {
        /* Public passthrough: Meta fetches uploaded IG media here
         * during media-container creation. Flask streams the blob from
         * GCS via ADC. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/li-media/", 10) == 0) {
        /* Public passthrough: LinkedIn fetches composer-uploaded
         * images here during the registerUpload step. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/li-lib/", 8) == 0) {
        /* Public passthrough for LinkedIn library media (combinator
         * Phase 1). Path-unguessable so no auth gate. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/admin/") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/admin/") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/internal/reroute") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/internal/reroute") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/messages") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/messages/data") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/login") == 0) {
        get_live_html(cSSL, http_header, "AIdashboard/login.html");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/auth/oura/callback") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/auth/") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/auth/") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/onboarding/") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/onboarding/") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/me/") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/me/") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "DELETE") == 0 && strstr(route, "/me/") != NULL) {
        delete_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/unsubscribe/", 13) == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/unsubscribe/", 13) == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/track/open/", 12) == 0) {
        /* Email open-tracking pixel — public route hit by recipients'
         * email clients when they render the message. Always returns
         * a 1x1 transparent gif. */
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/trial-phone/") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/trial-phone/") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/chat-reset") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "9000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/domains") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/voice-transcript") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/widget.js") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/widget.css") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/widget.html") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/robot_icon.png") == 0) {
        printf("Serving robot_icon.png\n");
        get_to_local(socket, http_header, body, route_with_query, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/widget.js") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/widget.css") != NULL) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/widget.html") != NULL) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/robot_icon.png") != NULL) {
        get_to_local(socket, http_header, body, route, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/bot-config") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/knowledege") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strncmp(route, "/kb/", 4) == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/voices") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/lead-sample") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/leads") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/voice-transcript") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/lead-transcript") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/domains") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strcmp(route, "/demo-kb-profile") == 0) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/prompt") != NULL) {
        get_to_local(socket, http_header, body, route, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/validate-domain") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "9000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/instagram/images/") != NULL) {
        get_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/chat") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "9000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/book-estimate") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "9000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/bot-config") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/knowledege") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/kb/", 4) == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/prompt-save") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/knowledege-embed") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/publish-app") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/leads-sync") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/lead-sql") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/demo-kb-ingest") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/demo-kb-save") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/demo-kb-share") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/demo-opened") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/voice-transcript-summary") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/domains") != NULL) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strstr(route, "/auth/") != NULL) {
        post_to_local(socket, http_header, body, body_len, route, "5000");
    } else if (strcmp(request_type, "POST") == 0 && strcmp(route, "/chat-reset") == 0) {
        post_to_local(socket, http_header, body, body_len, route_with_query, "9000");
    } else if (strcmp(request_type, "POST") == 0 && strncmp(route, "/blob-storage/", 14) == 0) {
        post_blob(socket, http_header, body, route);
    } else if (strcmp(request_type, "DELETE") == 0 && strstr(route, "/knowledege") != NULL) {
        delete_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "DELETE") == 0 && strncmp(route, "/kb/", 4) == 0) {
        delete_to_local(socket, http_header, body, route_with_query, "5000");
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/portfolio/images/") != NULL) {
        get_image_file(cSSL, http_header, route);
    } else if (strcmp(request_type, "GET") == 0 && strstr(route, "/videos/") != NULL) {
        get_video_file(cSSL, http_header, route);
    } else {
        send_response_code(cSSL, 404);
    }

    free(route);
    free(route_with_query);
    free(request_type);
}
