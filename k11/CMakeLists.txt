cmake_minimum_required(VERSION 3.20)
project(Fossil3DReconstruction VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

if(MSVC)
    add_compile_options(/MP /W4)
    add_definitions(-D_CRT_SECURE_NO_WARNINGS)
else()
    add_compile_options(-Wall -Wextra -O2)
endif()

find_package(OpenCV REQUIRED)
find_package(PCL 1.12 REQUIRED)
find_package(VTK REQUIRED)
find_package(Qt5 REQUIRED COMPONENTS Core Widgets Gui)
find_package(OpenMP)

include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${OpenCV_INCLUDE_DIRS}
    ${PCL_INCLUDE_DIRS}
    ${VTK_INCLUDE_DIRS}
)

link_directories(${PCL_LIBRARY_DIRS})
add_definitions(${PCL_DEFINITIONS})

file(GLOB_RECURSE HEADER_FILES
    include/*.h
    include/*.hpp
)

file(GLOB_RECURSE SOURCE_FILES
    src/*.cpp
    src/*.c
)

file(GLOB UI_FILES
    src/gui/*.ui
)

file(GLOB RESOURCE_FILES
    resources/*.qrc
)

add_executable(Fossil3DReconstruction
    ${HEADER_FILES}
    ${SOURCE_FILES}
    ${UI_FILES}
    ${RESOURCE_FILES}
)

target_link_libraries(Fossil3DReconstruction
    ${OpenCV_LIBS}
    ${PCL_LIBRARIES}
    ${VTK_LIBRARIES}
    Qt5::Core
    Qt5::Widgets
    Qt5::Gui
)

if(OpenMP_CXX_FOUND)
    target_link_libraries(Fossil3DReconstruction OpenMP::OpenMP_CXX)
endif()

vtk_module_autoinit(
    TARGETS Fossil3DReconstruction
    MODULES ${VTK_LIBRARIES}
)

install(TARGETS Fossil3DReconstruction DESTINATION bin)
