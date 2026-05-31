#include "gui/MainWindow.h"
#include "gui/ImageViewer.h"
#include "gui/ROISelector.h"
#include "gui/TimeHistoryWidget.h"
#include "gui/CalibrationDialog.h"
#include "gui/ExportDialog.h"
#include "io/DataExporter.h"
#include "utils/ColorMap.h"

#include <QMenuBar>
#include <QToolBar>
#include <QStatusBar>
#include <QDockWidget>
#include <QFileDialog>
#include <QMessageBox>
#include <QComboBox>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QCheckBox>
#include <QLabel>
#include <QProgressBar>
#include <QGroupBox>
#include <QFormLayout>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QCloseEvent>
#include <QApplication>
#include <QDateTime>

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
    , m_speckleResult()
    , m_strainResult()
    , m_roiResult()
    , m_hasROI(false)
    , m_speckleProcessor(new SpeckleProcessor(this))
    , m_phaseUnwrapper(new PhaseUnwrapper(this))
    , m_strainCalculator(new StrainCalculator(this))
    , m_imageRegistrar(new ImageRegistrar(this))
    , m_calibrator(new Calibrator(this))
    , m_dicProcessor(new DICProcessor(this))
    , m_fusionProcessor(new FusionProcessor(this))
    , m_strainDecomposer(new StrainDecomposer(this))
    , m_videoSource(new VideoSource(this))
    , m_dicResult()
    , m_fusionResult()
    , m_decompositionResult()
    , m_hasDICResult(false)
    , m_hasFusionResult(false)
    , m_hasDecompositionResult(false)
    , m_imageViewer(nullptr)
    , m_roiSelector(nullptr)
    , m_timeHistoryWidget(nullptr)
    , m_liveMode(false)
    , m_isProcessing(false)
    , m_frameCount(0)
{
    setupUI();
    createActions();
    createMenuBar();
    createToolBar();
    createStatusBar();
    createDockWidgets();

    connect(m_speckleProcessor, &SpeckleProcessor::progress, m_progressBar, &QProgressBar::setValue);
    connect(m_speckleProcessor, &SpeckleProcessor::finished,
            this, &MainWindow::onProcessingFinished);
    connect(m_strainCalculator, &StrainCalculator::finished,
            this, &MainWindow::onStrainFinished);
    connect(m_calibrator, &Calibrator::calibrationChanged,
            this, &MainWindow::onCalibrationChanged);
    connect(m_videoSource, &VideoSource::frameReceived,
            this, &MainWindow::onFrameReceived);
    connect(m_videoSource, &VideoSource::error,
            this, [this](const QString& msg) { QMessageBox::warning(this, tr("Error"), msg); });

    setWindowTitle(tr("Laser Speckle Interferometry - Strain Measurement System"));
    resize(1400, 900);
    updateUIState();
}

MainWindow::~MainWindow() = default;

void MainWindow::setupUI() {
    m_imageViewer = new ImageViewer(this);
    setCentralWidget(m_imageViewer);

    connect(m_imageViewer, &ImageViewer::mouseMoved, this, &MainWindow::onMouseMoved);
    connect(m_imageViewer, &ImageViewer::roiSet, this, &MainWindow::onROISelected);
    connect(m_imageViewer, &ImageViewer::referencePointSet, this, &MainWindow::onReferencePointSet);
}

void MainWindow::createActions() {
    m_actLoadRef = new QAction(tr("Load Reference Image"), this);
    m_actLoadRef->setShortcut(QKeySequence("Ctrl+O"));
    m_actLoadRef->setStatusTip(tr("Load the reference (before-load) speckle image"));
    connect(m_actLoadRef, &QAction::triggered, this, &MainWindow::onLoadReference);

    m_actLoadDef = new QAction(tr("Load Deformed Image"), this);
    m_actLoadDef->setShortcut(QKeySequence("Ctrl+Shift+O"));
    m_actLoadDef->setStatusTip(tr("Load the deformed (after-load) speckle image"));
    connect(m_actLoadDef, &QAction::triggered, this, &MainWindow::onLoadDeformed);

    m_actOpenCamera = new QAction(tr("Open Camera"), this);
    m_actOpenCamera->setStatusTip(tr("Open live camera for real-time acquisition"));
    connect(m_actOpenCamera, &QAction::triggered, this, &MainWindow::onOpenCamera);

    m_actOpenVideo = new QAction(tr("Open Video File"), this);
    m_actOpenVideo->setStatusTip(tr("Open a video file for processing"));
    connect(m_actOpenVideo, &QAction::triggered, this, &MainWindow::onOpenVideo);

    m_actOpenSeq = new QAction(tr("Open Image Sequence"), this);
    m_actOpenSeq->setStatusTip(tr("Open a directory of image sequence"));
    connect(m_actOpenSeq, &QAction::triggered, this, &MainWindow::onOpenImageSequence);

    m_actProcess = new QAction(tr("Process"), this);
    m_actProcess->setShortcut(QKeySequence("F5"));
    m_actProcess->setStatusTip(tr("Run speckle interferometry processing"));
    connect(m_actProcess, &QAction::triggered, this, &MainWindow::onProcess);

    m_actCalibrate = new QAction(tr("Calibrate"), this);
    m_actCalibrate->setShortcut(QKeySequence("F6"));
    m_actCalibrate->setStatusTip(tr("System calibration setup"));
    connect(m_actCalibrate, &QAction::triggered, this, &MainWindow::onCalibrate);

    m_actExport = new QAction(tr("Export"), this);
    m_actExport->setShortcut(QKeySequence("Ctrl+E"));
    m_actExport->setStatusTip(tr("Export results to various formats"));
    connect(m_actExport, &QAction::triggered, this, &MainWindow::onExport);

    m_actLiveMode = new QAction(tr("Live Mode"), this);
    m_actLiveMode->setCheckable(true);
    m_actLiveMode->setStatusTip(tr("Toggle real-time processing mode"));
    connect(m_actLiveMode, &QAction::toggled, this, &MainWindow::onToggleLiveMode);

    m_actCapture = new QAction(tr("Capture Frame"), this);
    m_actCapture->setShortcut(QKeySequence("Space"));
    m_actCapture->setStatusTip(tr("Capture current frame as reference or deformed"));
    connect(m_actCapture, &QAction::triggered, this, &MainWindow::onCaptureFrame);

    m_actRunDIC = new QAction(tr("Run DIC"), this);
    m_actRunDIC->setStatusTip(tr("Run digital image correlation"));
    connect(m_actRunDIC, &QAction::triggered, this, &MainWindow::onRunDIC);

    m_actRunFusion = new QAction(tr("Run Fusion"), this);
    m_actRunFusion->setStatusTip(tr("Fuse interferometry and DIC results"));
    connect(m_actRunFusion, &QAction::triggered, this, &MainWindow::onRunFusion);

    m_actRunDecomposition = new QAction(tr("Strain Decomposition"), this);
    m_actRunDecomposition->setStatusTip(tr("Decompose strain into elastic and plastic components"));
    connect(m_actRunDecomposition, &QAction::triggered, this, &MainWindow::onRunDecomposition);

    m_actAbout = new QAction(tr("About"), this);
    m_actAbout->setStatusTip(tr("About this application"));
    connect(m_actAbout, &QAction::triggered, this, &MainWindow::onAbout);

    m_actExit = new QAction(tr("Exit"), this);
    m_actExit->setShortcut(QKeySequence("Ctrl+Q"));
    connect(m_actExit, &QAction::triggered, this, &QWidget::close);
}

void MainWindow::createMenuBar() {
    QMenuBar* bar = menuBar();

    QMenu* fileMenu = bar->addMenu(tr("&File"));
    fileMenu->addAction(m_actLoadRef);
    fileMenu->addAction(m_actLoadDef);
    fileMenu->addSeparator();
    fileMenu->addAction(m_actOpenCamera);
    fileMenu->addAction(m_actOpenVideo);
    fileMenu->addAction(m_actOpenSeq);
    fileMenu->addSeparator();
    fileMenu->addAction(m_actExport);
    fileMenu->addSeparator();
    fileMenu->addAction(m_actExit);

    QMenu* processMenu = bar->addMenu(tr("&Processing"));
    processMenu->addAction(m_actProcess);
    processMenu->addAction(m_actRunDIC);
    processMenu->addAction(m_actRunFusion);
    processMenu->addAction(m_actRunDecomposition);
    processMenu->addSeparator();
    processMenu->addAction(m_actLiveMode);
    processMenu->addAction(m_actCapture);

    QMenu* toolsMenu = bar->addMenu(tr("&Tools"));
    toolsMenu->addAction(m_actCalibrate);

    QMenu* helpMenu = bar->addMenu(tr("&Help"));
    helpMenu->addAction(m_actAbout);
}

void MainWindow::createToolBar() {
    m_toolBar = addToolBar(tr("Main"));
    m_toolBar->setIconSize(QSize(24, 24));
    m_toolBar->addAction(m_actLoadRef);
    m_toolBar->addAction(m_actLoadDef);
    m_toolBar->addSeparator();
    m_toolBar->addAction(m_actOpenCamera);
    m_toolBar->addAction(m_actOpenVideo);
    m_toolBar->addSeparator();
    m_toolBar->addAction(m_actProcess);
    m_toolBar->addAction(m_actRunDIC);
    m_toolBar->addAction(m_actRunFusion);
    m_toolBar->addAction(m_actRunDecomposition);
    m_toolBar->addAction(m_actLiveMode);
    m_toolBar->addAction(m_actCapture);
    m_toolBar->addSeparator();
    m_toolBar->addAction(m_actCalibrate);
    m_toolBar->addAction(m_actExport);
}

void MainWindow::createStatusBar() {
    m_statusBar = statusBar();
    m_labelStatus = new QLabel(tr("Ready"), this);
    m_labelCoordinates = new QLabel(tr("X: -- Y: --"), this);
    m_labelCoordinates->setMinimumWidth(120);
    m_labelValue = new QLabel(tr("Val: --"), this);
    m_labelValue->setMinimumWidth(150);
    m_progressBar = new QProgressBar(this);
    m_progressBar->setMaximumWidth(200);
    m_progressBar->setVisible(false);

    m_statusBar->addWidget(m_labelStatus, 1);
    m_statusBar->addWidget(m_labelCoordinates);
    m_statusBar->addWidget(m_labelValue);
    m_statusBar->addPermanentWidget(m_progressBar);
}

void MainWindow::createDockWidgets() {
    m_dockControl = new QDockWidget(tr("Processing Control"), this);
    m_dockControl->setAllowedAreas(Qt::LeftDockWidgetArea | Qt::RightDockWidgetArea);

    auto* controlWidget = new QWidget(m_dockControl);
    auto* controlLayout = new QVBoxLayout(controlWidget);

    auto* methodGroup = new QGroupBox(tr("Speckle Method"), controlWidget);
    auto* methodLayout = new QFormLayout(methodGroup);
    m_comboMethod = new QComboBox(methodGroup);
    m_comboMethod->addItem(tr("FFT Phase"), SpeckleProcessor::FFT_Phase);
    m_comboMethod->addItem(tr("Correlation"), SpeckleProcessor::Correlation);
    methodLayout->addRow(tr("Method:"), m_comboMethod);
    controlLayout->addWidget(methodGroup);

    auto* paramGroup = new QGroupBox(tr("Parameters"), controlWidget);
    auto* paramLayout = new QFormLayout(paramGroup);
    m_spinWindowSize = new QSpinBox(paramGroup);
    m_spinWindowSize->setRange(8, 256);
    m_spinWindowSize->setValue(32);
    m_spinWindowSize->setSingleStep(8);
    paramLayout->addRow(tr("Window Size:"), m_spinWindowSize);

    m_spinSearchRange = new QSpinBox(paramGroup);
    m_spinSearchRange->setRange(4, 128);
    m_spinSearchRange->setValue(16);
    paramLayout->addRow(tr("Search Range:"), m_spinSearchRange);

    m_chkSubpixel = new QCheckBox(tr("Sub-pixel accuracy"), paramGroup);
    m_chkSubpixel->setChecked(true);
    paramLayout->addRow(m_chkSubpixel);

    m_chkHighPass = new QCheckBox(tr("FFT High-pass filter"), paramGroup);
    m_chkHighPass->setChecked(true);
    paramLayout->addRow(m_chkHighPass);

    m_chkLowPass = new QCheckBox(tr("FFT Low-pass filter"), paramGroup);
    m_chkLowPass->setChecked(true);
    paramLayout->addRow(m_chkLowPass);
    controlLayout->addWidget(paramGroup);

    auto* unwrapGroup = new QGroupBox(tr("Phase Unwrapping"), controlWidget);
    auto* unwrapLayout = new QFormLayout(unwrapGroup);
    m_comboUnwrapMethod = new QComboBox(unwrapGroup);
    m_comboUnwrapMethod->addItem(tr("Simple Row-Column"), PhaseUnwrapper::SimpleRowColumn);
    m_comboUnwrapMethod->addItem(tr("Least Squares"), PhaseUnwrapper::LeastSquares);
    m_comboUnwrapMethod->addItem(tr("Branch Cut"), PhaseUnwrapper::BranchCut);
    m_comboUnwrapMethod->addItem(tr("Quality Guided"), PhaseUnwrapper::QualityGuided);
    unwrapLayout->addRow(tr("Method:"), m_comboUnwrapMethod);
    controlLayout->addWidget(unwrapGroup);

    auto* regGroup = new QGroupBox(tr("Image Registration"), controlWidget);
    auto* regLayout = new QFormLayout(regGroup);
    m_chkRegister = new QCheckBox(tr("Enable registration"), regGroup);
    m_chkRegister->setChecked(false);
    regLayout->addRow(m_chkRegister);

    m_comboRegMethod = new QComboBox(regGroup);
    m_comboRegMethod->addItem(tr("Phase Correlation"), ImageRegistrar::PhaseCorrelation);
    m_comboRegMethod->addItem(tr("ECC"), ImageRegistrar::ECC);
    m_comboRegMethod->addItem(tr("Feature-based"), ImageRegistrar::FeatureBased);
    m_comboRegMethod->addItem(tr("Optical Flow"), ImageRegistrar::OpticalFlow);
    regLayout->addRow(tr("Method:"), m_comboRegMethod);
    regLayout->addRow(m_comboRegMethod);
    controlLayout->addWidget(regGroup);

    controlLayout->addStretch();
    m_dockControl->setWidget(controlWidget);
    addDockWidget(Qt::LeftDockWidgetArea, m_dockControl);

    m_dockROI = new QDockWidget(tr("ROI Analysis"), this);
    m_dockROI->setAllowedAreas(Qt::RightDockWidgetArea | Qt::BottomDockWidgetArea);
    m_roiSelector = new ROISelector(m_dockROI);
    m_dockROI->setWidget(m_roiSelector);
    addDockWidget(Qt::RightDockWidgetArea, m_dockROI);

    m_dockTimeHistory = new QDockWidget(tr("Time History"), this);
    m_dockTimeHistory->setAllowedAreas(Qt::BottomDockWidgetArea);
    m_timeHistoryWidget = new TimeHistoryWidget(m_dockTimeHistory);
    m_dockTimeHistory->setWidget(m_timeHistoryWidget);
    addDockWidget(Qt::BottomDockWidgetArea, m_dockTimeHistory);

    auto* displayDock = new QDockWidget(tr("Display"), this);
    displayDock->setAllowedAreas(Qt::RightDockWidgetArea);
    auto* displayWidget = new QWidget(displayDock);
    auto* displayLayout = new QVBoxLayout(displayWidget);

    auto* displayGroup = new QGroupBox(tr("Display Mode"), displayWidget);
    auto* displayForm = new QFormLayout(displayGroup);
    m_comboDisplayMode = new QComboBox(displayGroup);
    m_comboDisplayMode->addItem(tr("Original Image"), ImageViewer::Original);
    m_comboDisplayMode->addItem(tr("Phase Map"), ImageViewer::PhaseMap);
    m_comboDisplayMode->addItem(tr("Strain Exx"), ImageViewer::StrainExx);
    m_comboDisplayMode->addItem(tr("Strain Eyy"), ImageViewer::StrainEyy);
    m_comboDisplayMode->addItem(tr("Strain Exy"), ImageViewer::StrainExy);
    m_comboDisplayMode->addItem(tr("Principal E1"), ImageViewer::StrainE1);
    m_comboDisplayMode->addItem(tr("Principal E2"), ImageViewer::StrainE2);
    m_comboDisplayMode->addItem(tr("Max Shear"), ImageViewer::StrainMaxShear);
    m_comboDisplayMode->addItem(tr("Von Mises"), ImageViewer::StrainVonMises);
    m_comboDisplayMode->addItem(tr("Principal Angle"), ImageViewer::PrincipalAngle);
    m_comboDisplayMode->addItem(tr("DIC Disp X"), ImageViewer::DICDisplacementX);
    m_comboDisplayMode->addItem(tr("DIC Disp Y"), ImageViewer::DICDisplacementY);
    m_comboDisplayMode->addItem(tr("DIC Correlation"), ImageViewer::DICCorrelation);
    m_comboDisplayMode->addItem(tr("Fused Disp X"), ImageViewer::FusedDisplacementX);
    m_comboDisplayMode->addItem(tr("Fused Disp Y"), ImageViewer::FusedDisplacementY);
    m_comboDisplayMode->addItem(tr("Fused Magnitude"), ImageViewer::FusedMagnitude);
    m_comboDisplayMode->addItem(tr("Int Weight"), ImageViewer::InterferometryWeight);
    m_comboDisplayMode->addItem(tr("DIC Weight"), ImageViewer::DICWeight);
    m_comboDisplayMode->addItem(tr("Elastic Exx"), ImageViewer::ElasticExx);
    m_comboDisplayMode->addItem(tr("Elastic Eyy"), ImageViewer::ElasticEyy);
    m_comboDisplayMode->addItem(tr("Elastic Exy"), ImageViewer::ElasticExy);
    m_comboDisplayMode->addItem(tr("Elastic Von Mises"), ImageViewer::ElasticVonMises);
    m_comboDisplayMode->addItem(tr("Plastic Exx"), ImageViewer::PlasticExx);
    m_comboDisplayMode->addItem(tr("Plastic Eyy"), ImageViewer::PlasticEyy);
    m_comboDisplayMode->addItem(tr("Plastic Exy"), ImageViewer::PlasticExy);
    m_comboDisplayMode->addItem(tr("Plastic Von Mises"), ImageViewer::PlasticVonMises);
    m_comboDisplayMode->addItem(tr("Plastic Zone"), ImageViewer::PlasticZone);
    displayForm->addRow(tr("Mode:"), m_comboDisplayMode);
    displayLayout->addWidget(displayGroup);

    auto* colorGroup = new QGroupBox(tr("Color Map"), displayWidget);
    auto* colorForm = new QFormLayout(colorGroup);
    m_comboColorType = new QComboBox(colorGroup);
    m_comboColorType->addItem("Jet", ColorMap::Jet);
    m_comboColorType->addItem("Viridis", ColorMap::Viridis);
    m_comboColorType->addItem("Hot", ColorMap::Hot);
    m_comboColorType->addItem("Cool", ColorMap::Cool);
    m_comboColorType->addItem("Rainbow", ColorMap::Rainbow);
    m_comboColorType->addItem("Parula", ColorMap::Parula);
    colorForm->addRow(tr("Colormap:"), m_comboColorType);

    m_spinColorMin = new QDoubleSpinBox(colorGroup);
    m_spinColorMin->setRange(-1e9, 1e9);
    m_spinColorMin->setDecimals(6);
    m_spinColorMin->setSingleStep(0.001);
    colorForm->addRow(tr("Color Min:"), m_spinColorMin);

    m_spinColorMax = new QDoubleSpinBox(colorGroup);
    m_spinColorMax->setRange(-1e9, 1e9);
    m_spinColorMax->setDecimals(6);
    m_spinColorMax->setSingleStep(0.001);
    colorForm->addRow(tr("Color Max:"), m_spinColorMax);

    m_spinOverlayAlpha = new QDoubleSpinBox(colorGroup);
    m_spinOverlayAlpha->setRange(0.0, 1.0);
    m_spinOverlayAlpha->setSingleStep(0.1);
    m_spinOverlayAlpha->setValue(0.5);
    m_spinOverlayAlpha->setDecimals(2);
    colorForm->addRow(tr("Overlay Alpha:"), m_spinOverlayAlpha);

    displayLayout->addWidget(colorGroup);
    displayLayout->addStretch();

    displayDock->setWidget(displayWidget);
    addDockWidget(Qt::RightDockWidgetArea, displayDock);

    connect(m_comboMethod, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this](int idx) {
        m_speckleProcessor->setMethod(static_cast<SpeckleProcessor::Method>(m_comboMethod->itemData(idx).toInt()));
    });
    connect(m_spinWindowSize, QOverload<int>::of(&QSpinBox::valueChanged),
            m_speckleProcessor, &SpeckleProcessor::setWindowSize);
    connect(m_spinSearchRange, QOverload<int>::of(&QSpinBox::valueChanged),
            m_speckleProcessor, &SpeckleProcessor::setSearchRange);
    connect(m_chkSubpixel, &QCheckBox::toggled,
            m_speckleProcessor, &SpeckleProcessor::setSubpixelEnabled);
    connect(m_chkHighPass, &QCheckBox::toggled,
            m_speckleProcessor, &SpeckleProcessor::setFFTHighPass);
    connect(m_chkLowPass, &QCheckBox::toggled,
            m_speckleProcessor, &SpeckleProcessor::setFFTLowPass);
    connect(m_comboUnwrapMethod, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this](int idx) {
        m_phaseUnwrapper->setMethod(static_cast<PhaseUnwrapper::Method>(m_comboUnwrapMethod->itemData(idx).toInt()));
    });
    connect(m_comboRegMethod, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this](int idx) {
        m_imageRegistrar->setMethod(static_cast<ImageRegistrar::Method>(m_comboRegMethod->itemData(idx).toInt()));
    });

    connect(m_comboDisplayMode, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onDisplayModeChanged);
    connect(m_comboColorType, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onColorTypeChanged);
    connect(m_spinColorMin, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &MainWindow::onColorRangeChanged);
    connect(m_spinColorMax, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &MainWindow::onColorRangeChanged);
    connect(m_spinOverlayAlpha, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &MainWindow::onOverlayAlphaChanged);

    connect(m_timeHistoryWidget, &TimeHistoryWidget::recordingStarted,
            this, &MainWindow::onStartTimeHistory);
    connect(m_timeHistoryWidget, &TimeHistoryWidget::recordingStopped,
            this, &MainWindow::onStopTimeHistory);
}

void MainWindow::updateUIState() {
    bool hasRef = !m_referenceImage.empty();
    bool hasDef = !m_deformedImage.empty();
    bool canProcess = hasRef && hasDef && !m_isProcessing;

    m_actProcess->setEnabled(canProcess);
    m_actCapture->setEnabled(m_videoSource->isOpened());
    m_actExport->setEnabled(m_strainResult.valid || !m_referenceImage.empty());
    m_comboDisplayMode->setEnabled(true);
}

void MainWindow::onLoadReference() {
    QString path = QFileDialog::getOpenFileName(
        this, tr("Load Reference Image"), "",
        tr("Images (*.png *.jpg *.jpeg *.bmp *.tif *.tiff *.pgm)"));
    if (path.isEmpty()) return;

    cv::Mat img = cv::imread(path.toStdString(), cv::IMREAD_GRAYSCALE);
    if (img.empty()) {
        QMessageBox::warning(this, tr("Error"), tr("Failed to load image: %1").arg(path));
        return;
    }

    m_referenceImage = img;
    m_imageViewer->setImage(m_referenceImage);
    m_comboDisplayMode->setCurrentIndex(0);
    m_labelStatus->setText(tr("Reference image loaded: %1").arg(QFileInfo(path).fileName()));
    updateUIState();
}

void MainWindow::onLoadDeformed() {
    QString path = QFileDialog::getOpenFileName(
        this, tr("Load Deformed Image"), "",
        tr("Images (*.png *.jpg *.jpeg *.bmp *.tif *.tiff *.pgm)"));
    if (path.isEmpty()) return;

    cv::Mat img = cv::imread(path.toStdString(), cv::IMREAD_GRAYSCALE);
    if (img.empty()) {
        QMessageBox::warning(this, tr("Error"), tr("Failed to load image: %1").arg(path));
        return;
    }

    m_deformedImage = img;
    m_labelStatus->setText(tr("Deformed image loaded: %1").arg(QFileInfo(path).fileName()));
    updateUIState();
}

void MainWindow::onOpenCamera() {
    if (m_videoSource->openCamera(0)) {
        m_videoSource->startCapture();
        m_actLiveMode->setEnabled(true);
        m_labelStatus->setText(tr("Camera opened"));
    } else {
        QMessageBox::warning(this, tr("Error"), tr("Failed to open camera"));
    }
    updateUIState();
}

void MainWindow::onOpenVideo() {
    QString path = QFileDialog::getOpenFileName(
        this, tr("Open Video File"), "",
        tr("Videos (*.avi *.mp4 *.mov *.mkv *.wmv)"));
    if (path.isEmpty()) return;

    if (m_videoSource->openVideo(path)) {
        m_videoSource->startCapture();
        m_actLiveMode->setEnabled(true);
        m_labelStatus->setText(tr("Video loaded: %1").arg(QFileInfo(path).fileName()));
    } else {
        QMessageBox::warning(this, tr("Error"), tr("Failed to open video"));
    }
    updateUIState();
}

void MainWindow::onOpenImageSequence() {
    QString dir = QFileDialog::getExistingDirectory(this, tr("Select Image Directory"));
    if (dir.isEmpty()) return;

    if (m_videoSource->openImageSequence(dir)) {
        m_videoSource->startCapture();
        m_actLiveMode->setEnabled(true);
        m_labelStatus->setText(tr("Image sequence loaded from: %1").arg(dir));
    } else {
        QMessageBox::warning(this, tr("Error"), tr("Failed to load image sequence"));
    }
    updateUIState();
}

void MainWindow::onProcess() {
    if (m_referenceImage.empty() || m_deformedImage.empty()) {
        QMessageBox::information(this, tr("Info"), tr("Please load both reference and deformed images first."));
        return;
    }

    m_isProcessing = true;
    m_progressBar->setVisible(true);
    m_progressBar->setRange(0, 100);
    m_labelStatus->setText(tr("Processing..."));

    processImages();
}

void MainWindow::processImages() {
    cv::Mat ref = m_referenceImage.clone();
    cv::Mat def = m_deformedImage.clone();

    if (m_chkRegister->isChecked()) {
        auto regResult = m_imageRegistrar->registerImages(ref, def);
        if (regResult.success) {
            def = regResult.warped;
            m_labelStatus->setText(tr("Registration: dx=%1, dy=%2, rot=%3 deg")
                                   .arg(regResult.dx, 0, 'f', 2)
                                   .arg(regResult.dy, 0, 'f', 2)
                                   .arg(regResult.rotationAngle, 0, 'f', 2));
        }
    }

    m_speckleProcessor->process(ref, def);
}

void MainWindow::onProcessingFinished(const SpeckleProcessor::Result& result) {
    m_speckleResult = result;

    if (!result.valid) {
        m_isProcessing = false;
        m_progressBar->setVisible(false);
        QMessageBox::warning(this, tr("Error"), result.errorMessage);
        return;
    }

    m_imageViewer->setPhaseMap(result.phaseMap);
    m_imageViewer->setStrainData(StrainCalculator::StrainResult());

    m_strainCalculator->compute(result.displacementX, result.displacementY,
                                m_calibrator->conversionFactor());
}

void MainWindow::onStrainFinished(const StrainCalculator::StrainResult& strain) {
    m_strainResult = strain;
    m_isProcessing = false;
    m_progressBar->setVisible(false);
    m_progressBar->setValue(0);

    m_imageViewer->setStrainData(strain);
    if (m_comboDisplayMode->currentIndex() == 0) {
        m_comboDisplayMode->setCurrentIndex(static_cast<int>(ImageViewer::StrainVonMises));
    }

    if (m_hasROI) {
        m_roiResult = StrainCalculator::computeROIStatistics(strain, m_roiSelector->currentROI().rect);
    }

    m_labelStatus->setText(tr("Processing complete. Avg Exx=%1, Eyy=%2, VonMises=%3")
                           .arg(strain.averageExx, 0, 'e', 3)
                           .arg(strain.averageEyy, 0, 'e', 3)
                           .arg(strain.averageVonMises, 0, 'e', 3));
    updateUIState();
}

void MainWindow::onCalibrate() {
    CalibrationDialog dlg(m_calibrator, this);
    if (dlg.exec() == QDialog::Accepted) {
        onCalibrationChanged();
        m_labelStatus->setText(tr("Calibration updated: %1 px = %2 %3")
                               .arg(m_calibrator->data().referenceLengthPixels, 0, 'f', 1)
                               .arg(m_calibrator->data().referenceLengthPhysical, 0, 'f', 4)
                               .arg(m_calibrator->physicalUnit()));
    }
}

void MainWindow::onExport() {
    ExportDialog::ExportConfig config;
    config.originalImage = m_referenceImage;
    config.displacementX = m_speckleResult.displacementX;
    config.displacementY = m_speckleResult.displacementY;
    config.strain = m_strainResult;
    config.roiResult = m_roiResult;
    config.hasROI = m_hasROI;

    ExportDialog dlg(config, this);
    if (dlg.exec() != QDialog::Accepted) return;

    QString format = dlg.selectedFormat();
    QString path = dlg.filePath();

    DataExporter exporter(this);
    bool ok = false;

    if (format == "vtk") {
        ok = exporter.exportVTK(path, m_speckleResult.displacementX,
                                m_speckleResult.displacementY, m_strainResult,
                                m_calibrator->conversionFactor());
    } else if (format == "csv") {
        DataExporter::ExportOptions options;
        options.filePath = path;
        options.format = DataExporter::CSV;
        options.includeCoordinates = dlg.includeCoordinates();
        options.includeDisplacement = dlg.includeDisplacement();
        options.includeStrain = dlg.includeStrain();
        options.includePrincipal = dlg.includePrincipal();
        options.includeVonMises = dlg.includeVonMises();
        ok = exporter.exportCSV(path, m_speckleResult.displacementX,
                                m_speckleResult.displacementY, m_strainResult, options);
    } else if (format == "pdf") {
        cv::Mat colored = m_imageViewer->currentColoredImage();
        ok = exporter.exportPDF(path, m_referenceImage, colored, m_strainResult,
                               m_hasROI ? &m_roiResult : nullptr);
    } else if (format == "png") {
        cv::Mat colored = m_imageViewer->currentColoredImage();
        ok = exporter.exportImage(path, colored, dlg.dpi());
    }

    if (ok) {
        m_labelStatus->setText(tr("Export successful: %1").arg(path));
    } else {
        QMessageBox::warning(this, tr("Export"), tr("Export failed"));
    }
}

void MainWindow::onToggleLiveMode() {
    m_liveMode = m_actLiveMode->isChecked();
    if (m_liveMode) {
        m_labelStatus->setText(tr("Live mode enabled"));
    } else {
        m_labelStatus->setText(tr("Live mode disabled"));
    }
}

void MainWindow::onCaptureFrame() {
    if (!m_videoSource->isOpened() || m_currentFrame.empty()) return;

    if (m_referenceImage.empty()) {
        m_referenceImage = m_currentFrame.clone();
        m_imageViewer->setImage(m_referenceImage);
        m_labelStatus->setText(tr("Captured as reference image (frame %1)").arg(m_frameCount));
    } else if (m_deformedImage.empty()) {
        m_deformedImage = m_currentFrame.clone();
        m_labelStatus->setText(tr("Captured as deformed image (frame %1)").arg(m_frameCount));
    } else {
        m_deformedImage = m_currentFrame.clone();
        m_labelStatus->setText(tr("Updated deformed image (frame %1)").arg(m_frameCount));
    }
    updateUIState();
}

void MainWindow::onFrameReceived(const cv::Mat& frame, int frameIndex) {
    m_currentFrame = frame.clone();
    m_frameCount = frameIndex;

    cv::Mat displayFrame;
    if (frame.channels() == 1) {
        displayFrame = frame;
    } else {
        cv::cvtColor(frame, displayFrame, cv::COLOR_BGR2GRAY);
    }

    if (m_referenceImage.empty() && m_deformedImage.empty()) {
        m_imageViewer->setImage(displayFrame);
    }

    if (m_liveMode && !m_referenceImage.empty() && m_isProcessing == false) {
        m_deformedImage = displayFrame.clone();
        m_isProcessing = true;
        m_progressBar->setVisible(true);
        processImages();
    }

    m_labelStatus->setText(tr("Frame: %1").arg(frameIndex));
}

void MainWindow::onMouseMoved(const QPoint& imagePos, double value) {
    m_labelCoordinates->setText(tr("X: %1 Y: %2").arg(imagePos.x()).arg(imagePos.y()));
    m_labelValue->setText(tr("Val: %1").arg(value, 0, 'g', 6));
}

void MainWindow::onROISelected(const QRect& roi) {
    if (m_strainResult.valid && roi.width() > 5 && roi.height() > 5) {
        m_roiResult = StrainCalculator::computeROIStatistics(m_strainResult, roi);
        m_hasROI = true;

        QString name = QString("ROI_%1").arg(m_roiSelector->rois().size() + 1);
        m_roiSelector->addROI(roi, name);

        m_labelStatus->setText(tr("ROI set. Avg VonMises: %1").arg(m_roiResult.averageVonMises, 0, 'e', 3));
    }
}

void MainWindow::onReferencePointSet(const QPoint& point) {
    m_timeHistoryWidget->addPoint(point);
}

void MainWindow::onCalibrationChanged() {
    if (m_strainResult.valid) {
        m_strainCalculator->compute(m_speckleResult.displacementX, m_speckleResult.displacementY,
                                    m_calibrator->conversionFactor());
    }
}

void MainWindow::onColorRangeChanged() {
    m_imageViewer->setColorRange(m_spinColorMin->value(), m_spinColorMax->value());
}

void MainWindow::onColorTypeChanged(int index) {
    Q_UNUSED(index);
    m_imageViewer->setColorType(m_comboColorType->currentData().toInt());
}

void MainWindow::onOverlayAlphaChanged(double value) {
    Q_UNUSED(value);
    m_imageViewer->setOverlayAlpha(m_spinOverlayAlpha->value());
}

void MainWindow::onDisplayModeChanged(int index) {
    Q_UNUSED(index);
    auto mode = static_cast<ImageViewer::DisplayMode>(m_comboDisplayMode->currentData().toInt());
    m_imageViewer->setDisplayMode(mode);

    if (mode != ImageViewer::Original) {
        cv::Mat data;
        switch (mode) {
            case ImageViewer::StrainExx: data = m_strainResult.exx; break;
            case ImageViewer::StrainEyy: data = m_strainResult.eyy; break;
            case ImageViewer::StrainExy: data = m_strainResult.exy; break;
            case ImageViewer::StrainE1: data = m_strainResult.e1; break;
            case ImageViewer::StrainE2: data = m_strainResult.e2; break;
            case ImageViewer::StrainMaxShear: data = m_strainResult.maxShear; break;
            case ImageViewer::StrainVonMises: data = m_strainResult.vonMises; break;
            case ImageViewer::PrincipalAngle: data = m_strainResult.principalAngle; break;
            case ImageViewer::PhaseMap: data = m_speckleResult.phaseMap; break;
            default: break;
        }
        if (!data.empty()) {
            double minVal, maxVal;
            cv::minMaxLoc(data, &minVal, &maxVal);
            m_spinColorMin->setValue(minVal);
            m_spinColorMax->setValue(maxVal);
        }
    }
}

void MainWindow::onStartTimeHistory() {
    m_frameCount = 0;
}

void MainWindow::onStopTimeHistory() {
}

void MainWindow::onAbout() {
    QMessageBox::about(this, tr("About"),
        tr("<h2>Laser Speckle Interferometry</h2>"
           "<p>Version 1.1.0</p>"
           "<p>A desktop application for full-field strain measurement "
           "using digital speckle photography, Fourier-transform methods, "
           "and digital image correlation (DIC) with fusion.</p>"
           "<p><b>Technologies:</b> C++ / Qt 6 / OpenCV / FFTW3</p>"
           "<p><b>Features:</b></p>"
           "<ul>"
           "<li>Dual-exposure speckle image analysis</li>"
           "<li>Real-time video processing</li>"
           "<li>FFT phase extraction & phase unwrapping</li>"
           "<li>DIC displacement field computation</li>"
           "<li>Interferometry + DIC fusion (5 strategies)</li>"
           "<li>Elastic/plastic strain decomposition (4 methods)</li>"
           "<li>Displacement and strain field computation</li>"
           "<li>ROI analysis with principal strain calculation</li>"
           "<li>Time-history recording for creep/fatigue testing</li>"
           "<li>Export to VTK, CSV, PDF, and image formats</li>"
           "</ul>"));
}

void MainWindow::onRunDIC() {
    if (m_referenceImage.empty() || m_deformedImage.empty()) {
        QMessageBox::warning(this, tr("DIC"), tr("Please load reference and deformed images first."));
        return;
    }
    m_labelStatus->setText(tr("Running DIC..."));
    QApplication::processEvents();
    m_dicResult = m_dicProcessor->compute(m_referenceImage, m_deformedImage);
    m_hasDICResult = m_dicResult.valid;
    if (m_hasDICResult) {
        m_imageViewer->setDICResult(m_dicResult.displacementX, m_dicResult.displacementY,
                                     m_dicResult.correlationMap);
        m_comboDisplayMode->setCurrentIndex(m_comboDisplayMode->findData(ImageViewer::DICCorrelation));
        m_labelStatus->setText(tr("DIC completed. Avg correlation: %1")
            .arg(cv::mean(m_dicResult.correlationMap)[0], 4, 'f', 4));
    } else {
        m_labelStatus->setText(tr("DIC failed: %1").arg(m_dicResult.errorMessage));
    }
}

void MainWindow::onRunFusion() {
    if (!m_speckleResult.valid && !m_hasDICResult) {
        QMessageBox::warning(this, tr("Fusion"),
            tr("Please run speckle interferometry and/or DIC first."));
        return;
    }
    m_labelStatus->setText(tr("Running fusion..."));
    QApplication::processEvents();
    m_fusionResult = m_fusionProcessor->fuse(m_speckleResult, m_dicResult);
    m_hasFusionResult = m_fusionResult.valid;
    if (m_hasFusionResult) {
        m_imageViewer->setFusedResult(
            m_fusionResult.fusedDisplacementX,
            m_fusionResult.fusedDisplacementY,
            m_fusionResult.fusedMagnitude,
            m_fusionResult.interferometryWeight,
            m_fusionResult.DICWeight);
        m_comboDisplayMode->setCurrentIndex(m_comboDisplayMode->findData(ImageViewer::FusedMagnitude));
        m_labelStatus->setText(tr("Fusion completed. Quality: %1")
            .arg(m_fusionResult.fusionQuality, 4, 'f', 4));
    } else {
        m_labelStatus->setText(tr("Fusion failed: %1").arg(m_fusionResult.errorMessage));
    }
}

void MainWindow::onRunDecomposition() {
    if (!m_strainResult.valid) {
        QMessageBox::warning(this, tr("Decomposition"),
            tr("Please compute strain field first."));
        return;
    }
    m_labelStatus->setText(tr("Running strain decomposition..."));
    QApplication::processEvents();
    m_decompositionResult = m_strainDecomposer->decompose(
        m_strainResult.exx, m_strainResult.eyy,
        m_strainResult.exy, m_strainResult.vonMises);
    m_hasDecompositionResult = m_decompositionResult.valid;
    if (m_hasDecompositionResult) {
        m_strainResult.elasticExx = m_decompositionResult.elasticExx;
        m_strainResult.elasticEyy = m_decompositionResult.elasticEyy;
        m_strainResult.elasticExy = m_decompositionResult.elasticExy;
        m_strainResult.elasticVonMises = m_decompositionResult.elasticVonMises;
        m_strainResult.plasticExx = m_decompositionResult.plasticExx;
        m_strainResult.plasticEyy = m_decompositionResult.plasticEyy;
        m_strainResult.plasticExy = m_decompositionResult.plasticExy;
        m_strainResult.plasticVonMises = m_decompositionResult.plasticVonMises;
        m_strainResult.plasticZone = m_decompositionResult.plasticZone;
        m_strainResult.plasticAreaRatio = m_decompositionResult.plasticAreaRatio;
        m_strainResult.maxPlasticStrain = m_decompositionResult.maxPlasticStrain;
        m_strainResult.avgPlasticStrain = m_decompositionResult.avgPlasticStrain;
        m_strainResult.avgElasticStrain = m_decompositionResult.avgElasticStrain;
        m_imageViewer->setStrainData(m_strainResult);
        m_comboDisplayMode->setCurrentIndex(m_comboDisplayMode->findData(ImageViewer::PlasticVonMises));
        m_labelStatus->setText(tr("Decomposition completed. Plastic area: %1%, Max plastic: %2")
            .arg(m_decompositionResult.plasticAreaRatio * 100, 2, 'f', 1)
            .arg(m_decompositionResult.maxPlasticStrain, 4, 'g', 4));
    } else {
        m_labelStatus->setText(tr("Decomposition failed: %1")
            .arg(m_decompositionResult.errorMessage));
    }
}

void MainWindow::closeEvent(QCloseEvent* event) {
    m_videoSource->close();
    event->accept();
}
