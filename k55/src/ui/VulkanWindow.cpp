#include "VulkanWindow.h"
#include <QDateTime>
#include <QApplication>
#include <QScreen>
#include <QMessageBox>
#include <cmath>
#include <iostream>

VulkanWindow::VulkanWindow(QWindow* parent)
    : QWindow(parent)
{
    setSurfaceType(VulkanSurface);
    setTitle("Voxel Engine");
    resize(1280, 720);

    renderer = std::make_unique<VulkanRenderer>();
    camera = std::make_unique<Camera>();
    chunkManager = std::make_unique<ChunkManager>(8, terrainSeed);

    lightData.direction = Vec3(-0.5f, -0.8f, -0.3f).normalized();
    lightData.color = Vec3(1.0f, 0.95f, 0.85f);
    lightData.intensity = 1.2f;
    lightData.ambient = 0.35f;
    lightData.shadowBias = 0.005f;

    renderTimer = new QTimer(this);
    connect(renderTimer, &QTimer::timeout, this, &VulkanWindow::renderLoop);
    renderTimer->start(0);

    lastTime = QDateTime::currentMSecsSinceEpoch();
}

VulkanWindow::~VulkanWindow() {
    if (renderer) {
        renderer->cleanup();
    }
}

bool VulkanWindow::event(QEvent* event) {
    switch (event->type()) {
        case QEvent::UpdateRequest:
            if (isExposed()) {
                render();
            }
            return true;
        default:
            return QWindow::event(event);
    }
}

void VulkanWindow::exposeEvent(QExposeEvent* event) {
    Q_UNUSED(event);
    if (isExposed() && !vulkanInitialized) {
        initVulkan();
    }
    if (isExposed()) {
        render();
    }
}

void VulkanWindow::resizeEvent(QResizeEvent* event) {
    QWindow::resizeEvent(event);
    if (vulkanInitialized && renderer) {
        camera->setAspectRatio(static_cast<float>(width()) / static_cast<float>(height()));
        renderer->resize(width(), height());
        if (isExposed()) {
            render();
        }
    }
}

void VulkanWindow::initVulkan() {
    try {
        HWND hwnd = reinterpret_cast<HWND>(winId());
        renderer->init(hwnd, width(), height());

        camera->setAspectRatio(static_cast<float>(width()) / static_cast<float>(height()));
        camera->setPosition(Vec3(0.0f, 35.0f, 30.0f));
        camera->setRotation(3.14159f, -0.3f);

        chunkManager->generateTerrain(worldSize);

        renderer->setSSAOParams(0.5f, 0.025f, 1.5f, 64);
        renderer->setPostprocessParams(1.0f, 0.6f, 5.0f);

        vulkanInitialized = true;
        emit update();
    } catch (const std::exception& e) {
        QMessageBox::critical(nullptr, "Vulkan Error",
            QString("Failed to initialize Vulkan: %1").arg(e.what()));
        close();
    }
}

void VulkanWindow::keyPressEvent(QKeyEvent* event) {
    if (event->key() < 0x10000) {
        keys[event->key()] = true;
    }

    if (event->key() == Qt::Key_Escape) {
        mouseCaptured = false;
        setCursor(Qt::ArrowCursor);
    }

    if (event->key() == Qt::Key_F1) {
        if (!mouseCaptured) {
            mouseCaptured = true;
            lastMousePos = QCursor::pos();
            setCursor(Qt::BlankCursor);
        }
    }

    if (event->key() >= Qt::Key_1 && event->key() <= Qt::Key_9) {
        int idx = event->key() - Qt::Key_1;
        static const VoxelType types[] = {
            VoxelType::GRASS, VoxelType::DIRT, VoxelType::STONE,
            VoxelType::SAND, VoxelType::WOOD, VoxelType::LEAVES,
            VoxelType::SNOW, VoxelType::WATER, VoxelType::BEDROCK
        };
        if (idx < 9) {
            currentVoxelType = types[idx];
        }
    }

    if (event->key() == Qt::Key_R) {
        regenerateTerrain(worldSize, terrainSeed + 1);
    }
}

void VulkanWindow::keyReleaseEvent(QKeyEvent* event) {
    if (event->key() < 0x10000) {
        keys[event->key()] = false;
    }
}

void VulkanWindow::mousePressEvent(QMouseEvent* event) {
    if (event->button() == Qt::LeftButton) {
        if (!mouseCaptured) {
            mouseCaptured = true;
            lastMousePos = event->globalPosition().toPoint();
            setCursor(Qt::BlankCursor);
            return;
        }
        mouseButtons[0] = true;
        performRaycast(true);
    } else if (event->button() == Qt::RightButton) {
        mouseButtons[1] = true;
        performRaycast(false);
    } else if (event->button() == Qt::MiddleButton) {
        mouseButtons[2] = true;
    }
}

void VulkanWindow::mouseMoveEvent(QMouseEvent* event) {
    if (mouseCaptured) {
        QPoint currentPos = event->globalPosition().toPoint();
        QPoint center = mapToGlobal(QPoint(width() / 2, height() / 2));

        if (currentPos != center) {
            int dx = currentPos.x() - center.x();
            int dy = currentPos.y() - center.y();

            camera->handleMouseMove(dx, dy);

            QCursor::setPos(center);
            lastMousePos = center;
        }
    }
}

void VulkanWindow::mouseReleaseEvent(QMouseEvent* event) {
    if (event->button() == Qt::LeftButton) {
        mouseButtons[0] = false;
    } else if (event->button() == Qt::RightButton) {
        mouseButtons[1] = false;
    } else if (event->button() == Qt::MiddleButton) {
        mouseButtons[2] = false;
    }
}

void VulkanWindow::wheelEvent(QWheelEvent* event) {
    camera->handleMouseWheel(static_cast<float>(event->angleDelta().y()));
}

void VulkanWindow::renderLoop() {
    if (!isExposed() || !vulkanInitialized) {
        return;
    }

    qint64 currentTime = QDateTime::currentMSecsSinceEpoch();
    float deltaTime = (currentTime - lastTime) / 1000.0f;
    lastTime = currentTime;

    fpsTimer += deltaTime;
    frameCount++;
    if (fpsTimer >= 1.0f) {
        fps = static_cast<float>(frameCount) / fpsTimer;
        frameCount = 0;
        fpsTimer = 0.0f;
    }

    update(deltaTime);
    requestUpdate();
}

void VulkanWindow::update(float deltaTime) {
    if (deltaTime > 0.1f) deltaTime = 0.1f;

    camera->update(deltaTime, keys);
    chunkManager->regenerateDirtyMeshes();
}

bool VulkanWindow::voxelHitTest(int x, int y, int z, void* userData) {
    ChunkManager* manager = static_cast<ChunkManager*>(userData);
    VoxelType type = manager->getVoxelWorld(x, y, z);
    return type != VoxelType::AIR;
}

void VulkanWindow::performRaycast(bool remove) {
    if (!chunkManager || !camera) return;

    Vec3 start = camera->getPosition();
    Vec3 dir = camera->getForward();

    Vec3 hitPoint;
    IVec3 hitVoxel;
    Vec3 hitNormal;
    bool hit = false;

    camera->raycast(start, dir, 8.0f, &voxelHitTest, chunkManager.get(),
                    hitPoint, hitVoxel, hitNormal, hit);

    if (hit) {
        if (remove) {
            chunkManager->updateVoxel(hitVoxel.x, hitVoxel.y, hitVoxel.z, VoxelType::AIR);
        } else {
            IVec3 placePos = hitVoxel + IVec3(
                static_cast<int>(hitNormal.x),
                static_cast<int>(hitNormal.y),
                static_cast<int>(hitNormal.z)
            );

            Vec3 camPos = camera->getPosition();
            IVec3 camVoxel(
                static_cast<int>(std::floor(camPos.x)),
                static_cast<int>(std::floor(camPos.y)),
                static_cast<int>(std::floor(camPos.z))
            );

            if (placePos != camVoxel &&
                placePos != camVoxel + IVec3(0, 1, 0)) {
                chunkManager->updateVoxel(placePos.x, placePos.y, placePos.z, currentVoxelType);
            }
        }
    }
}

void VulkanWindow::updateUniforms() {
    CameraUniforms camUbo{};
    camUbo.view = camera->getViewMatrix();
    camUbo.projection = camera->getProjectionMatrix();
    camUbo.viewProjection = camera->getViewProjectionMatrix();
    camUbo.cameraPos = camera->getPosition();

    Mat4 lightView = Mat4::lookAt(
        -lightData.direction * 150.0f,
        Vec3(0.0f, 0.0f, 0.0f),
        Vec3(0.0f, 1.0f, 0.0f)
    );

    float shadowOrthoSize = 120.0f;
    Mat4 lightProj = Mat4::ortho(
        -shadowOrthoSize, shadowOrthoSize,
        -shadowOrthoSize, shadowOrthoSize,
        -100.0f, 300.0f
    );

    LightUniforms lightUbo{};
    lightUbo.lightSpace = lightProj * lightView;
    lightUbo.lightDir = lightData.direction;
    lightUbo.lightColor = lightData.color;
    lightUbo.intensity = lightData.intensity;
    lightUbo.ambient = lightData.ambient;
    lightUbo.shadowBias = lightData.shadowBias;

    renderer->updateCameraUniforms(camUbo);
    renderer->updateLightUniforms(lightUbo);
}

void VulkanWindow::render() {
    if (!vulkanInitialized || !renderer || !chunkManager || !camera) return;
    if (rendering.exchange(true)) return;

    try {
        updateUniforms();

        Frustum frustum = camera->getFrustum();
        Vec3 camPos = camera->getPosition();
        auto visibleChunks = chunkManager->getVisibleChunks(frustum, camPos);
        visibleChunkCount = static_cast<int>(visibleChunks.size());

        renderer->beginFrame();
        renderer->renderChunks(visibleChunks);
        renderer->endFrame();
    } catch (const std::exception& e) {
        std::cerr << "Render error: " << e.what() << std::endl;
    }

    rendering = false;
}

void VulkanWindow::regenerateTerrain(int size, unsigned int seed) {
    worldSize = size;
    terrainSeed = seed;
    if (chunkManager && renderer) {
        vkDeviceWaitIdle(renderer->getDevice());
        chunkManager = std::make_unique<ChunkManager>(8, seed);
        chunkManager->generateTerrain(worldSize);
        renderer->clearChunkMeshes();
        resetCamera();
    }
}

void VulkanWindow::setRenderDistance(int distance) {
    if (chunkManager) {
        chunkManager->setRenderDistance(distance);
    }
}

void VulkanWindow::resetCamera() {
    if (camera) {
        camera->setPosition(Vec3(0.0f, 35.0f, 30.0f));
        camera->setRotation(3.14159f, -0.3f);
    }
}
