cmake_minimum_required(VERSION 3.16)
project(VoxelEngine VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

option(BUILD_SHADERS "Build GLSL shaders to SPIR-V" ON)

find_package(Vulkan REQUIRED)
find_package(Qt6 COMPONENTS Core Widgets Gui QUIET)
if(NOT Qt6_FOUND)
    find_package(Qt5 5.15 REQUIRED COMPONENTS Core Widgets Gui)
    set(QT_VERSION_MAJOR 5)
else()
    set(QT_VERSION_MAJOR 6)
endif()

include_directories(
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/src/core
    ${CMAKE_SOURCE_DIR}/src/math
    ${CMAKE_SOURCE_DIR}/src/voxel
    ${CMAKE_SOURCE_DIR}/src/render
    ${CMAKE_SOURCE_DIR}/src/ui
    ${Vulkan_INCLUDE_DIRS}
)

file(GLOB_RECURSE SOURCES
    ${CMAKE_SOURCE_DIR}/src/*.cpp
    ${CMAKE_SOURCE_DIR}/src/*.h
)

add_executable(VoxelEngine WIN32 ${SOURCES})

if(QT_VERSION_MAJOR EQUAL 6)
    target_link_libraries(VoxelEngine PRIVATE Qt6::Core Qt6::Widgets Qt6::Gui)
else()
    target_link_libraries(VoxelEngine PRIVATE Qt5::Core Qt5::Widgets Qt5::Gui)
endif()

target_link_libraries(VoxelEngine PRIVATE Vulkan::Vulkan)

if(WIN32)
    target_compile_definitions(VoxelEngine PRIVATE VK_USE_PLATFORM_WIN32_KHR)
elseif(UNIX)
    target_compile_definitions(VoxelEngine PRIVATE VK_USE_PLATFORM_XLIB_KHR)
endif()

if(BUILD_SHADERS)
    find_program(GLSLANG_VALIDATOR glslangValidator)
    if(GLSLANG_VALIDATOR)
        file(GLOB SHADERS
            ${CMAKE_SOURCE_DIR}/shaders/*.vert
            ${CMAKE_SOURCE_DIR}/shaders/*.frag
            ${CMAKE_SOURCE_DIR}/shaders/*.comp
        )
        foreach(SHADER ${SHADERS})
            get_filename_component(SHADER_NAME ${SHADER} NAME)
            set(SPIRV ${CMAKE_SOURCE_DIR}/shaders/${SHADER_NAME}.spv)
            add_custom_command(
                TARGET VoxelEngine PRE_BUILD
                COMMAND ${GLSLANG_VALIDATOR} -V ${SHADER} -o ${SPIRV}
                MAIN_DEPENDENCY ${SHADER}
                COMMENT "Compiling shader ${SHADER_NAME}"
            )
        endforeach()
    endif()
endif()

if(MSVC)
    target_compile_options(VoxelEngine PRIVATE /W3)
else()
    target_compile_options(VoxelEngine PRIVATE -Wall -Wextra)
endif()
