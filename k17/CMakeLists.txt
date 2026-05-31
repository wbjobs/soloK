cmake_minimum_required(VERSION 3.16)
project(SpeckleInterferometry VERSION 1.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

if(WIN32)
    set(CMAKE_WIN32_EXECUTABLE ON)
endif()

find_package(Qt6 COMPONENTS Core Gui Widgets Charts PrintSupport REQUIRED)
find_package(OpenCV REQUIRED)
find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
    pkg_check_modules(FFTW3 fftw3)
endif()

if(NOT FFTW3_FOUND)
    find_path(FFTW3_INCLUDE_DIR fftw3.h
        PATHS $ENV{FFTW3_DIR}/include /usr/local/include /usr/include
    )
    find_library(FFTW3_LIBRARY
        NAMES fftw3 libfftw3 fftw3-3
        PATHS $ENV{FFTW3_DIR}/lib /usr/local/lib /usr/lib
    )
    if(FFTW3_INCLUDE_DIR AND FFTW3_LIBRARY)
        set(FFTW3_FOUND TRUE)
        set(FFTW3_INCLUDE_DIRS ${FFTW3_INCLUDE_DIR})
        set(FFTW3_LIBRARIES ${FFTW3_LIBRARY})
    endif()
endif()

if(NOT FFTW3_FOUND)
    message(FATAL_ERROR "FFTW3 not found. Please set FFTW3_DIR or install FFTW3.")
endif()

set(SOURCES
    src/main.cpp
    src/core/SpeckleProcessor.cpp
    src/core/PhaseUnwrapper.cpp
    src/core/StrainCalculator.cpp
    src/core/ImageRegistrar.cpp
    src/core/Calibrator.cpp
    src/core/DICProcessor.cpp
    src/core/FusionProcessor.cpp
    src/core/StrainDecomposer.cpp
    src/io/DataExporter.cpp
    src/io/VideoSource.cpp
    src/gui/MainWindow.cpp
    src/gui/ImageViewer.cpp
    src/gui/ROISelector.cpp
    src/gui/TimeHistoryWidget.cpp
    src/gui/CalibrationDialog.cpp
    src/gui/ExportDialog.cpp
    src/utils/MathUtils.cpp
    src/utils/ColorMap.cpp
    resources/resources.qrc
)

set(HEADERS
    src/core/SpeckleProcessor.h
    src/core/PhaseUnwrapper.h
    src/core/StrainCalculator.h
    src/core/ImageRegistrar.h
    src/core/Calibrator.h
    src/core/DICProcessor.h
    src/core/FusionProcessor.h
    src/core/StrainDecomposer.h
    src/io/DataExporter.h
    src/io/VideoSource.h
    src/gui/MainWindow.h
    src/gui/ImageViewer.h
    src/gui/ROISelector.h
    src/gui/TimeHistoryWidget.h
    src/gui/CalibrationDialog.h
    src/gui/ExportDialog.h
    src/utils/MathUtils.h
    src/utils/ColorMap.h
)

add_executable(${PROJECT_NAME} ${SOURCES} ${HEADERS})

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${OpenCV_INCLUDE_DIRS}
    ${FFTW3_INCLUDE_DIRS}
)

target_link_libraries(${PROJECT_NAME} PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Charts
    Qt6::PrintSupport
    ${OpenCV_LIBS}
    ${FFTW3_LIBRARIES}
)

if(WIN32)
    target_compile_definitions(${PROJECT_NAME} PRIVATE _USE_MATH_DEFINES NOMINMAX)
endif()

install(TARGETS ${PROJECT_NAME} DESTINATION bin)
