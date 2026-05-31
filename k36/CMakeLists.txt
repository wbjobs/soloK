cmake_minimum_required(VERSION 3.18)
project(ForestLiDAR VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt5 COMPONENTS Core Widgets Gui PrintSupport REQUIRED)
find_package(PCL 1.11 REQUIRED COMPONENTS common io filters segmentation visualization features kdtree surface)
find_package(Open3D REQUIRED)
find_package(VTK 9.0 REQUIRED COMPONENTS CommonCore GUISupportQt RenderingCore RenderingOpenGL2 InteractionStyle FiltersCore)

find_package(LASlib QUIET)
if(NOT LASlib_FOUND)
    find_package(libLAS QUIET)
endif()

include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${PCL_INCLUDE_DIRS}
    ${Open3D_INCLUDE_DIRS}
    ${VTK_INCLUDE_DIRS}
)

link_directories(
    ${PCL_LIBRARY_DIRS}
)

add_definitions(${PCL_DEFINITIONS})

set(HEADERS
    include/core/typedefs.h
    include/core/PointCloudData.h
    include/core/Tree.h
    include/core/SegmentationResult.h
    include/io/PointCloudLoader.h
    include/io/ResultExporter.h
    include/segmentation/TerrainNormalizer.h
    include/segmentation/TreeTopDetector.h
    include/segmentation/TreeSegmenter.h
    include/segmentation/ManualCorrection.h
    include/features/TreeParameterExtractor.h
    include/features/SlopeCorrector.h
    include/features/CompetitionIndex.h
    include/features/IncrementBorer.h
    include/visualization/PointCloudVisualizer.h
    include/visualization/TreeVisualizer.h
    include/visualization/CompetitionVisualizer.h
    include/gui/MainWindow.h
    include/gui/ProcessingWorker.h
)

set(SOURCES
    src/core/PointCloudData.cpp
    src/core/Tree.cpp
    src/core/SegmentationResult.cpp
    src/io/PointCloudLoader.cpp
    src/io/ResultExporter.cpp
    src/segmentation/TerrainNormalizer.cpp
    src/segmentation/TreeTopDetector.cpp
    src/segmentation/TreeSegmenter.cpp
    src/segmentation/ManualCorrection.cpp
    src/features/TreeParameterExtractor.cpp
    src/features/SlopeCorrector.cpp
    src/features/CompetitionIndex.cpp
    src/features/IncrementBorer.cpp
    src/visualization/PointCloudVisualizer.cpp
    src/visualization/TreeVisualizer.cpp
    src/visualization/CompetitionVisualizer.cpp
    src/gui/MainWindow.cpp
    src/gui/ProcessingWorker.cpp
    src/main.cpp
)

set(UI_FILES
    src/gui/MainWindow.ui
)

qt5_wrap_ui(UI_HEADERS ${UI_FILES})

add_executable(ForestLiDAR ${SOURCES} ${HEADERS} ${UI_HEADERS})

target_link_libraries(ForestLiDAR
    Qt5::Core
    Qt5::Widgets
    Qt5::Gui
    Qt5::PrintSupport
    ${PCL_LIBRARIES}
    ${Open3D_LIBRARIES}
    ${VTK_LIBRARIES}
)

if(LASlib_FOUND)
    target_link_libraries(ForestLiDAR ${LASlib_LIBRARIES})
    target_include_directories(ForestLiDAR PRIVATE ${LASlib_INCLUDE_DIRS})
    target_compile_definitions(ForestLiDAR PRIVATE HAVE_LASLIB)
elseif(libLAS_FOUND)
    target_link_libraries(ForestLiDAR ${libLAS_LIBRARIES})
    target_include_directories(ForestLiDAR PRIVATE ${libLAS_INCLUDE_DIRS})
    target_compile_definitions(ForestLiDAR PRIVATE HAVE_LIBLAS)
endif()

vtk_module_autoinit(TARGETS ForestLiDAR MODULES ${VTK_LIBRARIES})

install(TARGETS ForestLiDAR RUNTIME DESTINATION bin)
