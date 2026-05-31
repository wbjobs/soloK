#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <opencv2/opencv.hpp>
#include "core/SpeckleProcessor.h"
#include "core/PhaseUnwrapper.h"
#include "core/StrainCalculator.h"
#include "core/ImageRegistrar.h"
#include "core/Calibrator.h"
#include "core/DICProcessor.h"
#include "core/FusionProcessor.h"
#include "core/StrainDecomposer.h"
#include "io/VideoSource.h"

class QLabel;
class QStatusBar;
class QToolBar;
class QDockWidget;
class QAction;
class QProgressBar;
class QComboBox;
class QDoubleSpinBox;
class QCheckBox;
class QSpinBox;

class ImageViewer;
class ROISelector;
class TimeHistoryWidget;

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);
    ~MainWindow();

private slots:
    void onLoadReference();
    void onLoadDeformed();
    void onOpenCamera();
    void onOpenVideo();
    void onOpenImageSequence();
    void onProcess();
    void onCalibrate();
    void onExport();
    void onToggleLiveMode();
    void onCaptureFrame();

    void onFrameReceived(const cv::Mat& frame, int frameIndex);
    void onProcessingFinished(const SpeckleProcessor::Result& result);
    void onStrainFinished(const StrainCalculator::StrainResult& strain);
    void onMouseMoved(const QPoint& imagePos, double value);
    void onROISelected(const QRect& roi);
    void onReferencePointSet(const QPoint& point);
    void onCalibrationChanged();

    void onColorRangeChanged();
    void onColorTypeChanged(int index);
    void onOverlayAlphaChanged(double value);
    void onDisplayModeChanged(int index);

    void onStartTimeHistory();
    void onStopTimeHistory();

    void onRunDIC();
    void onRunFusion();
    void onRunDecomposition();
    void onDICFinished(const DICProcessor::DICResult& result);
    void onFusionFinished(const FusionProcessor::FusionResult& result);
    void onDecompositionFinished(const StrainDecomposer::DecompositionResult& result);

    void onAbout();

protected:
    void closeEvent(QCloseEvent* event) override;

private:
    void setupUI();
    void createActions();
    void createMenuBar();
    void createToolBar();
    void createStatusBar();
    void createDockWidgets();
    void updateUIState();
    void processImages();
    void applyCalibrationToDisplay();

    cv::Mat m_referenceImage;
    cv::Mat m_deformedImage;
    cv::Mat m_currentFrame;
    SpeckleProcessor::Result m_speckleResult;
    StrainCalculator::StrainResult m_strainResult;
    StrainCalculator::ROIResult m_roiResult;
    bool m_hasROI;

    SpeckleProcessor* m_speckleProcessor;
    PhaseUnwrapper* m_phaseUnwrapper;
    StrainCalculator* m_strainCalculator;
    ImageRegistrar* m_imageRegistrar;
    Calibrator* m_calibrator;
    DICProcessor* m_dicProcessor;
    FusionProcessor* m_fusionProcessor;
    StrainDecomposer* m_strainDecomposer;
    VideoSource* m_videoSource;

    DICProcessor::DICResult m_dicResult;
    FusionProcessor::FusionResult m_fusionResult;
    StrainDecomposer::DecompositionResult m_decompositionResult;
    bool m_hasDICResult;
    bool m_hasFusionResult;
    bool m_hasDecompositionResult;

    ImageViewer* m_imageViewer;
    ROISelector* m_roiSelector;
    TimeHistoryWidget* m_timeHistoryWidget;

    QLabel* m_labelStatus;
    QLabel* m_labelCoordinates;
    QLabel* m_labelValue;
    QProgressBar* m_progressBar;

    QAction* m_actLoadRef;
    QAction* m_actLoadDef;
    QAction* m_actOpenCamera;
    QAction* m_actOpenVideo;
    QAction* m_actOpenSeq;
    QAction* m_actProcess;
    QAction* m_actCalibrate;
    QAction* m_actExport;
    QAction* m_actLiveMode;
    QAction* m_actCapture;
    QAction* m_actAbout;
    QAction* m_actExit;
    QAction* m_actRunDIC;
    QAction* m_actRunFusion;
    QAction* m_actRunDecomposition;

    QDockWidget* m_dockControl;
    QDockWidget* m_dockROI;
    QDockWidget* m_dockTimeHistory;

    QComboBox* m_comboMethod;
    QComboBox* m_comboUnwrapMethod;
    QComboBox* m_comboRegMethod;
    QComboBox* m_comboDisplayMode;
    QComboBox* m_comboColorType;

    QSpinBox* m_spinWindowSize;
    QSpinBox* m_spinSearchRange;
    QDoubleSpinBox* m_spinColorMin;
    QDoubleSpinBox* m_spinColorMax;
    QDoubleSpinBox* m_spinOverlayAlpha;

    QCheckBox* m_chkSubpixel;
    QCheckBox* m_chkHighPass;
    QCheckBox* m_chkLowPass;
    QCheckBox* m_chkRegister;

    QToolBar* m_toolBar;
    QStatusBar* m_statusBar;

    bool m_liveMode;
    bool m_isProcessing;
    int m_frameCount;
};

#endif
