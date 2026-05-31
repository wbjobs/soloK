#include "MainWindow.h"
#include <QApplication>
#include <QMenuBar>
#include <QStatusBar>
#include <QToolBar>
#include <QFileDialog>
#include <QMessageBox>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGroupBox>
#include <QFormLayout>
#include <QHeaderView>
#include <QCheckBox>
#include <QLineEdit>
#include <QProgressDialog>
#include <QRadioButton>
#include <QLabel>

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
{
    m_importer = new FLIRImporter(this);
    m_temImporter = new TEMImporter(this);
    m_registration = new ImageRegistration();
    m_calibration = new TemperatureCalibration();
    m_fieldAnalyzer = new TemperatureFieldAnalyzer();
    m_timeSeriesAnalyzer = new TimeSeriesAnalyzer();
    m_localizer = new WaterStructureLocalizer();
    m_crossAnalyzer = new CrossValidationAnalyzer();
    m_reportGenerator = new ReportGenerator();

    setupUI();
    setupMenus();
    setupConnections();

    setWindowTitle("红外探水隧道超前预报系统");
    resize(1600, 950);
}

MainWindow::~MainWindow()
{
    delete m_registration;
    delete m_calibration;
    delete m_fieldAnalyzer;
    delete m_timeSeriesAnalyzer;
    delete m_localizer;
    delete m_crossAnalyzer;
    delete m_reportGenerator;
}

void MainWindow::setupUI()
{
    QWidget* centralWidget = new QWidget(this);
    QHBoxLayout* mainLayout = new QHBoxLayout(centralWidget);
    mainLayout->setContentsMargins(5, 5, 5, 5);
    mainLayout->setSpacing(5);

    QVBoxLayout* leftLayout = new QVBoxLayout();
    leftLayout->setSpacing(5);

    QGroupBox* paramsGroup = new QGroupBox("参数设置", this);
    QFormLayout* paramsLayout = new QFormLayout(paramsGroup);

    m_enableRegistration = new QCheckBox("启用图像配准", paramsGroup);
    m_enableRegistration->setChecked(true);
    paramsLayout->addRow(m_enableRegistration);

    m_enableCalibration = new QCheckBox("启用温度标定", paramsGroup);
    m_enableCalibration->setChecked(true);
    paramsLayout->addRow(m_enableCalibration);

    m_emissivitySpin = new QDoubleSpinBox(paramsGroup);
    m_emissivitySpin->setRange(0.01, 1.0);
    m_emissivitySpin->setSingleStep(0.01);
    m_emissivitySpin->setValue(0.95);
    paramsLayout->addRow("发射率:", m_emissivitySpin);

    m_reflectedTempSpin = new QDoubleSpinBox(paramsGroup);
    m_reflectedTempSpin->setRange(-40, 200);
    m_reflectedTempSpin->setSingleStep(0.5);
    m_reflectedTempSpin->setValue(25.0);
    paramsLayout->addRow("反射温度(°C):", m_reflectedTempSpin);

    m_atmosphericTempSpin = new QDoubleSpinBox(paramsGroup);
    m_atmosphericTempSpin->setRange(-40, 200);
    m_atmosphericTempSpin->setSingleStep(0.5);
    m_atmosphericTempSpin->setValue(25.0);
    paramsLayout->addRow("大气温度(°C):", m_atmosphericTempSpin);

    m_distanceSpin = new QDoubleSpinBox(paramsGroup);
    m_distanceSpin->setRange(0.1, 100);
    m_distanceSpin->setSingleStep(0.1);
    m_distanceSpin->setValue(1.0);
    paramsLayout->addRow("目标距离(m):", m_distanceSpin);

    m_humiditySpin = new QDoubleSpinBox(paramsGroup);
    m_humiditySpin->setRange(0, 1.0);
    m_humiditySpin->setSingleStep(0.05);
    m_humiditySpin->setValue(0.5);
    paramsLayout->addRow("相对湿度:", m_humiditySpin);

    m_anomalyThresholdSpin = new QDoubleSpinBox(paramsGroup);
    m_anomalyThresholdSpin->setRange(0.5, 10);
    m_anomalyThresholdSpin->setSingleStep(0.1);
    m_anomalyThresholdSpin->setValue(2.0);
    paramsLayout->addRow("异常阈值(°C):", m_anomalyThresholdSpin);

    leftLayout->addWidget(paramsGroup);

    QGroupBox* tunnelGroup = new QGroupBox("隧道参数", this);
    QFormLayout* tunnelLayout = new QFormLayout(tunnelGroup);

    m_tunnelWidthSpin = new QSpinBox(tunnelGroup);
    m_tunnelWidthSpin->setRange(1, 20);
    m_tunnelWidthSpin->setValue(6);
    tunnelLayout->addRow("隧道宽度(m):", m_tunnelWidthSpin);

    m_tunnelHeightSpin = new QSpinBox(tunnelGroup);
    m_tunnelHeightSpin->setRange(1, 15);
    m_tunnelHeightSpin->setValue(5);
    tunnelLayout->addRow("隧道高度(m):", m_tunnelHeightSpin);

    m_faceDistanceSpin = new QDoubleSpinBox(tunnelGroup);
    m_faceDistanceSpin->setRange(0.5, 5.0);
    m_faceDistanceSpin->setSingleStep(0.1);
    m_faceDistanceSpin->setValue(2.0);
    tunnelLayout->addRow("工作面距离(m):", m_faceDistanceSpin);

    m_dipAngleSpin = new QDoubleSpinBox(tunnelGroup);
    m_dipAngleSpin->setRange(0, 90);
    m_dipAngleSpin->setSingleStep(1);
    m_dipAngleSpin->setValue(0);
    tunnelLayout->addRow("含水层倾角(°):", m_dipAngleSpin);

    m_strikeAngleSpin = new QDoubleSpinBox(tunnelGroup);
    m_strikeAngleSpin->setRange(0, 360);
    m_strikeAngleSpin->setSingleStep(1);
    m_strikeAngleSpin->setValue(0);
    tunnelLayout->addRow("含水层走向(°):", m_strikeAngleSpin);

    leftLayout->addWidget(tunnelGroup);

    QGroupBox* projectGroup = new QGroupBox("项目信息", this);
    QFormLayout* projectLayout = new QFormLayout(projectGroup);

    m_projectNameEdit = new QLineEdit(projectGroup);
    m_projectNameEdit->setText("示例项目");
    projectLayout->addRow("项目名称:", m_projectNameEdit);

    m_tunnelNameEdit = new QLineEdit(projectGroup);
    m_tunnelNameEdit->setText("一号隧道");
    projectLayout->addRow("隧道名称:", m_tunnelNameEdit);

    leftLayout->addWidget(projectGroup);

    QPushButton* analyzeButton = new QPushButton("开始分析", this);
    connect(analyzeButton, &QPushButton::clicked, this, &MainWindow::onAnalyze);
    leftLayout->addWidget(analyzeButton);

    QPushButton* crossValidateButton = new QPushButton("交叉验证分析", this);
    connect(crossValidateButton, &QPushButton::clicked, this, &MainWindow::onCrossValidate);
    leftLayout->addWidget(crossValidateButton);

    QPushButton* build3DButton = new QPushButton("构建3D模型", this);
    connect(build3DButton, &QPushButton::clicked, this, &MainWindow::onBuild3DModel);
    leftLayout->addWidget(build3DButton);

    QPushButton* reportButton = new QPushButton("生成报告", this);
    connect(reportButton, &QPushButton::clicked, this, &MainWindow::onExportReport);
    leftLayout->addWidget(reportButton);

    leftLayout->addStretch();

    mainLayout->addLayout(leftLayout, 1);

    m_tabWidget = new QTabWidget(this);

    QWidget* analysisTab = new QWidget();
    QVBoxLayout* analysisLayout = new QVBoxLayout(analysisTab);
    analysisLayout->setContentsMargins(5, 5, 5, 5);
    analysisLayout->setSpacing(5);

    m_temperatureViewer = new TemperatureViewer(this);
    analysisLayout->addWidget(m_temperatureViewer, 1);

    QHBoxLayout* sliderLayout = new QHBoxLayout();
    m_frameSlider = new QSlider(Qt::Horizontal, this);
    m_frameSlider->setEnabled(false);
    sliderLayout->addWidget(m_frameSlider);
    m_frameInfoLabel = new QLabel("帧数: 0/0", this);
    sliderLayout->addWidget(m_frameInfoLabel);
    analysisLayout->addLayout(sliderLayout);

    QHBoxLayout* tsControlLayout = new QHBoxLayout();
    QPushButton* addPointButton = new QPushButton("添加时间序列点", this);
    connect(addPointButton, &QPushButton::clicked, this, &MainWindow::onAddTimeSeriesPoint);
    tsControlLayout->addWidget(addPointButton);
    QPushButton* clearPointsButton = new QPushButton("清除点", this);
    connect(clearPointsButton, &QPushButton::clicked, this, &MainWindow::onClearTimeSeriesPoints);
    tsControlLayout->addWidget(clearPointsButton);
    tsControlLayout->addStretch();
    analysisLayout->addLayout(tsControlLayout);

    m_timeSeriesChart = new TimeSeriesChart(this);
    analysisLayout->addWidget(m_timeSeriesChart, 1);

    QHBoxLayout* tableLayout = new QHBoxLayout();
    m_anomalyTable = new QTableWidget(this);
    m_anomalyTable->setColumnCount(5);
    m_anomalyTable->setHorizontalHeaderLabels({"区域", "中心温度", "温差", "含水概率", "评级"});
    m_anomalyTable->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    tableLayout->addWidget(m_anomalyTable);

    m_drillingTable = new QTableWidget(this);
    m_drillingTable->setColumnCount(4);
    m_drillingTable->setHorizontalHeaderLabels({"位置", "深度", "角度", "优先级"});
    m_drillingTable->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    tableLayout->addWidget(m_drillingTable);
    analysisLayout->addLayout(tableLayout, 1);

    m_tabWidget->addTab(analysisTab, "红外分析");

    QWidget* fusionTab = new QWidget();
    QVBoxLayout* fusionLayout = new QVBoxLayout(fusionTab);
    fusionLayout->setContentsMargins(5, 5, 5, 5);
    fusionLayout->setSpacing(5);

    QHBoxLayout* modeLayout = new QHBoxLayout();
    m_displayModeGroup = new QButtonGroup(this);
    QRadioButton* radioIR = new QRadioButton("仅红外", this);
    QRadioButton* radioRes = new QRadioButton("仅电阻率", this);
    QRadioButton* radioConf = new QRadioButton("置信度热力图", this);
    QRadioButton* radioOverlay = new QRadioButton("融合叠加", this);
    radioConf->setChecked(true);
    m_displayModeGroup->addButton(radioIR, 0);
    m_displayModeGroup->addButton(radioRes, 1);
    m_displayModeGroup->addButton(radioConf, 2);
    m_displayModeGroup->addButton(radioOverlay, 3);
    modeLayout->addWidget(radioIR);
    modeLayout->addWidget(radioRes);
    modeLayout->addWidget(radioConf);
    modeLayout->addWidget(radioOverlay);
    modeLayout->addStretch();
    fusionLayout->addLayout(modeLayout);

    m_fusionViewer = new FusionViewer(this);
    fusionLayout->addWidget(m_fusionViewer, 1);

    m_fusionInfoLabel = new QLabel("整体置信度: -- %", this);
    fusionLayout->addWidget(m_fusionInfoLabel);

    m_tabWidget->addTab(fusionTab, "综合验证");

    QWidget* model3DTab = new QWidget();
    QHBoxLayout* model3DLayout = new QHBoxLayout(model3DTab);
    model3DLayout->setContentsMargins(5, 5, 5, 5);
    model3DLayout->setSpacing(5);

    QVBoxLayout* control3DLayout = new QVBoxLayout();
    control3DLayout->setSpacing(5);

    QGroupBox* cutGroup = new QGroupBox("剖切控制", this);
    QVBoxLayout* cutLayout = new QVBoxLayout(cutGroup);

    m_cutPlaneXCheck = new QCheckBox("X方向剖切", this);
    cutLayout->addWidget(m_cutPlaneXCheck);
    m_cutPlaneXSlider = new QSlider(Qt::Horizontal, this);
    m_cutPlaneXSlider->setRange(0, 100);
    m_cutPlaneXSlider->setValue(50);
    m_cutPlaneXSlider->setEnabled(false);
    cutLayout->addWidget(m_cutPlaneXSlider);

    m_cutPlaneYCheck = new QCheckBox("Y方向剖切", this);
    cutLayout->addWidget(m_cutPlaneYCheck);
    m_cutPlaneYSlider = new QSlider(Qt::Horizontal, this);
    m_cutPlaneYSlider->setRange(0, 100);
    m_cutPlaneYSlider->setValue(50);
    m_cutPlaneYSlider->setEnabled(false);
    cutLayout->addWidget(m_cutPlaneYSlider);

    m_cutPlaneZCheck = new QCheckBox("Z方向剖切", this);
    cutLayout->addWidget(m_cutPlaneZCheck);
    m_cutPlaneZSlider = new QSlider(Qt::Horizontal, this);
    m_cutPlaneZSlider->setRange(0, 100);
    m_cutPlaneZSlider->setValue(50);
    m_cutPlaneZSlider->setEnabled(false);
    cutLayout->addWidget(m_cutPlaneZSlider);

    control3DLayout->addWidget(cutGroup);

    QPushButton* resetCameraButton = new QPushButton("重置视角", this);
    control3DLayout->addWidget(resetCameraButton);

    control3DLayout->addStretch();
    model3DLayout->addLayout(control3DLayout, 1);

    m_geological3DView = new Geological3DView(this);
    model3DLayout->addWidget(m_geological3DView, 5);

    m_tabWidget->addTab(model3DTab, "三维模型");

    QWidget* reportTab = new QWidget();
    QVBoxLayout* reportLayout = new QVBoxLayout(reportTab);
    reportLayout->setContentsMargins(5, 5, 5, 5);
    m_reportPreview = new ReportPreview(this);
    reportLayout->addWidget(m_reportPreview);
    m_tabWidget->addTab(reportTab, "报告预览");

    mainLayout->addWidget(m_tabWidget, 4);

    setCentralWidget(centralWidget);

    m_progressBar = new QProgressBar(this);
    m_progressBar->setVisible(false);
    statusBar()->addPermanentWidget(m_progressBar);
}

void MainWindow::setupMenus()
{
    QMenu* fileMenu = menuBar()->addMenu("文件(&F)");

    m_importAction = fileMenu->addAction("导入红外数据(&I)");
    m_importAction->setShortcut(QKeySequence::Open);

    m_importTEMAction = fileMenu->addAction("导入TEM数据(&T)");

    fileMenu->addSeparator();

    m_exportAction = fileMenu->addAction("导出报告(&E)");
    m_exportAction->setShortcut(QKeySequence::Save);

    fileMenu->addSeparator();

    m_exitAction = fileMenu->addAction("退出(&X)");
    m_exitAction->setShortcut(QKeySequence::Quit);

    QMenu* analyzeMenu = menuBar()->addMenu("分析(&A)");

    m_analyzeAction = analyzeMenu->addAction("开始分析(&S)");
    m_crossValidateAction = analyzeMenu->addAction("交叉验证(&V)");
    m_build3DAction = analyzeMenu->addAction("构建3D模型(&M)");

    QMenu* viewMenu = menuBar()->addMenu("视图(&V)");
}

void MainWindow::setupConnections()
{
    connect(m_importAction, &QAction::triggered, this, &MainWindow::onImportFiles);
    connect(m_importTEMAction, &QAction::triggered, this, &MainWindow::onImportTEM);
    connect(m_analyzeAction, &QAction::triggered, this, &MainWindow::onAnalyze);
    connect(m_crossValidateAction, &QAction::triggered, this, &MainWindow::onCrossValidate);
    connect(m_build3DAction, &QAction::triggered, this, &MainWindow::onBuild3DModel);
    connect(m_exportAction, &QAction::triggered, this, &MainWindow::onExportReport);
    connect(m_exitAction, &QAction::triggered, this, &QMainWindow::close);

    connect(m_frameSlider, &QSlider::valueChanged, this, &MainWindow::onFrameSliderChanged);
    connect(m_temperatureViewer, &TemperatureViewer::pointSelected, this, &MainWindow::onPointSelected);

    connect(m_enableRegistration, &QCheckBox::toggled, this, &MainWindow::onRegistrationToggled);
    connect(m_enableCalibration, &QCheckBox::toggled, this, &MainWindow::onCalibrationToggled);
    connect(m_emissivitySpin, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &MainWindow::onUpdateCalibrationParams);
    connect(m_reflectedTempSpin, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &MainWindow::onUpdateCalibrationParams);
    connect(m_atmosphericTempSpin, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &MainWindow::onUpdateCalibrationParams);
    connect(m_distanceSpin, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &MainWindow::onUpdateCalibrationParams);
    connect(m_humiditySpin, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &MainWindow::onUpdateCalibrationParams);

    connect(m_displayModeGroup, QOverload<int>::of(&QButtonGroup::buttonClicked), this, &MainWindow::onDisplayModeChanged);
    connect(m_fusionViewer, &FusionViewer::pointSelected, this, &MainWindow::onFusionPointSelected);

    connect(m_cutPlaneXCheck, &QCheckBox::toggled, this, &MainWindow::onCutPlaneXToggled);
    connect(m_cutPlaneYCheck, &QCheckBox::toggled, this, &MainWindow::onCutPlaneYToggled);
    connect(m_cutPlaneZCheck, &QCheckBox::toggled, this, &MainWindow::onCutPlaneZToggled);
    connect(m_cutPlaneXSlider, &QSlider::valueChanged, this, &MainWindow::onCutPlaneXChanged);
    connect(m_cutPlaneYSlider, &QSlider::valueChanged, this, &MainWindow::onCutPlaneYChanged);
    connect(m_cutPlaneZSlider, &QSlider::valueChanged, this, &MainWindow::onCutPlaneZChanged);
    connect(m_cutPlaneXCheck, &QCheckBox::toggled, m_cutPlaneXSlider, &QSlider::setEnabled);
    connect(m_cutPlaneYCheck, &QCheckBox::toggled, m_cutPlaneYSlider, &QSlider::setEnabled);
    connect(m_cutPlaneZCheck, &QCheckBox::toggled, m_cutPlaneZSlider, &QSlider::setEnabled);
}

void MainWindow::onImportFiles()
{
    QStringList files = QFileDialog::getOpenFileNames(this,
        "选择FLIR红外数据文件", "",
        "FLIR CSV文件 (*.csv);;TIFF图像 (*.tif *.tiff);;所有文件 (*.*)");

    if (files.isEmpty()) return;

    m_progressBar->setVisible(true);
    m_progressBar->setRange(0, 100);
    m_progressBar->setValue(0);

    m_rawFrames = m_importer->importMultipleFiles(files);
    m_progressBar->setValue(100);

    if (m_rawFrames.empty()) {
        QMessageBox::warning(this, "导入失败", "无法导入任何文件！");
        m_progressBar->setVisible(false);
        return;
    }

    processFrames();

    statusBar()->showMessage(QString("成功导入 %1 帧").arg(m_rawFrames.size()));
    m_progressBar->setVisible(false);
}

void MainWindow::onImportTEM()
{
    QString fileName = QFileDialog::getOpenFileName(this,
        "选择TEM数据文件", "",
        "TEM XYZ文件 (*.xyz);;CSV文件 (*.csv);;所有文件 (*.*)");

    if (fileName.isEmpty()) return;

    m_temProfile = m_temImporter->importProfile(fileName);

    if (!m_temProfile.isValid()) {
        QMessageBox::warning(this, "导入失败", "无法导入TEM数据文件！");
        return;
    }

    m_fusionViewer->setTEMData(m_temProfile);
    statusBar()->showMessage(QString("成功导入TEM数据: %1 个测点").arg(m_temProfile.stationCount()));
}

void MainWindow::onAnalyze()
{
    if (m_rawFrames.empty()) {
        QMessageBox::information(this, "提示", "请先导入红外数据文件！");
        return;
    }

    processFrames();

    m_timeSeriesAnalyzer->setAnomalyThreshold(m_anomalyThresholdSpin->value());

    m_timeSeriesData = m_timeSeriesAnalyzer->analyzeMultiplePoints(
        m_processedFrames, m_timeSeriesPoints);
    m_timeSeriesChart->setTimeSeriesData(m_timeSeriesData);

    if (!m_processedFrames.empty()) {
        m_fieldAnalyzer->setTemperatureDifferenceThreshold(m_anomalyThresholdSpin->value());
        auto result = m_fieldAnalyzer->analyze(m_processedFrames);
        m_frameAnomalies = result.frameAnomalies;
        m_localizedAnomalies = result.globalAnomalies;

        m_localizer->setTunnelDimensions(
            m_tunnelWidthSpin->value(),
            m_tunnelHeightSpin->value(),
            m_faceDistanceSpin->value());
        m_localizer->setAquiferOrientation(
            m_dipAngleSpin->value(),
            m_strikeAngleSpin->value());

        m_drillingSuggestions = m_localizer->generateDrillingSuggestions(
            m_localizedAnomalies, m_processedFrames);

        updateAnomalyTable();
        updateDrillingTable();

        m_reportGenerator->setProjectInfo(m_projectNameEdit->text(), m_tunnelNameEdit->text());
        m_reportGenerator->generateReport(m_processedFrames, m_localizedAnomalies, m_drillingSuggestions);
        m_reportPreview->loadReport(m_reportGenerator->getReportPath());
    }

    statusBar()->showMessage("分析完成");
}

void MainWindow::onCrossValidate()
{
    if (m_processedFrames.empty()) {
        QMessageBox::information(this, "提示", "请先进行红外分析！");
        return;
    }

    if (!m_temProfile.isValid()) {
        QMessageBox::information(this, "提示", "请先导入TEM数据！");
        return;
    }

    m_progressBar->setVisible(true);
    m_progressBar->setRange(0, 100);
    m_progressBar->setValue(30);

    m_fusionResult = m_crossAnalyzer->analyze(
        m_processedFrames, m_temProfile, m_localizedAnomalies);

    m_progressBar->setValue(100);

    updateFusionDisplay();

    statusBar()->showMessage(QString("交叉验证完成，整体置信度: %1%")
        .arg(m_fusionResult.overallConfidence * 100, 0, 'f', 1));
    m_progressBar->setVisible(false);
}

void MainWindow::onBuild3DModel()
{
    if (m_localizedAnomalies.empty() && !m_fusionResult.fusedAnomalies.empty()) {
        m_geologicalModel.buildFromAnomalies(m_fusionResult.fusedAnomalies,
            m_tunnelWidthSpin->value(), m_tunnelHeightSpin->value());
    } else {
        m_geologicalModel.buildFromAnomalies(m_localizedAnomalies,
            m_tunnelWidthSpin->value(), m_tunnelHeightSpin->value());
    }

    m_geological3DView->setModel(m_geologicalModel);
    m_geological3DView->setTunnelDimensions(
        m_tunnelWidthSpin->value(),
        m_tunnelHeightSpin->value(),
        50.0
    );
    m_geological3DView->update();

    statusBar()->showMessage("3D模型构建完成");
}

void MainWindow::onExportReport()
{
    if (m_processedFrames.empty()) {
        QMessageBox::information(this, "提示", "请先进行分析！");
        return;
    }

    QString fileName = QFileDialog::getSaveFileName(this,
        "保存报告", "", "PDF文件 (*.pdf)");

    if (fileName.isEmpty()) return;

    if (m_reportGenerator->exportToPDF(fileName)) {
        QMessageBox::information(this, "成功", "报告导出成功！");
        statusBar()->showMessage("报告已导出");
    } else {
        QMessageBox::critical(this, "失败", "报告导出失败！");
    }
}

void MainWindow::processFrames()
{
    if (m_rawFrames.empty()) return;

    m_processedFrames = m_rawFrames;

    if (m_enableRegistration->isChecked() && m_processedFrames.size() > 1) {
        m_processedFrames = m_registration->registerSequence(m_processedFrames);
    }

    if (m_enableCalibration->isChecked()) {
        m_calibration->setEmissivity(m_emissivitySpin->value());
        m_calibration->setReflectedTemperature(m_reflectedTempSpin->value());
        m_calibration->setAtmosphericTemperature(m_atmosphericTempSpin->value());
        m_calibration->setDistance(m_distanceSpin->value());
        m_calibration->setHumidity(m_humiditySpin->value());

        for (auto& frame : m_processedFrames) {
            frame = m_calibration->calibrate(frame);
        }
    }

    m_frameSlider->setRange(0, m_processedFrames.size() - 1);
    m_frameSlider->setEnabled(true);
    m_frameSlider->setValue(0);

    if (!m_processedFrames.empty()) {
        updateFrameDisplay(0);
    }
}

void MainWindow::updateFrameDisplay(int index)
{
    if (index < 0 || index >= m_processedFrames.size()) return;

    const auto& frame = m_processedFrames[index];
    m_temperatureViewer->setFrame(frame);

    if (!m_frameAnomalies.empty() && index < m_frameAnomalies.size()) {
        m_temperatureViewer->setAnomalies(m_frameAnomalies[index]);
    }

    m_frameInfoLabel->setText(QString("帧数: %1/%2").arg(index + 1).arg(m_processedFrames.size()));
}

void MainWindow::updateAnomalyTable()
{
    m_anomalyTable->setRowCount(m_localizedAnomalies.size());

    for (size_t i = 0; i < m_localizedAnomalies.size(); ++i) {
        const auto& anomaly = m_localizedAnomalies[i];

        m_anomalyTable->setItem(i, 0, new QTableWidgetItem(
            QString("区域%1").arg(i + 1)));
        m_anomalyTable->setItem(i, 1, new QTableWidgetItem(
            QString("%1°C").arg(anomaly.centerTemperature(), 0, 'f', 1)));
        m_anomalyTable->setItem(i, 2, new QTableWidgetItem(
            QString("%1°C").arg(anomaly.temperatureDifference(), 0, 'f', 1)));
        m_anomalyTable->setItem(i, 3, new QTableWidgetItem(
            QString("%1%").arg(anomaly.waterProbability() * 100, 0, 'f', 1)));
        m_anomalyTable->setItem(i, 4, new QTableWidgetItem(anomaly.ratingString()));
    }
}

void MainWindow::updateDrillingTable()
{
    m_drillingTable->setRowCount(m_drillingSuggestions.size());

    for (size_t i = 0; i < m_drillingSuggestions.size(); ++i) {
        const auto& sugg = m_drillingSuggestions[i];

        m_drillingTable->setItem(i, 0, new QTableWidgetItem(
            QString("(%1, %2)").arg(sugg.position.x, 0, 'f', 1).arg(sugg.position.y, 0, 'f', 1)));
        m_drillingTable->setItem(i, 1, new QTableWidgetItem(
            QString("%1m").arg(sugg.depth, 0, 'f', 1)));
        m_drillingTable->setItem(i, 2, new QTableWidgetItem(
            QString("%1°").arg(sugg.angle, 0, 'f', 0)));
        m_drillingTable->setItem(i, 3, new QTableWidgetItem(
            sugg.priority == DrillingSuggestion::High ? "高" :
            sugg.priority == DrillingSuggestion::Medium ? "中" : "低"));
    }
}

void MainWindow::updateFusionDisplay()
{
    if (!m_processedFrames.empty()) {
        m_fusionViewer->setInfraredData(m_processedFrames[0].pseudoColorImage());
    }
    m_fusionViewer->setFusionResult(m_fusionResult);
    m_fusionInfoLabel->setText(QString("整体置信度: %1 %")
        .arg(m_fusionResult.overallConfidence * 100, 0, 'f', 1));
}

void MainWindow::onFrameSliderChanged(int value)
{
    updateFrameDisplay(value);
}

void MainWindow::onPointSelected(const QPoint& point, double temperature)
{
    statusBar()->showMessage(QString("位置: (%1,%2) 温度: %3°C")
        .arg(point.x()).arg(point.y()).arg(temperature, 0, 'f', 2));
}

void MainWindow::onFusionPointSelected(const QPoint& point, double confidence, double temp, double resistivity)
{
    statusBar()->showMessage(QString("位置: (%1,%2) 置信度: %3%")
        .arg(point.x()).arg(point.y()).arg(confidence * 100, 0, 'f', 1));
}

void MainWindow::onAddTimeSeriesPoint()
{
    QMessageBox::information(this, "提示", "请在温度图像上点击选择点");
    statusBar()->showMessage("请在温度图像上点击选择时间序列分析点");
}

void MainWindow::onClearTimeSeriesPoints()
{
    m_timeSeriesPoints.clear();
    m_timeSeriesData.clear();
    m_timeSeriesChart->clear();
    statusBar()->showMessage("已清除时间序列点");
}

void MainWindow::onRegistrationToggled(bool enabled)
{
    Q_UNUSED(enabled);
    if (!m_rawFrames.empty()) {
        processFrames();
    }
}

void MainWindow::onCalibrationToggled(bool enabled)
{
    Q_UNUSED(enabled);
    if (!m_rawFrames.empty()) {
        processFrames();
    }
}

void MainWindow::onUpdateCalibrationParams()
{
    if (!m_rawFrames.empty() && m_enableCalibration->isChecked()) {
        processFrames();
    }
}

void MainWindow::onDisplayModeChanged(int mode)
{
    m_fusionViewer->setDisplayMode(static_cast<FusionViewer::DisplayMode>(mode));
}

void MainWindow::onCutPlaneXToggled(bool enabled)
{
    m_geological3DView->setCutPlaneX(enabled, m_cutPlaneXSlider->value() / 100.0);
}

void MainWindow::onCutPlaneYToggled(bool enabled)
{
    m_geological3DView->setCutPlaneY(enabled, m_cutPlaneYSlider->value() / 100.0);
}

void MainWindow::onCutPlaneZToggled(bool enabled)
{
    m_geological3DView->setCutPlaneZ(enabled, m_cutPlaneZSlider->value() / 100.0);
}

void MainWindow::onCutPlaneXChanged(int value)
{
    if (m_cutPlaneXCheck->isChecked()) {
        m_geological3DView->setCutPlaneX(true, value / 100.0);
    }
}

void MainWindow::onCutPlaneYChanged(int value)
{
    if (m_cutPlaneYCheck->isChecked()) {
        m_geological3DView->setCutPlaneY(true, value / 100.0);
    }
}

void MainWindow::onCutPlaneZChanged(int value)
{
    if (m_cutPlaneZCheck->isChecked()) {
        m_geological3DView->setCutPlaneZ(true, value / 100.0);
    }
}

void MainWindow::onResetCamera()
{
    m_geological3DView->resetCamera();
}
