QT       += core gui widgets printsupport charts opengl

greaterThan(QT_MAJOR_VERSION, 4): QT += widgets

CONFIG += c++17

TARGET = InfraredWaterDetection
TEMPLATE = app

SOURCES += \
    src/main.cpp \
    src/MainWindow.cpp \
    src/data/TemperatureFrame.cpp \
    src/data/AnomalyRegion.cpp \
    src/data/ThreeDPosition.cpp \
    src/data/TEMData.cpp \
    src/data/GeologicalModel.cpp \
    src/io/FLIRImporter.cpp \
    src/io/TEMImporter.cpp \
    src/processing/ImageRegistration.cpp \
    src/processing/TemperatureCalibration.cpp \
    src/processing/TemperatureFieldAnalyzer.cpp \
    src/processing/TimeSeriesAnalyzer.cpp \
    src/processing/WaterStructureLocalizer.cpp \
    src/processing/CrossValidationAnalyzer.cpp \
    src/report/ReportGenerator.cpp \
    src/widgets/TemperatureViewer.cpp \
    src/widgets/TimeSeriesChart.cpp \
    src/widgets/ReportPreview.cpp \
    src/widgets/FusionViewer.cpp \
    src/widgets/Geological3DView.cpp

HEADERS += \
    src/MainWindow.h \
    src/data/TemperatureFrame.h \
    src/data/AnomalyRegion.h \
    src/data/ThreeDPosition.h \
    src/data/TEMData.h \
    src/data/GeologicalModel.h \
    src/io/FLIRImporter.h \
    src/io/TEMImporter.h \
    src/processing/ImageRegistration.h \
    src/processing/TemperatureCalibration.h \
    src/processing/TemperatureFieldAnalyzer.h \
    src/processing/TimeSeriesAnalyzer.h \
    src/processing/WaterStructureLocalizer.h \
    src/processing/CrossValidationAnalyzer.h \
    src/report/ReportGenerator.h \
    src/widgets/TemperatureViewer.h \
    src/widgets/TimeSeriesChart.h \
    src/widgets/ReportPreview.h \
    src/widgets/FusionViewer.h \
    src/widgets/Geological3DView.h

INCLUDEPATH += src

win32 {
    INCLUDEPATH += "C:/opencv/build/include"
    LIBS += -L"C:/opencv/build/x64/vc15/lib" -lopencv_world450

    INCLUDEPATH += "C:/fftw3"
    LIBS += -L"C:/fftw3" -llibfftw3-3
}

unix {
    CONFIG += link_pkgconfig
    PKGCONFIG += opencv fftw3
}
