cmake_minimum_required(VERSION 3.0)
project(home-server C)

set(CMAKE_C_STANDARD 99)

file(GLOB MAIN
    "main.c"
    "server/server.c"
    "server/send_message.c"
    "server/read_message.c"
    "models/SQL.c"
    "models/Blob.c"
    "models/session.c"
    "models/websocket.c"
    "models/Invitation.c"
    "models/WebsocketClient.c"
    "models/Websocket_Message.c"
    "models/User_Token.c"
    "models/FrameField.c"
    "models/Frame.c"
    "models/User.c"
    "database/SQL.c"
    "models/Socket.c"
    "utilities/*.c"
    "routes/route.c"
    "routes/local-server/POST/post_local_server.c"
    "routes/local-server/GET/get_local_server.c"
)




add_executable(home-server ${MAIN})

target_include_directories(home-server PRIVATE
    ${PROJECT_SOURCE_DIR}/server
    ${PROJECT_SOURCE_DIR}/utilities
    ${PROJECT_SOURCE_DIR}/routes
    ${PROJECT_SOURCE_DIR}/database
    ${PROJECT_SOURCE_DIR}/models
    ${PROJECT_SOURCE_DIR}/routes/local-server/GET
)


find_package(OpenSSL REQUIRED)
target_link_libraries(home-server OpenSSL::SSL OpenSSL::Crypto)

find_library(MYSQLCLIENT_LIB mysqlclient)
target_link_libraries(home-server ${MYSQLCLIENT_LIB})

target_link_libraries(home-server uuid cjson)
