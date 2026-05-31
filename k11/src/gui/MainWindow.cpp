#include "gui/MainWindow.h"
#include <ui_MainWindow.h>

#include <QFileDialog>
#include <QMessageBox>
#include <QInputDialog>
#include <QStatusBar>
#include <QMenuBar>
#include <QToolBar>
#include <QDockWidget>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGridLayout>
#include <QSplitter>
#include <QHeaderView>
#include <QCloseEvent>
#include <QApplication>

#include <vtkPointData.h>
#include <vtkPolyDataMapper.h>
#include <vtkActor.h>
#include <vtkProperty.h>
#include <vtkInteractorStyleTrackballCamera.h>
#include <vtkVertexGlyphFilter.h>
#include <vtkPLYReader.h>
#include <vtkCamera.h>
#include <vtkAxesActor.h>
#include <vtkOrientationMarkerWidget.h>
#include <vtkTextActor.h>
#include <vtkTextProperty.h>
#include <vtkPoints.h>
#include <vtkCellArray.h>
#include <vtkUnsignedCharArray.h>
#include <vtkRenderWindowInteractor.h>
#include <vtkCommand.h>
#include <vtkNamedColors.h>

#include <pcl/io/pcd_io.h>
#include <pcl/io/ply_io.h>
#include <pcl/visualization/common/shapes.h>

namespace Fossil3D {

class PointPickCallback : public vtkCommand {
public:
    static PointPickCallback* New() { return new PointPickCallback; }
    void SetMainWindow(MainWindow* window) { m_window = window; }
    
    void Execute(vtkObject* caller, unsigned long eventId, void* callData) override {
        vtkPointPicker* picker = static_cast<vtkPointPicker*>(caller);
        if (picker->GetNumberOfPoints() > 0) {
            double pos[3];
            picker->GetPickPosition(pos);
            if (m_window) {
                QMetaObject::invokeMethod(m_window, "onPointPicked",
                                         Qt::QueuedConnection,
                                         Q_ARG(double, pos[0]),
                                         Q_ARG(double, pos[1]),
                                         Q_ARG(double, pos[2]));
            }
        }
    }
private:
    MainWindow* m_window = nullptr;
};

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
    , m_state(WorkflowState::Idle)
    , m_workerThread(nullptr)
    , m_pointPickingMode(false)
    , m_measurementType(0) {
    
    m_sfm = std::make_shared<SfMReconstructor>();
    m_filter = std::make_shared<PointCloudFilter>();
    m_dense = std::make_shared<DenseReconstructor>();
    m_mesher = std::make_shared<SurfaceReconstructor>();
    m_textureMapper = std::make_shared<TextureMapper>();
    m_curveMeasure = std::make_shared<CurveMeasurement>();
    m_angleMeasure = std::make_shared<AngleMeasurement>();
    m_volumeMeasure = std::make_shared<VolumeMeasurement>();
    m_symmetryAnalyzer = std::make_shared<SymmetryAnalyzer>();
    m_registration = std::make_shared<FossilRegistration>();
    m_exporter = std::make_shared<MeshExporter>();
    m_reportGenerator = std::make_shared<PDFReportGenerator>();
    m_animator = std::make_shared<ViewpointAnimator>();
    m_ringAnalyzer = std::make_shared<GrowthRingAnalyzer>();
    m_thicknessAnalyzer = std::make_shared<BoneThicknessAnalyzer>();
    m_samplingPlanner = std::make_shared<SamplingPathPlanner>();
    m_phyloExtractor = std::make_shared<PhylogeneticFeatureExtractor>();
    m_nexusExporter = std::make_shared<NexusExporter>();

    setupUI();
    setupVTK();
    setupConnections();

    m_updateTimer = new QTimer(this);
    connect(m_updateTimer, &QTimer::timeout, this, &MainWindow::onTimerUpdate);
    m_updateTimer->start(100);

    setWindowTitle("古生物化石三维重建系统 - Fossil3D");
    resize(1400, 900);
    showStatus("就绪");
}

MainWindow::~MainWindow() {
    if (m_workerThread && m_workerThread->isRunning()) {
        m_workerThread->quit();
        m_workerThread->wait();
    }
    delete ui;
}

void MainWindow::setupUI() {
    ui->setupUi(this);

    QWidget* centralWidget = new QWidget(this);
    QHBoxLayout* mainLayout = new QHBoxLayout(centralWidget);
    mainLayout->setContentsMargins(0, 0, 0, 0);
    centralWidget->setLayout(mainLayout);

    QSplitter* mainSplitter = new QSplitter(Qt::Horizontal, centralWidget);

    QWidget* leftPanel = new QWidget(mainSplitter);
    QVBoxLayout* leftLayout = new QVBoxLayout(leftPanel);
    leftPanel->setMinimumWidth(300);
    leftPanel->setMaximumWidth(400);

    QGroupBox* sfmGroup = new QGroupBox("SfM 重建", leftPanel);
    QVBoxLayout* sfmLayout = new QVBoxLayout(sfmGroup);
    
    m_featureTypeCombo = new QComboBox(sfmGroup);
    m_featureTypeCombo->addItems({"SIFT", "ORB", "AKAZE"});
    sfmLayout->addWidget(new QLabel("特征类型:"));
    sfmLayout->addWidget(m_featureTypeCombo);
    
    m_maxFeaturesSpin = new QSpinBox(sfmGroup);
    m_maxFeaturesSpin->setRange(1000, 20000);
    m_maxFeaturesSpin->setValue(8000);
    sfmLayout->addWidget(new QLabel("最大特征数:"));
    sfmLayout->addWidget(m_maxFeaturesSpin);
    
    m_matchingRatioSpin = new QDoubleSpinBox(sfmGroup);
    m_matchingRatioSpin->setRange(0.5, 0.95);
    m_matchingRatioSpin->setSingleStep(0.05);
    m_matchingRatioSpin->setValue(0.7);
    sfmLayout->addWidget(new QLabel("匹配阈值:"));
    sfmLayout->addWidget(m_matchingRatioSpin);
    
    QPushButton* btnImport = new QPushButton("导入图片", sfmGroup);
    QPushButton* btnSfM = new QPushButton("运行SfM重建", sfmGroup);
    sfmLayout->addWidget(btnImport);
    sfmLayout->addWidget(btnSfM);

    leftLayout->addWidget(sfmGroup);

    QGroupBox* filterGroup = new QGroupBox("点云处理", leftPanel);
    QVBoxLayout* filterLayout = new QVBoxLayout(filterGroup);
    
    m_checkDownsample = new QCheckBox("体素下采样", filterGroup);
    m_checkDownsample->setChecked(true);
    m_checkRemoveOutliers = new QCheckBox("去除离群点", filterGroup);
    m_checkRemoveOutliers->setChecked(true);
    m_checkSmooth = new QCheckBox("平滑处理", filterGroup);
    m_checkSmooth->setChecked(true);
    
    m_voxelSizeSpin = new QDoubleSpinBox(filterGroup);
    m_voxelSizeSpin->setRange(0.001, 0.1);
    m_voxelSizeSpin->setSingleStep(0.001);
    m_voxelSizeSpin->setValue(0.005);
    
    filterLayout->addWidget(m_checkDownsample);
    filterLayout->addWidget(new QLabel("体素大小 (m):"));
    filterLayout->addWidget(m_voxelSizeSpin);
    filterLayout->addWidget(m_checkRemoveOutliers);
    filterLayout->addWidget(m_checkSmooth);
    
    QPushButton* btnFilter = new QPushButton("点云滤波", filterGroup);
    filterLayout->addWidget(btnFilter);
    
    leftLayout->addWidget(filterGroup);

    QGroupBox* meshGroup = new QGroupBox("网格重建", leftPanel);
    QVBoxLayout* meshLayout = new QVBoxLayout(meshGroup);
    
    m_poissonDepthSpin = new QSpinBox(meshGroup);
    m_poissonDepthSpin->setRange(5, 12);
    m_poissonDepthSpin->setValue(8);
    meshLayout->addWidget(new QLabel("Poisson深度:"));
    meshLayout->addWidget(m_poissonDepthSpin);
    
    QPushButton* btnMesh = new QPushButton("生成网格", meshGroup);
    QPushButton* btnTexture = new QPushButton("生成纹理", meshGroup);
    meshLayout->addWidget(btnMesh);
    meshLayout->addWidget(btnTexture);
    
    leftLayout->addWidget(meshGroup);

    QGroupBox* measureGroup = new QGroupBox("测量工具", leftPanel);
    QVBoxLayout* measureLayout = new QVBoxLayout(measureGroup);
    
    QPushButton* btnCurve = new QPushButton("曲线测量", measureGroup);
    QPushButton* btnAngle = new QPushButton("角度测量", measureGroup);
    QPushButton* btnVolume = new QPushButton("体积测量", measureGroup);
    QPushButton* btnSymmetry = new QPushButton("对称性分析", measureGroup);
    
    measureLayout->addWidget(btnCurve);
    measureLayout->addWidget(btnAngle);
    measureLayout->addWidget(btnVolume);
    measureLayout->addWidget(btnSymmetry);
    
    m_measurementList = new QListWidget(measureGroup);
    measureLayout->addWidget(new QLabel("测量结果:"));
    measureLayout->addWidget(m_measurementList);
    
    leftLayout->addWidget(measureGroup);

    leftLayout->addStretch();

    m_vtkWidget = new QVTKOpenGLNativeWidget(mainSplitter);
    m_vtkWidget->setMinimumSize(600, 600);

    QWidget* rightPanel = new QWidget(mainSplitter);
    QVBoxLayout* rightLayout = new QVBoxLayout(rightPanel);
    rightPanel->setMinimumWidth(280);

    QGroupBox* objectGroup = new QGroupBox("场景对象", rightPanel);
    QVBoxLayout* objectLayout = new QVBoxLayout(objectGroup);
    m_objectList = new QListWidget(objectGroup);
    objectLayout->addWidget(m_objectList);
    QPushButton* btnClear = new QPushButton("清除所有", objectGroup);
    objectLayout->addWidget(btnClear);
    rightLayout->addWidget(objectGroup);

    QGroupBox* registerGroup = new QGroupBox("化石拼接", rightPanel);
    QVBoxLayout* registerLayout = new QVBoxLayout(registerGroup);
    
    m_fragmentTree = new QTreeWidget(registerGroup);
    m_fragmentTree->setHeaderLabels({"名称", "顶点数"});
    registerLayout->addWidget(new QLabel("碎片列表:"));
    registerLayout->addWidget(m_fragmentTree);
    
    QPushButton* btnAddFragment = new QPushButton("添加碎片", registerGroup);
    QPushButton* btnRegManual = new QPushButton("手动配准", registerGroup);
    QPushButton* btnRegAuto = new QPushButton("自动配准(ICP)", registerGroup);
    QPushButton* btnRegCurvature = new QPushButton("曲率特征配准", registerGroup);
    QPushButton* btnFuse = new QPushButton("融合碎片", registerGroup);
    
    registerLayout->addWidget(btnAddFragment);
    registerLayout->addWidget(btnRegManual);
    registerLayout->addWidget(btnRegAuto);
    registerLayout->addWidget(btnRegCurvature);
    registerLayout->addWidget(btnFuse);
    rightLayout->addWidget(registerGroup);

    QGroupBox* animGroup = new QGroupBox("动画与分析", rightPanel);
    QVBoxLayout* animLayout = new QVBoxLayout(animGroup);
    
    m_animTypeCombo = new QComboBox(animGroup);
    m_animTypeCombo->addItems({"环绕动画", "飞越动画", "主轴动画"});
    m_animDurationSpin = new QDoubleSpinBox(animGroup);
    m_animDurationSpin->setRange(5.0, 60.0);
    m_animDurationSpin->setValue(10.0);
    
    animLayout->addWidget(new QLabel("动画类型:"));
    animLayout->addWidget(m_animTypeCombo);
    animLayout->addWidget(new QLabel("时长 (秒):"));
    animLayout->addWidget(m_animDurationSpin);
    
    QPushButton* btnAnim = new QPushButton("生成动画路径", animGroup);
    QPushButton* btnRings = new QPushButton("生长纹/年轮分析", animGroup);
    
    animLayout->addWidget(btnAnim);
    animLayout->addWidget(btnRings);
    rightLayout->addWidget(animGroup);

    QGroupBox* exportGroup = new QGroupBox("导出", rightPanel);
    QVBoxLayout* exportLayout = new QVBoxLayout(exportGroup);
    
    QPushButton* btnOBJ = new QPushButton("导出OBJ", exportGroup);
    QPushButton* btnSTL = new QPushButton("导出STL", exportGroup);
    QPushButton* btnPLY = new QPushButton("导出PLY", exportGroup);
    QPushButton* btnReport = new QPushButton("生成测量报告", exportGroup);
    
    exportLayout->addWidget(btnOBJ);
    exportLayout->addWidget(btnSTL);
    exportLayout->addWidget(btnPLY);
    exportLayout->addWidget(btnReport);
    rightLayout->addWidget(exportGroup);

    QGroupBox* samplingGroup = new QGroupBox("古DNA采样规划", rightPanel);
    QVBoxLayout* samplingLayout = new QVBoxLayout(samplingGroup);
    
    QPushButton* btnThickness = new QPushButton("骨质厚度分析", samplingGroup);
    QPushButton* btnSampling = new QPushButton("规划采样路径", samplingGroup);
    QPushButton* btnFeatures = new QPushButton("提取形态特征", samplingGroup);
    QPushButton* btnNexus = new QPushButton("导出Nexus文件", samplingGroup);
    
    samplingLayout->addWidget(btnThickness);
    samplingLayout->addWidget(btnSampling);
    samplingLayout->addWidget(btnFeatures);
    samplingLayout->addWidget(btnNexus);
    rightLayout->addWidget(samplingGroup);

    rightLayout->addStretch();

    mainSplitter->addWidget(leftPanel);
    mainSplitter->addWidget(m_vtkWidget);
    mainSplitter->addWidget(rightPanel);
    mainSplitter->setStretchFactor(0, 0);
    mainSplitter->setStretchFactor(1, 1);
    mainSplitter->setStretchFactor(2, 0);
    
    mainLayout->addWidget(mainSplitter);
    setCentralWidget(centralWidget);

    QStatusBar* statusBar = new QStatusBar(this);
    setStatusBar(statusBar);
    m_statusLabel = new QLabel("就绪", this);
    m_progressBar = new QProgressBar(this);
    m_progressBar->setVisible(false);
    m_progressBar->setMaximumWidth(200);
    statusBar->addWidget(m_statusLabel, 1);
    statusBar->addPermanentWidget(m_progressBar);

    QDockWidget* logDock = new QDockWidget("日志窗口", this);
    m_logWidget = new QTextEdit(logDock);
    m_logWidget->setReadOnly(true);
    m_logWidget->setMaximumHeight(150);
    logDock->setWidget(m_logWidget);
    addDockWidget(Qt::BottomDockWidgetArea, logDock);

    connect(btnImport, &QPushButton::clicked, this, &MainWindow::onImportImages);
    connect(btnSfM, &QPushButton::clicked, this, &MainWindow::onRunSfM);
    connect(btnFilter, &QPushButton::clicked, this, &MainWindow::onFilterPointCloud);
    connect(btnMesh, &QPushButton::clicked, this, &MainWindow::onReconstructMesh);
    connect(btnTexture, &QPushButton::clicked, this, &MainWindow::onGenerateTexture);
    connect(btnCurve, &QPushButton::clicked, this, &MainWindow::onMeasureCurve);
    connect(btnAngle, &QPushButton::clicked, this, &MainWindow::onMeasureAngle);
    connect(btnVolume, &QPushButton::clicked, this, &MainWindow::onMeasureVolume);
    connect(btnSymmetry, &QPushButton::clicked, this, &MainWindow::onAnalyzeSymmetry);
    connect(btnClear, &QPushButton::clicked, this, &MainWindow::onClearAll);
    connect(btnAddFragment, &QPushButton::clicked, [this]() {
        QString file = QFileDialog::getOpenFileName(this, "导入点云碎片", "", 
                                                     "Point Cloud (*.pcd *.ply)");
        if (!file.isEmpty()) {
            PointCloudXYZRGB::Ptr cloud(new PointCloudXYZRGB);
            if (pcl::io::loadPCDFile(file.toStdString(), *cloud) >= 0 ||
                pcl::io::loadPLYFile(file.toStdString(), *cloud) >= 0) {
                m_fragments.push_back(cloud);
                m_fragmentTransforms.push_back(Eigen::Matrix4d::Identity());
                updateFragmentList();
                addPointCloudToView(cloud, "Fragment_" + std::to_string(m_fragments.size()));
                logMessage("已添加碎片: " + file.toStdString());
            }
        }
    });
    connect(btnRegManual, &QPushButton::clicked, this, &MainWindow::onRegisterManual);
    connect(btnRegAuto, &QPushButton::clicked, this, &MainWindow::onRegisterAuto);
    connect(btnRegCurvature, &QPushButton::clicked, this, &MainWindow::onRegisterCurvature);
    connect(btnFuse, &QPushButton::clicked, this, &MainWindow::onFuseFragments);
    connect(btnOBJ, &QPushButton::clicked, this, &MainWindow::onExportOBJ);
    connect(btnSTL, &QPushButton::clicked, this, &MainWindow::onExportSTL);
    connect(btnPLY, &QPushButton::clicked, this, &MainWindow::onExportPLY);
    connect(btnReport, &QPushButton::clicked, this, &MainWindow::onGenerateReport);
    connect(btnAnim, &QPushButton::clicked, [this]() {
        int idx = m_animTypeCombo->currentIndex();
        m_animator->setDuration(m_animDurationSpin->value());
        if (idx == 0) onGenerateOrbitAnimation();
        else if (idx == 1) onGenerateFlythrough();
        else onGenerateAxisAnimation();
    });
    connect(btnRings, &QPushButton::clicked, this, &MainWindow::onAnalyzeGrowthRings);
    connect(btnThickness, &QPushButton::clicked, this, &MainWindow::onAnalyzeThickness);
    connect(btnSampling, &QPushButton::clicked, this, &MainWindow::onPlanSampling);
    connect(btnFeatures, &QPushButton::clicked, this, &MainWindow::onExtractPhyloFeatures);
    connect(btnNexus, &QPushButton::clicked, this, &MainWindow::onExportNexus);

    updateWorkflowButtons();
}

void MainWindow::setupVTK() {
    m_renderWindow = vtkSmartPointer<vtkGenericOpenGLRenderWindow>::New();
    m_renderer = vtkSmartPointer<vtkRenderer>::New();
    
    m_vtkWidget->setRenderWindow(m_renderWindow);
    m_renderWindow->AddRenderer(m_renderer);
    
    vtkNew<vtkNamedColors> colors;
    m_renderer->SetBackground(colors->GetColor3d("LightGray").GetData());
    
    vtkNew<vtkInteractorStyleTrackballCamera> style;
    m_vtkWidget->interactor()->SetInteractorStyle(style);
    
    m_pointPicker = vtkSmartPointer<vtkPointPicker>::New();
    m_vtkWidget->interactor()->SetPicker(m_pointPicker);
    
    vtkNew<PointPickCallback> pickCallback;
    pickCallback->SetMainWindow(this);
    m_pointPicker->AddObserver(vtkCommand::EndPickEvent, pickCallback);
    
    vtkNew<vtkAxesActor> axes;
    vtkNew<vtkOrientationMarkerWidget> widget;
    widget->SetOrientationMarker(axes);
    widget->SetInteractor(m_vtkWidget->interactor());
    widget->SetViewport(0.0, 0.0, 0.2, 0.2);
    widget->SetEnabled(true);
    widget->InteractiveOn();
    
    vtkNew<vtkTextActor> textActor;
    textActor->SetInput("Fossil3D Reconstruction System");
    textActor->GetPositionCoordinate()->SetCoordinateSystemToNormalizedDisplay();
    textActor->GetPositionCoordinate()->SetValue(0.5, 0.95);
    textActor->GetTextProperty()->SetFontSize(16);
    textActor->GetTextProperty()->SetColor(0.2, 0.3, 0.6);
    textActor->GetTextProperty()->SetJustificationToCentered();
    m_renderer->AddActor2D(textActor);
    
    m_renderer->ResetCamera();
}

void MainWindow::setupConnections() {
}

void MainWindow::updateWorkflowButtons() {
}

void MainWindow::showStatus(const QString& message, int timeout) {
    if (m_statusLabel) {
        m_statusLabel->setText(message);
        if (timeout > 0) {
            QTimer::singleShot(timeout, this, [this]() {
                m_statusLabel->setText("就绪");
            });
        }
    }
}

void MainWindow::logMessage(const std::string& message) {
    if (m_logWidget) {
        QMetaObject::invokeMethod(m_logWidget, "append",
                                 Qt::QueuedConnection,
                                 Q_ARG(QString, QString::fromStdString(message)));
    }
    Logger::info(message);
}

void MainWindow::updateView() {
    m_renderWindow->Render();
}

void MainWindow::onTimerUpdate() {
}

void MainWindow::onPointPicked(double x, double y, double z) {
    if (!m_pointPickingMode) return;
    
    Eigen::Vector3d pt(x, y, z);
    m_pickedPoints.push_back(pt);
    
    logMessage("已拾取点: (" + std::to_string(x) + ", " + 
               std::to_string(y) + ", " + std::to_string(z) + ")");
    
    if (m_measurementType == 0 && m_pickedPoints.size() >= 2) {
        MeasurementResult result = m_curveMeasure->measureLength(m_pickedPoints);
        m_measurements.push_back(result);
        updateMeasurementList();
        m_pointPickingMode = false;
        m_pickedPoints.clear();
        logMessage("曲线测量完成: " + std::to_string(result.value) + " mm");
    } else if (m_measurementType == 1 && m_pickedPoints.size() >= 3) {
        MeasurementResult result = m_angleMeasure->measureThreePointAngle(
            m_pickedPoints[0], m_pickedPoints[1], m_pickedPoints[2]);
        m_measurements.push_back(result);
        updateMeasurementList();
        m_pointPickingMode = false;
        m_pickedPoints.clear();
        logMessage("角度测量完成: " + std::to_string(result.value) + " 度");
    }
}

void MainWindow::updateMeasurementList() {
    m_measurementList->clear();
    for (const auto& meas : m_measurements) {
        QString text = QString::fromStdString(meas.name) + ": " +
                      QString::number(meas.value, 'f', 3) + " " +
                      QString::fromStdString(meas.unit);
        m_measurementList->addItem(text);
    }
}

void MainWindow::updateFragmentList() {
    m_fragmentTree->clear();
    for (size_t i = 0; i < m_fragments.size(); ++i) {
        QTreeWidgetItem* item = new QTreeWidgetItem(m_fragmentTree);
        item->setText(0, QString("Fragment_%1").arg(i + 1));
        item->setText(1, QString::number(m_fragments[i]->size()));
        m_fragmentTree->addTopLevelItem(item);
    }
}

void MainWindow::addPointCloudToView(PointCloudXYZRGB::ConstPtr cloud, const std::string& name) {
    if (!cloud || cloud->empty()) return;

    vtkNew<vtkPoints> points;
    vtkNew<vtkUnsignedCharArray> colors;
    colors->SetNumberOfComponents(3);
    colors->SetName("Colors");

    for (const auto& pt : cloud->points) {
        points->InsertNextPoint(pt.x, pt.y, pt.z);
        unsigned char color[3] = {pt.r, pt.g, pt.b};
        colors->InsertNextTupleValue(color);
    }

    vtkNew<vtkPolyData> polyData;
    polyData->SetPoints(points);
    polyData->GetPointData()->SetScalars(colors);

    vtkNew<vtkVertexGlyphFilter> glyphFilter;
    glyphFilter->SetInputData(polyData);
    glyphFilter->Update();

    vtkNew<vtkPolyDataMapper> mapper;
    mapper->SetInputConnection(glyphFilter->GetOutputPort());
    mapper->ScalarVisibilityOn();

    vtkNew<vtkActor> actor;
    actor->SetMapper(mapper);
    actor->GetProperty()->SetPointSize(3);
    
    m_renderer->AddActor(actor);
    m_renderer->ResetCamera();
    updateView();
    
    m_objectList->addItem(QString::fromStdString(name));
}

void MainWindow::addMeshToView(pcl::PolygonMesh::ConstPtr mesh, const std::string& name) {
    if (!mesh) return;

    PointCloudXYZRGB::Ptr vertices(new PointCloudXYZRGB);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    vtkNew<vtkPoints> points;
    vtkNew<vtkCellArray> triangles;
    vtkNew<vtkUnsignedCharArray> colors;
    colors->SetNumberOfComponents(3);

    for (const auto& pt : vertices->points) {
        points->InsertNextPoint(pt.x, pt.y, pt.z);
        unsigned char color[3] = {pt.r, pt.g, pt.b};
        colors->InsertNextTupleValue(color);
    }

    for (const auto& face : mesh->polygons) {
        vtkNew<vtkTriangle> triangle;
        for (size_t i = 0; i < face.vertices.size() && i < 3; ++i) {
            triangle->GetPointIds()->SetId(i, face.vertices[i]);
        }
        triangles->InsertNextCell(triangle);
    }

    vtkNew<vtkPolyData> polyData;
    polyData->SetPoints(points);
    polyData->SetPolys(triangles);
    polyData->GetPointData()->SetScalars(colors);

    vtkNew<vtkPolyDataMapper> mapper;
    mapper->SetInputData(polyData);

    vtkNew<vtkActor> actor;
    actor->SetMapper(mapper);
    actor->GetProperty()->SetInterpolationToGouraud();
    
    m_renderer->AddActor(actor);
    m_renderer->ResetCamera();
    updateView();
    
    m_objectList->addItem(QString::fromStdString(name));
}

void MainWindow::clearView() {
    m_renderer->RemoveAllViewProps();
    m_renderer->ResetCamera();
    updateView();
    m_objectList->clear();
}

void MainWindow::runInThread(std::function<void()> task) {
    m_progressBar->setVisible(true);
    m_progressBar->setRange(0, 0);
    
    if (m_workerThread && m_workerThread->isRunning()) {
        m_workerThread->quit();
        m_workerThread->wait();
    }
    
    m_workerThread = QThread::create([this, task]() {
        try {
            task();
        } catch (const std::exception& e) {
            logMessage("错误: " + std::string(e.what()));
        }
        QMetaObject::invokeMethod(this, "threadFinished");
    });
    m_workerThread->start();
}

void MainWindow::threadFinished() {
    m_progressBar->setVisible(false);
    m_state = WorkflowState::Idle;
    updateWorkflowButtons();
}

void MainWindow::closeEvent(QCloseEvent* event) {
    if (m_workerThread && m_workerThread->isRunning()) {
        if (QMessageBox::question(this, "确认退出", 
                                   "后台任务正在运行，确定要退出吗？") 
            == QMessageBox::Yes) {
            m_workerThread->quit();
            m_workerThread->wait();
            event->accept();
        } else {
            event->ignore();
            return;
        }
    }
    QMainWindow::closeEvent(event);
}

void MainWindow::onImportImages() {
    QString directory = QFileDialog::getExistingDirectory(this, "选择图片目录", "");
    if (directory.isEmpty()) return;
    
    m_imagePaths = FileUtils::getImageFiles(directory.toStdString());
    if (m_imagePaths.empty()) {
        QMessageBox::warning(this, "提示", "该目录下没有找到图片文件！");
        return;
    }
    
    logMessage("已加载 " + std::to_string(m_imagePaths.size()) + " 张图片");
    showStatus(QString("已加载 %1 张图片").arg(m_imagePaths.size()));
    
    if (!m_imagePaths.empty()) {
        cv::Mat img = cv::imread(m_imagePaths[0]);
        if (!img.empty()) {
            m_fossilImages.push_back(img);
        }
    }
}

void MainWindow::onRunSfM() {
    if (m_imagePaths.empty()) {
        QMessageBox::warning(this, "提示", "请先导入图片！");
        return;
    }
    
    m_state = WorkflowState::SfMProcessing;
    showStatus("正在运行SfM重建...");
    
    m_sfm->setFeatureType(m_featureTypeCombo->currentText().toStdString());
    m_sfm->setMaxFeatures(m_maxFeaturesSpin->value());
    m_sfm->setMatchingRatio(m_matchingRatioSpin->value());
    
    runInThread([this]() {
        if (m_sfm->loadImages(m_imagePaths)) {
            if (m_sfm->reconstruct()) {
                m_sparseCloud = m_sfm->getSparsePointCloud();
                QMetaObject::invokeMethod(this, [this]() {
                    addPointCloudToView(m_sparseCloud, "SparsePointCloud");
                    logMessage("SfM重建完成，稀疏点云包含 " + 
                              std::to_string(m_sparseCloud->size()) + " 个点");
                });
            }
        }
    });
}

void MainWindow::onRunDenseReconstruction() {
    QMessageBox::information(this, "提示", 
        "密集重建需要深度图计算，对于多视图场景建议使用专业MVS库（如COLMAP）。\n"
        "当前可以继续处理稀疏点云或导入外部密集点云。");
}

void MainWindow::onFilterPointCloud() {
    if (!m_sparseCloud || m_sparseCloud->empty()) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    m_state = WorkflowState::Filtering;
    showStatus("正在进行点云滤波...");
    
    m_filter->setVoxelGridSize(m_voxelSizeSpin->value());
    
    runInThread([this]() {
        m_filteredCloud = m_filter->filter(m_sparseCloud,
                                            m_checkDownsample->isChecked(),
                                            m_checkRemoveOutliers->isChecked(),
                                            m_checkSmooth->isChecked(),
                                            true);
        QMetaObject::invokeMethod(this, [this]() {
            if (m_filteredCloud.cloud && !m_filteredCloud.cloud->empty()) {
                clearView();
                addPointCloudToView(m_filteredCloud.cloud, "FilteredPointCloud");
                logMessage("点云滤波完成，包含 " + 
                          std::to_string(m_filteredCloud.cloud->size()) + " 个点");
            }
        });
    });
}

void MainWindow::onReconstructMesh() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud || cloud->empty()) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    m_state = WorkflowState::Meshing;
    showStatus("正在进行Poisson表面重建...");
    
    m_mesher->setPoissonDepth(m_poissonDepthSpin->value());
    
    runInThread([this, cloud]() {
        PointCloudData data;
        data.cloud = cloud;
        if (!m_filteredCloud.normals) {
            PointCloudFilter f;
            data.normals = f.estimateNormals(cloud);
        } else {
            data.normals = m_filteredCloud.normals;
        }
        data.hasNormals = true;
        
        m_mesh = m_mesher->reconstruct(data, "poisson");
        QMetaObject::invokeMethod(this, [this]() {
            if (m_mesh) {
                clearView();
                addMeshToView(m_mesh, "Mesh");
                logMessage("网格重建完成");
            }
        });
    });
}

void MainWindow::onGenerateTexture() {
    if (!m_mesh) {
        QMessageBox::warning(this, "提示", "请先生成网格！");
        return;
    }
    
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "没有可用的彩色点云！");
        return;
    }
    
    m_state = WorkflowState::Texturing;
    showStatus("正在生成纹理...");
    
    runInThread([this, cloud]() {
        m_texturedMesh = m_textureMapper->createTexturedMesh(m_mesh, cloud);
        QMetaObject::invokeMethod(this, [this]() {
            if (m_texturedMesh.coloredCloud) {
                clearView();
                addMeshToView(m_mesh, "TexturedMesh");
                logMessage("纹理映射完成");
            }
        });
    });
}

void MainWindow::onMeasureCurve() {
    if (!m_sparseCloud && !m_filteredCloud.cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    m_pointPickingMode = true;
    m_measurementType = 0;
    m_pickedPoints.clear();
    showStatus("请在视图中拾取2个以上的点进行曲线测量");
    logMessage("进入曲线测量模式，请在3D视图中点击选择路径点");
}

void MainWindow::onMeasureAngle() {
    if (!m_sparseCloud && !m_filteredCloud.cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    m_pointPickingMode = true;
    m_measurementType = 1;
    m_pickedPoints.clear();
    showStatus("请在视图中拾取3个点进行角度测量 (点1-顶点-点2)");
    logMessage("进入角度测量模式，请依次点击3个点");
}

void MainWindow::onMeasureVolume() {
    if (!m_mesh) {
        QMessageBox::warning(this, "提示", "请先生成网格进行体积测量，或使用点云凸包估算！");
        
        if (m_sparseCloud || m_filteredCloud.cloud) {
            auto reply = QMessageBox::question(this, "确认", 
                "是否使用点云凸包估算体积？");
            if (reply == QMessageBox::Yes) {
                PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
                    m_filteredCloud.cloud : m_sparseCloud;
                
                runInThread([this, cloud]() {
                    MeasurementResult result = 
                        m_volumeMeasure->measurePointCloudVolume(cloud, "ConvexHullVolume");
                    m_measurements.push_back(result);
                    QMetaObject::invokeMethod(this, [this]() {
                        updateMeasurementList();
                        logMessage("体积测量完成: " + 
                                  std::to_string(m_measurements.back().value) + " cm³");
                    });
                });
            }
        }
        return;
    }
    
    runInThread([this]() {
        MeasurementResult result = 
            m_volumeMeasure->measureMeshVolume(m_mesh, "MeshVolume");
        m_measurements.push_back(result);
        QMetaObject::invokeMethod(this, [this]() {
            updateMeasurementList();
            logMessage("体积测量完成: " + 
                      std::to_string(m_measurements.back().value) + " cm³");
        });
    });
}

void MainWindow::onAnalyzeSymmetry() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    m_state = WorkflowState::Measuring;
    showStatus("正在进行对称性分析...");
    
    runInThread([this, cloud]() {
        m_symmetryAnalyzer->autoDetectSymmetryAxis(cloud);
        SymmetryResult result = m_symmetryAnalyzer->analyzeSymmetry(cloud, "Symmetry");
        
        QMetaObject::invokeMethod(this, [this, result]() {
            if (result.heatmapCloud) {
                clearView();
                addPointCloudToView(result.heatmapCloud, "SymmetryHeatmap");
                QString msg = QString("对称性分析完成:\n平均偏差: %1 mm\n最大偏差: %2 mm\nRMSE: %3 mm")
                    .arg(result.meanDeviation * 1000, 0, 'f', 2)
                    .arg(result.maxDeviation * 1000, 0, 'f', 2)
                    .arg(result.rmse * 1000, 0, 'f', 2);
                QMessageBox::information(this, "对称性分析结果", msg);
            }
        });
    });
}

void MainWindow::onRegisterManual() {
    if (m_fragments.size() < 2) {
        QMessageBox::warning(this, "提示", "请至少添加2个碎片进行配准！");
        return;
    }
    
    QInputDialog dialog(this);
    dialog.setWindowTitle("手动配准");
    dialog.setLabelText("请选择源碎片和目标碎片索引（从0开始）:");
    dialog.setTextValue("0,1");
    
    if (dialog.exec() == QDialog::Accepted) {
        QStringList parts = dialog.textValue().split(",");
        if (parts.size() >= 2) {
            int srcIdx = parts[0].toInt();
            int tgtIdx = parts[1].toInt();
            
            if (srcIdx >= 0 && srcIdx < m_fragments.size() &&
                tgtIdx >= 0 && tgtIdx < m_fragments.size()) {
                
                QMessageBox::information(this, "手动配准",
                    "请在3D视图中为源碎片和目标碎片各选择至少3个对应点。\n"
                    "先在源碎片上选点，再在目标碎片上选对应点。");
                
                m_pointPickingMode = true;
                m_measurementType = 2;
                m_pickedPoints.clear();
                
                logMessage("手动配准模式: 请拾取对应点对");
            }
        }
    }
}

void MainWindow::onRegisterAuto() {
    if (m_fragments.size() < 2) {
        QMessageBox::warning(this, "提示", "请至少添加2个碎片进行配准！");
        return;
    }
    
    m_state = WorkflowState::Registering;
    showStatus("正在进行ICP自动配准...");
    
    runInThread([this]() {
        Eigen::Matrix4d transform = 
            m_registration->automaticRegistration(m_fragments[0], m_fragments[1], "icp");
        m_fragmentTransforms[0] = transform;
        
        QMetaObject::invokeMethod(this, [this]() {
            logMessage("ICP配准完成");
            showStatus("ICP配准完成");
        });
    });
}

void MainWindow::onRegisterCurvature() {
    if (m_fragments.size() < 2) {
        QMessageBox::warning(this, "提示", "请至少添加2个碎片进行配准！");
        return;
    }
    
    m_state = WorkflowState::Registering;
    showStatus("正在进行曲率特征配准...");
    
    runInThread([this]() {
        Eigen::Matrix4d transform = 
            m_registration->curvatureBasedRegistration(m_fragments[0], m_fragments[1]);
        m_fragmentTransforms[0] = transform;
        
        QMetaObject::invokeMethod(this, [this]() {
            logMessage("曲率特征配准完成");
            showStatus("曲率特征配准完成");
        });
    });
}

void MainWindow::onFuseFragments() {
    if (m_fragments.empty()) {
        QMessageBox::warning(this, "提示", "没有可融合的碎片！");
        return;
    }
    
    m_state = WorkflowState::Registering;
    showStatus("正在融合碎片...");
    
    runInThread([this]() {
        PointCloudXYZRGB::Ptr fused = 
            m_registration->fusePointClouds(m_fragments, m_fragmentTransforms);
        
        QMetaObject::invokeMethod(this, [this, fused]() {
            if (fused && !fused->empty()) {
                clearView();
                addPointCloudToView(fused, "FusedModel");
                logMessage("碎片融合完成，共 " + 
                          std::to_string(fused->size()) + " 个点");
            }
        });
    });
}

void MainWindow::onExportOBJ() {
    if (!m_mesh) {
        QMessageBox::warning(this, "提示", "请先生成网格！");
        return;
    }
    
    QString filename = QFileDialog::getSaveFileName(this, "导出OBJ", "", "OBJ (*.obj)");
    if (!filename.isEmpty()) {
        if (m_exporter->exportOBJ(m_mesh, filename.toStdString(), m_texturedMesh.coloredCloud)) {
            logMessage("OBJ模型已导出: " + filename.toStdString());
            showStatus("导出完成");
        }
    }
}

void MainWindow::onExportSTL() {
    if (!m_mesh) {
        QMessageBox::warning(this, "提示", "请先生成网格！");
        return;
    }
    
    QString filename = QFileDialog::getSaveFileName(this, "导出STL", "", "STL (*.stl)");
    if (!filename.isEmpty()) {
        if (m_exporter->exportSTL(m_mesh, filename.toStdString())) {
            logMessage("STL模型已导出: " + filename.toStdString());
            showStatus("导出完成");
        }
    }
}

void MainWindow::onExportPLY() {
    if (!m_mesh) {
        QMessageBox::warning(this, "提示", "请先生成网格！");
        return;
    }
    
    QString filename = QFileDialog::getSaveFileName(this, "导出PLY", "", "PLY (*.ply)");
    if (!filename.isEmpty()) {
        if (m_exporter->exportPLY(m_mesh, filename.toStdString(), m_texturedMesh.coloredCloud)) {
            logMessage("PLY模型已导出: " + filename.toStdString());
            showStatus("导出完成");
        }
    }
}

void MainWindow::onGenerateReport() {
    QString fossilName = QInputDialog::getText(this, "报告信息", "请输入化石名称:");
    if (fossilName.isEmpty()) return;
    
    QString fossilDesc = QInputDialog::getMultiLineText(
        this, "报告信息", "请输入化石描述:", "未描述的古生物化石");
    
    m_reportGenerator->clear();
    m_reportGenerator->setFossilName(fossilName.toStdString());
    m_reportGenerator->setFossilDescription(fossilDesc.toStdString());
    
    for (const auto& meas : m_measurements) {
        m_reportGenerator->addMeasurement(meas);
    }
    
    for (const auto& img : m_fossilImages) {
        m_reportGenerator->addImage(img, "化石照片");
    }
    
    QString filename = QFileDialog::getSaveFileName(this, "生成报告", "", "HTML (*.html)");
    if (!filename.isEmpty()) {
        if (m_reportGenerator->generateReport(filename.toStdString())) {
            logMessage("报告已生成: " + filename.toStdString());
            showStatus("报告生成完成");
            QMessageBox::information(this, "完成", 
                "报告已生成！\n如需PDF格式，请使用浏览器打印为PDF。");
        }
    }
}

void MainWindow::onGenerateOrbitAnimation() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    auto keyframes = m_animator->generateOrbitAnimation(cloud);
    
    QString filename = QFileDialog::getSaveFileName(
        this, "保存动画路径", "", "Path (*.path)");
    if (!filename.isEmpty()) {
        m_animator->saveAnimationPath(keyframes, filename.toStdString());
        logMessage("环绕动画路径已保存: " + filename.toStdString());
        showStatus("动画路径已生成");
    }
}

void MainWindow::onGenerateFlythrough() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    auto keyframes = m_animator->generateFlythroughAnimation(cloud);
    
    QString filename = QFileDialog::getSaveFileName(
        this, "保存动画路径", "", "Path (*.path)");
    if (!filename.isEmpty()) {
        m_animator->saveAnimationPath(keyframes, filename.toStdString());
        logMessage("飞越动画路径已保存: " + filename.toStdString());
        showStatus("动画路径已生成");
    }
}

void MainWindow::onGenerateAxisAnimation() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    auto keyframes = m_animator->generateMainAxisAnimation(cloud);
    
    QString filename = QFileDialog::getSaveFileName(
        this, "保存动画路径", "", "Path (*.path)");
    if (!filename.isEmpty()) {
        m_animator->saveAnimationPath(keyframes, filename.toStdString());
        logMessage("主轴动画路径已保存: " + filename.toStdString());
        showStatus("动画路径已生成");
    }
}

void MainWindow::onAnalyzeGrowthRings() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    m_state = WorkflowState::AnalyzingRings;
    showStatus("正在分析生长纹/年轮...");
    
    runInThread([this, cloud]() {
        GrowthRingResult result = 
            m_ringAnalyzer->analyzeGrowthRings(cloud, "GrowthRings");
        
        QMetaObject::invokeMethod(this, [this, result]() {
            QString msg = QString("生长纹/年轮分析完成:\n检测到 %1 个年轮\n平均宽度: %2")
                .arg(result.count)
                .arg(result.meanWidth, 0, 'f', 2);
            QMessageBox::information(this, "年轮分析结果", msg);
            logMessage("年轮分析完成，检测到 " + 
                      std::to_string(result.count) + " 个年轮");
        });
    });
}

void MainWindow::onClearAll() {
    if (QMessageBox::question(this, "确认", "确定要清除所有数据吗？") 
        == QMessageBox::Yes) {
        clearView();
        m_sparseCloud.reset();
        m_filteredCloud = PointCloudData();
        m_mesh.reset();
        m_texturedMesh = MeshData();
        m_fragments.clear();
        m_fragmentTransforms.clear();
        m_measurements.clear();
        m_imagePaths.clear();
        m_fossilImages.clear();
        updateFragmentList();
        updateMeasurementList();
        logMessage("已清除所有数据");
        showStatus("已清除");
    }
}

void MainWindow::onAnalyzeThickness() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    m_state = WorkflowState::AnalyzingThickness;
    showStatus("正在分析骨质厚度...");
    logMessage("开始骨质厚度分析");
    
    runInThread([this, cloud]() {
        m_thicknessResult = m_thicknessAnalyzer->computeLocalThickness(cloud);
        m_denseRegions = m_thicknessAnalyzer->detectDenseRegions(cloud, m_thicknessResult);
        
        QMetaObject::invokeMethod(this, [this, cloud]() {
            if (m_thicknessResult.thicknessCloud) {
                addPointCloudToView(m_thicknessResult.thicknessCloud, "ThicknessHeatmap");
            }
            
            QString msg = QString("骨质厚度分析完成:\n平均厚度: %1 mm\n最大厚度: %2 mm\n检测到 %3 个致密区域")
                .arg(m_thicknessResult.meanThickness * 1000, 0, 'f', 2)
                .arg(m_thicknessResult.maxThickness * 1000, 0, 'f', 2)
                .arg(m_denseRegions.size());
            QMessageBox::information(this, "厚度分析结果", msg);
            
            logMessage("骨质厚度分析完成，检测到 " + 
                      std::to_string(m_denseRegions.size()) + " 个致密区域");
            showStatus("厚度分析完成");
            m_state = WorkflowState::Idle;
        });
    });
}

void MainWindow::onPlanSampling() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    if (m_denseRegions.empty()) {
        QMessageBox::warning(this, "提示", "请先进行骨质厚度分析！");
        return;
    }
    
    m_state = WorkflowState::PlanningSampling;
    showStatus("正在规划采样路径...");
    logMessage("开始古DNA采样路径规划");
    
    runInThread([this, cloud]() {
        m_samplingPlan = m_samplingPlanner->planSamplingPath(cloud, m_denseRegions);
        
        QMetaObject::invokeMethod(this, [this, cloud]() {
            PointCloudXYZRGB::Ptr visCloud = m_samplingPlanner->generateSamplingVisualization(cloud, m_samplingPlan);
            if (visCloud) {
                addPointCloudToView(visCloud, "SamplingPaths");
            }
            
            QString msg = QString("采样路径规划完成:\n采样点数: %1\n总损伤评分: %2\n平均骨质质量: %3")
                .arg(m_samplingPlan.optimalSamplingPoints.size())
                .arg(m_samplingPlan.totalDamage, 0, 'f', 2)
                .arg(m_samplingPlan.averageBoneQuality, 0, 'f', 2);
            QMessageBox::information(this, "采样路径规划结果", msg);
            
            logMessage("采样路径规划完成，规划了 " + 
                      std::to_string(m_samplingPlan.optimalSamplingPoints.size()) + " 个采样点");
            showStatus("采样路径规划完成");
            m_state = WorkflowState::Idle;
        });
    });
}

void MainWindow::onExtractPhyloFeatures() {
    PointCloudXYZRGB::Ptr cloud = m_filteredCloud.cloud ? 
        m_filteredCloud.cloud : m_sparseCloud;
    
    if (!cloud) {
        QMessageBox::warning(this, "提示", "请先生成或导入点云！");
        return;
    }
    
    bool ok;
    QString taxonName = QInputDialog::getText(this, "输入分类单元名称", 
                                               "分类单元名称:", QLineEdit::Normal, 
                                               "Unknown", &ok);
    if (!ok) return;
    
    QString specimenID = QInputDialog::getText(this, "输入标本编号", 
                                             "标本编号:", QLineEdit::Normal, 
                                             "SP-001", &ok);
    if (!ok) return;
    
    m_state = WorkflowState::ExtractingFeatures;
    showStatus("正在提取系统发育特征...");
    logMessage("开始提取系统发育特征");
    
    runInThread([this, cloud, taxonName, specimenID]() {
        m_phyloDataset = m_phyloExtractor->extractAllFeatures(
            cloud, m_mesh, 
            taxonName.toStdString(), 
            specimenID.toStdString()
        );
        
        QMetaObject::invokeMethod(this, [this]() {
            QString msg = QString("系统发育特征提取完成:\n分类单元: %1\n标本编号: %2\n提取特征数: %3")
                .arg(QString::fromStdString(m_phyloDataset.taxonName))
                .arg(QString::fromStdString(m_phyloDataset.specimenID))
                .arg(m_phyloDataset.features.size()));
            QMessageBox::information(this, "特征提取结果", msg);
            
            logMessage("系统发育特征提取完成，共提取 " + 
                      std::to_string(m_phyloDataset.features.size()) + " 个特征");
            
            QString featureText;
            for (size_t i = 0; i < std::min(m_phyloDataset.features.size(), size_t(20)); ++i) {
                const auto& f = m_phyloDataset.features[i];
                featureText += QString("%1: %2 %3\n")
                    .arg(QString::fromStdString(f.name))
                    .arg(f.value, 0, 'f', 3)
                    .arg(QString::fromStdString(f.unit));
            }
            if (m_phyloDataset.features.size() > 20) {
                featureText += QString("\n... 还有 %1 个特征").arg(m_phyloDataset.features.size() - 20);
            }
            
            QMessageBox::information(this, "特征列表", featureText);
            
            showStatus("特征提取完成");
            m_state = WorkflowState::Idle;
        });
    });
}

void MainWindow::onExportNexus() {
    if (m_phyloDataset.features.empty()) {
        QMessageBox::warning(this, "提示", "请先提取系统发育特征！");
        return;
    }
    
    QString fileName = QFileDialog::getSaveFileName(this, "导出Nexus文件", 
                                                  "phylogenetic_data.nex", 
                                                  "Nexus Files (*.nex *.nexus)");
    if (fileName.isEmpty()) return;
    
    m_state = WorkflowState::ExportingNexus;
    showStatus("正在导出Nexus文件...");
    
    runInThread([this, fileName]() {
        std::vector<PhylogeneticDataset> datasets;
        datasets.push_back(m_phyloDataset);
        
        bool success = m_nexusExporter->exportToFile(fileName.toStdString(), datasets);
        
        QMetaObject::invokeMethod(this, [this, success, fileName]() {
            if (success) {
                QMessageBox::information(this, "导出成功", 
                    QString("Nexus文件已导出到:\n%1").arg(fileName));
                logMessage("Nexus文件导出成功: " + fileName.toStdString());
            } else {
                QMessageBox::critical(this, "导出失败", "Nexus文件导出失败！");
                logMessage("Nexus文件导出失败");
            }
            showStatus("导出完成");
            m_state = WorkflowState::Idle;
        });
    });
}

void MainWindow::onAbout() {
    QMessageBox::about(this, "关于",
        "<h2>古生物化石三维重建系统 Fossil3D</h2>"
        "<p>版本: 1.0.0</p>"
        "<p>基于C++、OpenCV、PCL、VTK和Qt开发的专业古生物化石三维重建与分析软件。</p>"
        "<p>功能包括:</p>"
        "<ul>"
        "<li>多视角SfM三维重建</li>"
        "<li>点云处理与网格生成</li>"
        "<li>专业测量工具</li>"
        "<li>化石碎片拼接</li>"
        "<li>动画漫游与生长纹分析</li>"
        "<li>古DNA采样路径规划</li>"
        "<li>系统发育特征提取与Nexus导出</li>"
        "</ul>");
}

}
