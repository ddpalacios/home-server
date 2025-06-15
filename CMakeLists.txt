cmake_minimum_required(VERSION 3.0)
project(home-server C)

set(CMAKE_C_STANDARD 99)

file(GLOB MAIN
    "main.c"
    "server/*.c"
    "routes/route.c"
    "database/SQL.c"
    "utilities/*.c"
    "routes/life-of-sounds/GET/*.c"
    "routes/life-of-sounds/PATCH/*.c"
    "routes/life-of-sounds/DELETE/*.c"
    "routes/life-of-sounds/POST/*.c"
    "models/User.c"
    "models/websocket.c"
    "models/Client_Connection.c"
    "models/session.c"
    "models/Audio.c"
    
)




add_executable(home-server ${MAIN})

target_include_directories(home-server PRIVATE
    ${PROJECT_SOURCE_DIR}/server
    ${PROJECT_SOURCE_DIR}/routes
    ${PROJECT_SOURCE_DIR}/models
    ${PROJECT_SOURCE_DIR}/database
    ${PROJECT_SOURCE_DIR}/utilities
    ${PROJECT_SOURCE_DIR}/routes/life-of-sounds/PATCH
    ${PROJECT_SOURCE_DIR}/routes/life-of-sounds/GET
    ${PROJECT_SOURCE_DIR}/routes/life-of-sounds/DELETE
    ${PROJECT_SOURCE_DIR}/routes/life-of-sounds/POST
)

find_package(OpenSSL REQUIRED)
target_link_libraries(home-server OpenSSL::SSL OpenSSL::Crypto)

find_library(MYSQLCLIENT_LIB mysqlclient)
target_link_libraries(home-server ${MYSQLCLIENT_LIB})

target_link_libraries(home-server uuid cjson)

