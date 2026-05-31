#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include "data/TemperatureFrame.h"
#include "data/AnomalyRegion.h"
#include "data/TEMData.h"
#include "data/GeologicalModel.h"
#include "io/FLIRImporter.h"
#include "io/TEMImporter.h"
#include "processing/ImageRegistration.h"
#include "processing/TemperatureCalibration.h"
#include "processing/TemperatureFieldAnalyzer.h"
#include "processing/TimeSeriesAnalyzer.h"
#include "processing/WaterStructureLocalizer.h"
#include "processing/CrossValidationAnalyzer.h"
#include "report/ReportGenerator.h"
#include "widgets/TemperatureViewer.h"
#include "widgets/TimeSeriesChart.h"
#include "widgets/ReportPreview.h"
#include "widgets/FusionViewer.h"
#include "widgets/Geological3DView.h"

#include <QMainWindow>
#include <QSlider>
#include <QLabel>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QPushButton>
#include <QAction>
#include <QTabWidget>
#include <QTableWidget>
#include <QProgressBar>
#include <QButtonGroup>

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(QWidget* parent = nullptr);
    ~MainWindow();

private slots:
    void onImportFiles();
    void onImportTEM();
    void onAnalyze();
    void onCrossValidate();
    void onBuild3DModel();
    void onExportReport();
    void onFrameSliderChanged(int value);
    void onPointSelected(const QPoint& point, double temperature);
    void onFusionPointSelected(const QPoint& point, double confidence, double temp, double resistivity);
    void onAddTimeSeriesPoint();
    void onClearTimeSeriesPoints();
    void onRegistrationToggled(bool enabled);
    void onCalibrationToggled(bool enabled);
    void onUpdateCalibrationParams();
    void onDisplayModeChanged(int mode);
    void onCutPlaneXToggled(bool enabled);
    void onCutPlaneYToggled(bool enabled);
    void onCutPlaneZToggled(bool enabled);
    void onCutPlaneXChanged(int value);
    void onCutPlaneYChanged(int value);
    void onCutPlaneZChanged(int value);
    void onResetCamera();

private:
    void setupUI();
    void setupMenus();
    void setupConnections();

    void processFrames();
    void updateFrameDisplay(int index);
    void updateAnomalyTable();
    void updateDrillingTable();
    void updateFusionDisplay();

    std::vector<TemperatureFrame> m_rawFrames;
    std::vector<TemperatureFrame> m_processedFrames;
    std::vector<std::vector<AnomalyRegion>> m_frameAnomalies;
    std::vector<AnomalyRegion> m_localizedAnomalies;
    std::vector<DrillingSuggestion> m_drillingSuggestions;
    QVector<QPoint> m_timeSeriesPoints;
    QVector<TimeSeriesData> m_timeSeriesData;

    TEMProfile m_temProfile;
    FusionResult m_fusionResult;
    GeologicalModel m_geologicalModel;

    FLIRImporter* m_importer;
    TEMImporter* m_temImporter;
    ImageRegistration* m_registration;
    TemperatureCalibration* m_calibration;
    TemperatureFieldAnalyzer* m_fieldAnalyzer;
    TimeSeriesAnalyzer* m_timeSeriesAnalyzer;
    WaterStructureLocalizer* m_localizer;
    CrossValidationAnalyzer* m_crossAnalyzer;
    ReportGenerator* m_reportGenerator;

    TemperatureViewer* m_temperatureViewer;
    TimeSeriesChart* m_timeSeriesChart;
    ReportPreview* m_reportPreview;
    FusionViewer* m_fusionViewer;
    Geological3DView* m_geological3DView;
    QSlider* m_frameSlider;
    QLabel* m_frameInfoLabel;
    QTableWidget* m_anomalyTable;
    QTableWidget* m_drillingTable;
    QProgressBar* m_progressBar;
    QTabWidget* m_tabWidget;

    QAction* m_importAction;
    QAction* m_importTEMAction;
    QAction* m_analyzeAction;
    QAction* m_crossValidateAction;
    QAction* m_build3DAction;
    QAction* m_exportAction;
    QAction* m_exitAction;

    QCheckBox* m_enableRegistration;
    QCheckBox* m_enableCalibration;
    QDoubleSpinBox* m_emissivitySpin;
    QDoubleSpinBox* m_reflectedTempSpin;
    QDoubleSpinBox* m_atmosphericTempSpin;
    QDoubleSpinBox* m_distanceSpin;
    QDoubleSpinBox* m_humiditySpin;
    QDoubleSpinBox* m_anomalyThresholdSpin;
    QSpinBox* m_tunnelWidthSpin;
    QSpinBox* m_tunnelHeightSpin;
    QDoubleSpinBox* m_faceDistanceSpin;
    QDoubleSpinBox* m_dipAngleSpin;
    QDoubleSpinBox* m_strikeAngleSpin;
    QLineEdit* m_projectNameEdit;
    QLineEdit* m_tunnelNameEdit;

    QButtonGroup* m_displayModeGroup;
    QCheckBox* m_cutPlaneXCheck;
    QCheckBox* m_cutPlaneYCheck;
    QCheckBox* m_cutPlaneZCheck;
    QSlider* m_cutPlaneXSlider;
    QSlider* m_cutPlaneYSlider;
    QSlider* m_cutPlaneZSlider;
    QLabel* m_fusionInfoLabel;
};

#endif
