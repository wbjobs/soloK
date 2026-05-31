cmake_minimum_required(VERSION 3.20)
project(WindTunnelServer CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Boost 1.82 REQUIRED COMPONENTS system thread)
find_package(OpenSSL REQUIRED)

include_directories(${Boost_INCLUDE_DIRS})
include_directories(include)

add_executable(windtunnel_server
    src/main.cpp
    src/udp_server.cpp
    src/websocket_server.cpp
    src/data_processor.cpp
    src/state_machine.cpp
    src/quality_control.cpp
)

target_link_libraries(windtunnel_server
    ${Boost_LIBRARIES}
    OpenSSL::SSL
    OpenSSL::Crypto
    pthread
)

add_executable(simulator
    src/simulator.cpp
)

target_link_libraries(simulator
    ${Boost_LIBRARIES}
    pthread
)
