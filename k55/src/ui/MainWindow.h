#pragma once
#include <QMainWindow>
#include <QWidget>
#include <QLabel>
#include <QSlider>
#include <QSpinBox>
#include <QPushButton>
#include <QComboBox>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGroupBox>
#include <QTimer>
#include <QWindowContainer>

#include "VulkanWindow.h"

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);
    ~MainWindow() override;

private slots:
    void updateStats();
    void onVoxelTypeChanged(int index);
    void onRenderDistanceChanged(int value);
    void onWorldSizeChanged(int value);
    void onSeedChanged(int value);
    void onRegenerateTerrain();
    void onResetCamera();
    void onSSAORadiusChanged(int value);
    void onSSAOStrengthChanged(int value);
    void onReflectionStrengthChanged(int value);
    void onWaterLevelChanged(int value);

private:
    void createControls();
    void createStatusBar();

    VulkanWindow* vulkanWindow;
    QWidget* container;

    QLabel* fpsLabel;
    QLabel* chunksLabel;
    QLabel* positionLabel;
    QLabel* voxelTypeLabel;

    QComboBox* voxelTypeCombo;
    QSlider* renderDistanceSlider;
    QSpinBox* worldSizeSpin;
    QSpinBox* seedSpin;
    QPushButton* regenerateBtn;
    QPushButton* resetCameraBtn;

    QSlider* ssaoRadiusSlider;
    QSlider* ssaoStrengthSlider;
    QSlider* reflectionStrengthSlider;
    QSlider* waterLevelSlider;
    QLabel* ssaoRadiusValueLabel;
    QLabel* ssaoStrengthValueLabel;
    QLabel* reflectionStrengthValueLabel;
    QLabel* waterLevelValueLabel;

    QTimer* statsTimer;

    int worldSize = 16;
    unsigned int terrainSeed = 12345;
    float ssaoBias = 0.025f;
    float ssaoPower = 1.5f;
    int ssaoKernelSize = 64;
};
