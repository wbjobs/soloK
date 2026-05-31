cmake_minimum_required(VERSION 3.16)
project(InfraredWaterDetection VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets PrintSupport Charts OpenGL)
find_package(OpenCV REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(FFTW3 REQUIRED fftw3)

include_directories(
    ${CMAKE_SOURCE_DIR}/src
    ${OpenCV_INCLUDE_DIRS}
    ${FFTW3_INCLUDE_DIRS}
)

set(SOURCES
    src/main.cpp
    src/MainWindow.cpp
    src/data/TemperatureFrame.cpp
    src/data/AnomalyRegion.cpp
    src/data/ThreeDPosition.cpp
    src/data/TEMData.cpp
    src/data/GeologicalModel.cpp
    src/io/FLIRImporter.cpp
    src/io/TEMImporter.cpp
    src/processing/ImageRegistration.cpp
    src/processing/TemperatureCalibration.cpp
    src/processing/TemperatureFieldAnalyzer.cpp
    src/processing/TimeSeriesAnalyzer.cpp
    src/processing/WaterStructureLocalizer.cpp
    src/processing/CrossValidationAnalyzer.cpp
    src/report/ReportGenerator.cpp
    src/widgets/TemperatureViewer.cpp
    src/widgets/TimeSeriesChart.cpp
    src/widgets/ReportPreview.cpp
    src/widgets/FusionViewer.cpp
    src/widgets/Geological3DView.cpp
)

set(HEADERS
    src/MainWindow.h
    src/data/TemperatureFrame.h
    src/data/AnomalyRegion.h
    src/data/ThreeDPosition.h
    src/data/TEMData.h
    src/data/GeologicalModel.h
    src/io/FLIRImporter.h
    src/io/TEMImporter.h
    src/processing/ImageRegistration.h
    src/processing/TemperatureCalibration.h
    src/processing/TemperatureFieldAnalyzer.h
    src/processing/TimeSeriesAnalyzer.h
    src/processing/WaterStructureLocalizer.h
    src/processing/CrossValidationAnalyzer.h
    src/report/ReportGenerator.h
    src/widgets/TemperatureViewer.h
    src/widgets/TimeSeriesChart.h
    src/widgets/ReportPreview.h
    src/widgets/FusionViewer.h
    src/widgets/Geological3DView.h
)

add_executable(InfraredWaterDetection
    ${SOURCES}
    ${HEADERS}
)

target_link_libraries(InfraredWaterDetection
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::PrintSupport
    Qt6::Charts
    Qt6::OpenGL
    opengl32
    ${OpenCV_LIBS}
    ${FFTW3_LIBRARIES}
)

if(WIN32)
    set_target_properties(InfraredWaterDetection PROPERTIES
        WIN32_EXECUTABLE TRUE
    )
endif()
