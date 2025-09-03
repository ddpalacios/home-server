cmake_minimum_required(VERSION 3.0)
project(home-server C)

set(CMAKE_C_STANDARD 99)

file(GLOB MAIN
    "main.c"
    "server/server.c"
    "server/send_message.c"
    "server/read_message.c"
    "models/SQL.c"
    "models/session.c"
    "models/websocket.c"
    "models/Invitation.c"
    "models/WebsocketClient.c"
    "models/Websocket_Message.c"
    "models/FrameField.c"
    "models/Frame.c"
    "models/User.c"
    "database/SQL.c"
    "models/Socket.c"
    "utilities/*.c"
    "routes/route.c"
    "routes/database-server/POST/*.c"
    "routes/life-of-sounds/GET/login.c"
    "routes/life-of-sounds/GET/home.c"
    "routes/life-of-sounds/GET/get_session_messages.c"
    "routes/life-of-sounds/GET/get_live_page.c"
    "routes/life-of-sounds/GET/get_web_audio_api_script.c"
    "routes/life-of-sounds/GET/websocket_protocol.c"
    "routes/life-of-sounds/GET/get_html_utilities_script.c"
    "routes/life-of-sounds/GET/get_game_of_life_script.c"
    "routes/life-of-sounds/GET/new_login.c"
    "routes/life-of-sounds/GET/users.c"
    "routes/life-of-sounds/POST/login.c"
    "routes/life-of-sounds/POST/post_user.c"
    "routes/life-of-sounds/POST/post_websocket_session.c"
    "routes/life-of-sounds/POST/post_browser_session.c"
    "routes/life-of-sounds/POST/post_websocket_client.c"
    "routes/life-of-sounds/GET/get_websocket_client.c"
    "routes/life-of-sounds/DELETE/delete_websocket_session.c"
    "routes/life-of-sounds/PATCH/patch_websocket_client.c"
    "routes/life-of-sounds/PATCH/patch_browser_session.c"
    "routes/life-of-sounds/PATCH/patch_websocket_session.c"
)




add_executable(home-server ${MAIN})

target_include_directories(home-server PRIVATE
    ${PROJECT_SOURCE_DIR}/server
    ${PROJECT_SOURCE_DIR}/utilities
    ${PROJECT_SOURCE_DIR}/routes
    ${PROJECT_SOURCE_DIR}/database
    ${PROJECT_SOURCE_DIR}/models
    ${PROJECT_SOURCE_DIR}/routes/database-server/POST
    ${PROJECT_SOURCE_DIR}/routes/life-of-sounds/GET
    ${PROJECT_SOURCE_DIR}/routes/life-of-sounds/POST

)

find_package(OpenSSL REQUIRED)
target_link_libraries(home-server OpenSSL::SSL OpenSSL::Crypto)

find_library(MYSQLCLIENT_LIB mysqlclient)
target_link_libraries(home-server ${MYSQLCLIENT_LIB})

target_link_libraries(home-server uuid cjson)

