#include "MainWindow.h"
#include <QStatusBar>
#include <QMessageBox>
#include <QLocale>

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
{
    setWindowTitle("Voxel Engine - Vulkan");
    resize(1600, 900);

    vulkanWindow = new VulkanWindow();
    container = QWidget::createWindowContainer(vulkanWindow, this);
    container->setMinimumSize(800, 600);
    container->setFocusPolicy(Qt::StrongFocus);

    createControls();
    createStatusBar();

    QWidget* centralWidget = new QWidget(this);
    QHBoxLayout* mainLayout = new QHBoxLayout(centralWidget);
    mainLayout->setContentsMargins(5, 5, 5, 5);
    mainLayout->setSpacing(5);

    mainLayout->addWidget(container, 1);

    QWidget* controlsWidget = new QWidget(this);
    controlsWidget->setFixedWidth(280);
    QVBoxLayout* controlsLayout = new QVBoxLayout(controlsWidget);
    controlsLayout->setContentsMargins(0, 0, 0, 0);
    controlsLayout->setSpacing(10);

    QGroupBox* statsGroup = new QGroupBox("Statistics", this);
    QVBoxLayout* statsLayout = new QVBoxLayout(statsGroup);
    statsLayout->addWidget(fpsLabel);
    statsLayout->addWidget(chunksLabel);
    statsLayout->addWidget(positionLabel);
    statsLayout->addWidget(voxelTypeLabel);
    controlsLayout->addWidget(statsGroup);

    QGroupBox* voxelGroup = new QGroupBox("Voxel Type (1-9)", this);
    QVBoxLayout* voxelLayout = new QVBoxLayout(voxelGroup);
    voxelLayout->addWidget(voxelTypeCombo);
    controlsLayout->addWidget(voxelGroup);

    QGroupBox* viewGroup = new QGroupBox("View Settings", this);
    QVBoxLayout* viewLayout = new QVBoxLayout(viewGroup);

    QLabel* renderDistLabel = new QLabel("Render Distance:", this);
    viewLayout->addWidget(renderDistLabel);
    viewLayout->addWidget(renderDistanceSlider);

    viewLayout->addWidget(resetCameraBtn);
    controlsLayout->addWidget(viewGroup);

    QGroupBox* terrainGroup = new QGroupBox("Terrain Generation", this);
    QVBoxLayout* terrainLayout = new QVBoxLayout(terrainGroup);

    QHBoxLayout* sizeLayout = new QHBoxLayout();
    sizeLayout->addWidget(new QLabel("World Size:", this));
    sizeLayout->addWidget(worldSizeSpin);
    terrainLayout->addLayout(sizeLayout);

    QHBoxLayout* seedLayout = new QHBoxLayout();
    seedLayout->addWidget(new QLabel("Seed:", this));
    seedLayout->addWidget(seedSpin);
    terrainLayout->addLayout(seedLayout);

    terrainLayout->addWidget(regenerateBtn);
    controlsLayout->addWidget(terrainGroup);

    QGroupBox* postEffectsGroup = new QGroupBox("Post Effects", this);
    QVBoxLayout* postEffectsLayout = new QVBoxLayout(postEffectsGroup);

    postEffectsLayout->addWidget(ssaoRadiusValueLabel);
    postEffectsLayout->addWidget(ssaoRadiusSlider);

    postEffectsLayout->addWidget(ssaoStrengthValueLabel);
    postEffectsLayout->addWidget(ssaoStrengthSlider);

    postEffectsLayout->addWidget(reflectionStrengthValueLabel);
    postEffectsLayout->addWidget(reflectionStrengthSlider);

    postEffectsLayout->addWidget(waterLevelValueLabel);
    postEffectsLayout->addWidget(waterLevelSlider);

    controlsLayout->addWidget(postEffectsGroup);

    QGroupBox* helpGroup = new QGroupBox("Controls", this);
    QVBoxLayout* helpLayout = new QVBoxLayout(helpGroup);
    helpLayout->addWidget(new QLabel("• F1 / Click: Capture mouse", this));
    helpLayout->addWidget(new QLabel("• ESC: Release mouse", this));
    helpLayout->addWidget(new QLabel("• WASD: Move", this));
    helpLayout->addWidget(new QLabel("• Space/Shift: Up/Down", this));
    helpLayout->addWidget(new QLabel("• Q/E: Down/Up", this));
    helpLayout->addWidget(new QLabel("• Mouse: Look around", this));
    helpLayout->addWidget(new QLabel("• Left Click: Remove voxel", this));
    helpLayout->addWidget(new QLabel("• Right Click: Place voxel", this));
    helpLayout->addWidget(new QLabel("• Scroll: Zoom (FOV)", this));
    helpLayout->addWidget(new QLabel("• 1-9: Select voxel type", this));
    helpLayout->addWidget(new QLabel("• R: Regenerate terrain", this));
    controlsLayout->addWidget(helpGroup);

    controlsLayout->addStretch();
    mainLayout->addWidget(controlsWidget);

    setCentralWidget(centralWidget);

    statsTimer = new QTimer(this);
    connect(statsTimer, &QTimer::timeout, this, &MainWindow::updateStats);
    statsTimer->start(200);

    container->setFocus();
}

MainWindow::~MainWindow() {
}

void MainWindow::createControls() {
    fpsLabel = new QLabel("FPS: 0", this);
    fpsLabel->setStyleSheet("font-family: 'Consolas', monospace; font-size: 12px;");

    chunksLabel = new QLabel("Chunks: 0 visible / 0 total", this);
    chunksLabel->setStyleSheet("font-family: 'Consolas', monospace; font-size: 12px;");

    positionLabel = new QLabel("Position: (0, 0, 0)", this);
    positionLabel->setStyleSheet("font-family: 'Consolas', monospace; font-size: 12px;");

    voxelTypeLabel = new QLabel("Voxel: Grass", this);
    voxelTypeLabel->setStyleSheet("font-family: 'Consolas', monospace; font-size: 12px;");

    voxelTypeCombo = new QComboBox(this);
    voxelTypeCombo->addItem("1 - Grass", static_cast<int>(VoxelType::GRASS));
    voxelTypeCombo->addItem("2 - Dirt", static_cast<int>(VoxelType::DIRT));
    voxelTypeCombo->addItem("3 - Stone", static_cast<int>(VoxelType::STONE));
    voxelTypeCombo->addItem("4 - Sand", static_cast<int>(VoxelType::SAND));
    voxelTypeCombo->addItem("5 - Wood", static_cast<int>(VoxelType::WOOD));
    voxelTypeCombo->addItem("6 - Leaves", static_cast<int>(VoxelType::LEAVES));
    voxelTypeCombo->addItem("7 - Snow", static_cast<int>(VoxelType::SNOW));
    voxelTypeCombo->addItem("8 - Water", static_cast<int>(VoxelType::WATER));
    voxelTypeCombo->addItem("9 - Bedrock", static_cast<int>(VoxelType::BEDROCK));
    connect(voxelTypeCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onVoxelTypeChanged);

    renderDistanceSlider = new QSlider(Qt::Horizontal, this);
    renderDistanceSlider->setMinimum(2);
    renderDistanceSlider->setMaximum(16);
    renderDistanceSlider->setValue(8);
    renderDistanceSlider->setTickPosition(QSlider::TicksBelow);
    renderDistanceSlider->setTickInterval(2);
    connect(renderDistanceSlider, &QSlider::valueChanged,
            this, &MainWindow::onRenderDistanceChanged);

    worldSizeSpin = new QSpinBox(this);
    worldSizeSpin->setMinimum(4);
    worldSizeSpin->setMaximum(64);
    worldSizeSpin->setValue(16);
    worldSizeSpin->setSingleStep(4);
    connect(worldSizeSpin, QOverload<int>::of(&QSpinBox::valueChanged),
            this, &MainWindow::onWorldSizeChanged);

    seedSpin = new QSpinBox(this);
    seedSpin->setMinimum(0);
    seedSpin->setMaximum(999999);
    seedSpin->setValue(12345);
    connect(seedSpin, QOverload<int>::of(&QSpinBox::valueChanged),
            this, &MainWindow::onSeedChanged);

    regenerateBtn = new QPushButton("Regenerate Terrain", this);
    connect(regenerateBtn, &QPushButton::clicked,
            this, &MainWindow::onRegenerateTerrain);

    resetCameraBtn = new QPushButton("Reset Camera", this);
    connect(resetCameraBtn, &QPushButton::clicked,
            this, &MainWindow::onResetCamera);

    ssaoRadiusSlider = new QSlider(Qt::Horizontal, this);
    ssaoRadiusSlider->setMinimum(1);
    ssaoRadiusSlider->setMaximum(30);
    ssaoRadiusSlider->setValue(5);
    ssaoRadiusSlider->setTickPosition(QSlider::TicksBelow);
    ssaoRadiusSlider->setTickInterval(5);
    ssaoRadiusValueLabel = new QLabel("SSAO Radius: 0.50", this);
    ssaoRadiusValueLabel->setStyleSheet("font-family: 'Consolas', monospace; font-size: 12px;");
    connect(ssaoRadiusSlider, &QSlider::valueChanged,
            this, &MainWindow::onSSAORadiusChanged);

    ssaoStrengthSlider = new QSlider(Qt::Horizontal, this);
    ssaoStrengthSlider->setMinimum(0);
    ssaoStrengthSlider->setMaximum(20);
    ssaoStrengthSlider->setValue(10);
    ssaoStrengthSlider->setTickPosition(QSlider::TicksBelow);
    ssaoStrengthSlider->setTickInterval(5);
    ssaoStrengthValueLabel = new QLabel("SSAO Strength: 1.00", this);
    ssaoStrengthValueLabel->setStyleSheet("font-family: 'Consolas', monospace; font-size: 12px;");
    connect(ssaoStrengthSlider, &QSlider::valueChanged,
            this, &MainWindow::onSSAOStrengthChanged);

    reflectionStrengthSlider = new QSlider(Qt::Horizontal, this);
    reflectionStrengthSlider->setMinimum(0);
    reflectionStrengthSlider->setMaximum(10);
    reflectionStrengthSlider->setValue(6);
    reflectionStrengthSlider->setTickPosition(QSlider::TicksBelow);
    reflectionStrengthSlider->setTickInterval(2);
    reflectionStrengthValueLabel = new QLabel("Reflection Strength: 0.60", this);
    reflectionStrengthValueLabel->setStyleSheet("font-family: 'Consolas', monospace; font-size: 12px;");
    connect(reflectionStrengthSlider, &QSlider::valueChanged,
            this, &MainWindow::onReflectionStrengthChanged);

    waterLevelSlider = new QSlider(Qt::Horizontal, this);
    waterLevelSlider->setMinimum(-100);
    waterLevelSlider->setMaximum(200);
    waterLevelSlider->setValue(50);
    waterLevelSlider->setTickPosition(QSlider::TicksBelow);
    waterLevelSlider->setTickInterval(50);
    waterLevelValueLabel = new QLabel("Water Level: 5.00", this);
    waterLevelValueLabel->setStyleSheet("font-family: 'Consolas', monospace; font-size: 12px;");
    connect(waterLevelSlider, &QSlider::valueChanged,
            this, &MainWindow::onWaterLevelChanged);
}

void MainWindow::createStatusBar() {
    QStatusBar* bar = statusBar();
    bar->showMessage("Ready. Click the viewport to start exploring.");
}

void MainWindow::updateStats() {
    if (!vulkanWindow) return;

    float fps = vulkanWindow->getFps();
    int visible = vulkanWindow->getVisibleChunkCount();
    int total = vulkanWindow->getTotalChunkCount();

    fpsLabel->setText(QString("FPS: %1").arg(static_cast<int>(fps)));
    chunksLabel->setText(QString("Chunks: %1 visible / %2 total").arg(visible).arg(total));

    const Camera* cam = nullptr;
    if (vulkanWindow->metaObject()->indexOfProperty("camera") >= 0) {
        QVariant camVar = vulkanWindow->property("camera");
    }

    QLocale locale(QLocale::English);
    voxelTypeLabel->setText(QString("Voxel: %1")
        .arg(voxelTypeCombo->currentText().split(" - ").last()));
}

void MainWindow::onVoxelTypeChanged(int index) {
    if (!vulkanWindow) return;
    VoxelType type = static_cast<VoxelType>(voxelTypeCombo->currentData().toInt());
    vulkanWindow->setVoxelType(type);
    container->setFocus();
}

void MainWindow::onRenderDistanceChanged(int value) {
    if (!vulkanWindow) return;
    vulkanWindow->setRenderDistance(value);
    container->setFocus();
}

void MainWindow::onWorldSizeChanged(int value) {
    worldSize = value;
}

void MainWindow::onSeedChanged(int value) {
    terrainSeed = static_cast<unsigned int>(value);
}

void MainWindow::onRegenerateTerrain() {
    if (!vulkanWindow) return;

    QMessageBox::StandardButton reply = QMessageBox::question(this,
        "Regenerate Terrain",
        "Are you sure you want to regenerate the terrain?\nAll changes will be lost.",
        QMessageBox::Yes | QMessageBox::No);

    if (reply == QMessageBox::Yes) {
        vulkanWindow->regenerateTerrain(worldSize, terrainSeed);
        container->setFocus();
    }
}

void MainWindow::onResetCamera() {
    if (!vulkanWindow) return;
    vulkanWindow->resetCamera();
    container->setFocus();
}

void MainWindow::onSSAORadiusChanged(int value) {
    if (!vulkanWindow) return;
    float radius = value / 10.0f;
    vulkanWindow->setSSAOParams(radius, ssaoBias, ssaoPower, ssaoKernelSize);
    ssaoRadiusValueLabel->setText(QString("SSAO Radius: %1").arg(radius, 0, 'f', 2));
    container->setFocus();
}

void MainWindow::onSSAOStrengthChanged(int value) {
    if (!vulkanWindow) return;
    float strength = value / 10.0f;
    float reflectionStrength = reflectionStrengthSlider->value() / 10.0f;
    float waterLevel = waterLevelSlider->value() / 10.0f;
    vulkanWindow->setPostprocessParams(strength, reflectionStrength, waterLevel);
    ssaoStrengthValueLabel->setText(QString("SSAO Strength: %1").arg(strength, 0, 'f', 2));
    container->setFocus();
}

void MainWindow::onReflectionStrengthChanged(int value) {
    if (!vulkanWindow) return;
    float reflectionStrength = value / 10.0f;
    float ssaoStrength = ssaoStrengthSlider->value() / 10.0f;
    float waterLevel = waterLevelSlider->value() / 10.0f;
    vulkanWindow->setPostprocessParams(ssaoStrength, reflectionStrength, waterLevel);
    reflectionStrengthValueLabel->setText(QString("Reflection Strength: %1").arg(reflectionStrength, 0, 'f', 2));
    container->setFocus();
}

void MainWindow::onWaterLevelChanged(int value) {
    if (!vulkanWindow) return;
    float waterLevel = value / 10.0f;
    float ssaoStrength = ssaoStrengthSlider->value() / 10.0f;
    float reflectionStrength = reflectionStrengthSlider->value() / 10.0f;
    vulkanWindow->setPostprocessParams(ssaoStrength, reflectionStrength, waterLevel);
    waterLevelValueLabel->setText(QString("Water Level: %1").arg(waterLevel, 0, 'f', 2));
    container->setFocus();
}
