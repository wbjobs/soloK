cmake_minimum_required(VERSION 3.15)
project(FreeDPlugin VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(SOURCES
    src/FreeDPluginAPI.cpp
    src/FreeDProtocol.cpp
    src/UDPSocket.cpp
)

set(HEADERS
    include/FreeDPluginAPI.h
    include/FreeDProtocol.h
    include/UDPSocket.h
)

add_library(FreeDPlugin SHARED ${SOURCES} ${HEADERS})

target_include_directories(FreeDPlugin
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
    PRIVATE
        src
)

if(WIN32)
    target_compile_definitions(FreeDPlugin PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()

set_target_properties(FreeDPlugin PROPERTIES
    OUTPUT_NAME "FreeDPlugin"
    DEBUG_POSTFIX "_d"
)

install(TARGETS FreeDPlugin
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    RUNTIME DESTINATION bin
)
