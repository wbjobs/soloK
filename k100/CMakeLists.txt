cmake_minimum_required(VERSION 3.20)
project(vk浮雕 VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

option(BUILD_PYTHON_BINDINGS "Build Python bindings with pybind11" ON)
option(BUILD_EXAMPLES "Build example programs" ON)
option(USE_RTMP "Enable RTMP streaming support" ON)
option(USE_ONNXRUNTIME "Enable ONNX Runtime for YOLO object detection" OFF)

find_package(Vulkan REQUIRED)
find_package(FFmpeg REQUIRED COMPONENTS avcodec avformat avutil swscale swresample)

if(USE_RTMP)
    add_definitions(-DUSE_RTMP)
endif()

if(USE_ONNXRUNTIME)
    add_definitions(-DUSE_ONNXRUNTIME)
    find_package(OnnxRuntime REQUIRED)
endif()

include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
    ${FFMPEG_INCLUDE_DIRS}
)

add_subdirectory(src/core)
add_subdirectory(src/vulkan)
add_subdirectory(src/video)
add_subdirectory(src/edge_detection)
add_subdirectory(src/detection)
add_subdirectory(src/renderer)
add_subdirectory(src)

if(BUILD_PYTHON_BINDINGS)
    add_subdirectory(src/python)
endif()

if(BUILD_EXAMPLES)
    add_subdirectory(examples)
endif()

find_program(GLSLANG_VALIDATOR glslangValidator HINTS
    $ENV{VULKAN_SDK}/Bin
    $ENV{VULKAN_SDK}/Bin32
)

if(GLSLANG_VALIDATOR)
    message(STATUS "Found glslangValidator: ${GLSLANG_VALIDATOR}")
    set(SHADER_DIR ${CMAKE_SOURCE_DIR}/shaders)
    set(SHADER_BIN_DIR ${CMAKE_BINARY_DIR}/shaders)
    file(MAKE_DIRECTORY ${SHADER_BIN_DIR})

    file(GLOB SHADER_SOURCES ${SHADER_DIR}/*.vert ${SHADER_DIR}/*.frag ${SHADER_DIR}/*.comp)

    foreach(SHADER_SRC ${SHADER_SOURCES})
        get_filename_component(SHADER_NAME ${SHADER_SRC} NAME)
        set(SHADER_BIN ${SHADER_BIN_DIR}/${SHADER_NAME}.spv)
        add_custom_command(
            OUTPUT ${SHADER_BIN}
            COMMAND ${GLSLANG_VALIDATOR} -V ${SHADER_SRC} -o ${SHADER_BIN}
            DEPENDS ${SHADER_SRC}
            COMMENT "Compiling shader: ${SHADER_NAME}"
        )
        list(APPEND SHADER_BINARIES ${SHADER_BIN})
    endforeach()

    add_custom_target(compile_shaders DEPENDS ${SHADER_BINARIES})
    add_dependencies(vk浮雕_core compile_shaders)
else()
    message(WARNING "glslangValidator not found. Shaders will not be compiled.")
endif()
