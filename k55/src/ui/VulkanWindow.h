#pragma once
#include <QWindow>
#include <QTimer>
#include <QKeyEvent>
#include <QMouseEvent>
#include <memory>
#include <atomic>

#include "../render/VulkanRenderer.h"
#include "../voxel/ChunkManager.h"
#include "../core/Camera.h"
#include "../render/Lighting.h"

class VulkanWindow : public QWindow {
    Q_OBJECT

public:
    explicit VulkanWindow(QWindow* parent = nullptr);
    ~VulkanWindow() override;

    void setVoxelType(VoxelType type) { currentVoxelType = type; }
    VoxelType getVoxelType() const { return currentVoxelType; }

    int getVisibleChunkCount() const { return visibleChunkCount; }
    int getTotalChunkCount() const { return chunkManager ? static_cast<int>(chunkManager->getTotalChunkCount()) : 0; }
    float getFps() const { return fps; }

    void regenerateTerrain(int size, unsigned int seed);
    void setRenderDistance(int distance);
    void resetCamera();

    void setSSAOParams(float radius, float bias, float power, int kernelSize) {
        if (renderer) renderer->setSSAOParams(radius, bias, power, kernelSize);
    }

    void setPostprocessParams(float ssaoStrength, float reflectionStrength, float waterLevel) {
        if (renderer) renderer->setPostprocessParams(ssaoStrength, reflectionStrength, waterLevel);
    }

protected:
    void exposeEvent(QExposeEvent* event) override;
    void resizeEvent(QResizeEvent* event) override;
    void keyPressEvent(QKeyEvent* event) override;
    void keyReleaseEvent(QKeyEvent* event) override;
    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void wheelEvent(QWheelEvent* event) override;
    bool event(QEvent* event) override;

private slots:
    void renderLoop();

private:
    void initVulkan();
    void update(float deltaTime);
    void render();
    void updateUniforms();

    static bool voxelHitTest(int x, int y, int z, void* userData);
    void performRaycast(bool remove);

    std::unique_ptr<VulkanRenderer> renderer;
    std::unique_ptr<ChunkManager> chunkManager;
    std::unique_ptr<Camera> camera;

    bool keys[0x10000] = {false};
    bool mouseButtons[3] = {false};
    QPoint lastMousePos;
    bool mouseCaptured = false;
    bool vulkanInitialized = false;

    VoxelType currentVoxelType = VoxelType::GRASS;

    LightData lightData;

    QTimer* renderTimer;
    qint64 lastTime = 0;
    float fps = 0.0f;
    int frameCount = 0;
    float fpsTimer = 0.0f;
    int visibleChunkCount = 0;

    std::atomic<bool> rendering{false};

    int worldSize = 16;
    unsigned int terrainSeed = 12345;
};
