#include "vk浮雕/light_tracker.h"
#include "vk浮雕/logger.h"
#include <algorithm>
#include <cmath>

namespace vk浮雕 {

LightTracker::~LightTracker() {
    cleanup();
}

bool LightTracker::init(const Config& config) {
    std::lock_guard<std::mutex> lock(m_mutex);

    m_config = config;

    if (config.defaultLightDir.length() < 1e-6f) {
        m_config.defaultLightDir = Vec3(-0.5f, -0.5f, 0.7f);
    }

    m_currentLightDir = m_config.defaultLightDir.normalized();
    m_targetLightDir = m_currentLightDir;
    m_previousLightDir = m_currentLightDir;

    if (m_config.enableTracking && !m_config.modelPath.empty()) {
        m_detector = ObjectDetectorFactory::create("yolov8n");
        if (!m_detector) {
            LOG_ERROR() << "Failed to create YOLO detector";
            return false;
        }

        if (!m_detector->init(m_config.modelPath, m_config.gpuId)) {
            LOG_ERROR() << "Failed to init YOLO detector with model: " << m_config.modelPath;
            m_detector.reset();
            return false;
        }

        m_detector->setConfidenceThreshold(m_config.confidenceThreshold);
        m_detector->setNMSThreshold(m_config.nmsThreshold);
        m_detector->setTargetClasses(m_config.targetClasses);

        LOG_INFO() << "Light tracker initialized with YOLO detection";
        LOG_INFO() << "  Target classes: " << m_config.targetClasses.size() << " categories";
        LOG_INFO() << "  Update interval: " << m_config.updateIntervalSec << "s";
    } else if (m_config.enableTracking) {
        LOG_WARNING() << "Tracking enabled but no model path specified";
        m_config.enableTracking = false;
    }

    m_baseLightParams.ambientIntensity = 0.3f;
    m_baseLightParams.directionalIntensity = 1.2f;
    m_baseLightParams.heightScale = 0.1f;
    m_baseLightParams.lightDirX = m_currentLightDir.x;
    m_baseLightParams.lightDirY = m_currentLightDir.y;
    m_baseLightParams.lightDirZ = m_currentLightDir.z;

    m_lastDetectionTime = std::chrono::steady_clock::now();
    m_initialized = true;

    LOG_INFO() << "Light tracker initialized (tracking="
               << (m_config.enableTracking ? "ON" : "OFF") << ")";
    return true;
}

void LightTracker::cleanup() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_detector) {
        m_detector->cleanup();
        m_detector.reset();
    }
    m_initialized = false;
}

Vec3 LightTracker::computeLightDirForObject(const Detection& det,
    uint32_t imageWidth, uint32_t imageHeight) {
    float normX = det.centerX() / imageWidth;
    float normY = det.centerY() / imageHeight;

    float dirX = (normX - 0.5f) * -2.0f;
    float dirY = (normY - 0.5f) * -2.0f;
    float dirZ = 0.7f;

    return Vec3(dirX, dirY, dirZ).normalized();
}

const Detection* LightTracker::selectBestTarget(const DetectionResult& result) {
    if (result.detections.empty()) return nullptr;

    float totalImageArea = static_cast<float>(result.imageWidth) * result.imageHeight;
    const Detection* best = nullptr;
    float bestScore = -1.0f;

    for (const auto& det : result.detections) {
        float normArea = det.area() / totalImageArea;
        if (normArea < m_config.minObjectArea || normArea > m_config.maxObjectArea) {
            continue;
        }

        float score = det.confidence * (1.0f + normArea * 2.0f);
        if (score > bestScore) {
            bestScore = score;
            best = &det;
        }
    }

    return best;
}

bool LightTracker::shouldUpdateDetection() {
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration<float>(now - m_lastDetectionTime).count();
    return elapsed >= m_config.updateIntervalSec;
}

void LightTracker::updateDetections(const DetectionResult& result) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return;

    m_lastResult = result;

    const Detection* target = selectBestTarget(result);
    if (target) {
        Vec3 newDir = computeLightDirForObject(*target, result.imageWidth, result.imageHeight);

        m_previousLightDir = m_currentLightDir;
        m_targetLightDir = newDir;
        m_interpolating = true;
        m_lastInterpStartTime = std::chrono::steady_clock::now();

        LOG_DEBUG() << "Light target: " << target->className
                    << " at (" << target->centerX() << "," << target->centerY() << ")"
                    << " -> dir(" << newDir.x << "," << newDir.y << "," << newDir.z << ")";
    }

    m_lastDetectionTime = std::chrono::steady_clock::now();
}

void LightTracker::updateFrame(const Frame& frame) {
    updateFrame(frame.ptr(), frame.width, frame.height, 4);
}

void LightTracker::updateFrame(const uint8_t* imageData, uint32_t w, uint32_t h, uint32_t channels) {
    if (!m_config.enableTracking || !m_detector) return;
    if (!shouldUpdateDetection()) return;

    DetectionResult result = m_detector->detect(imageData, w, h, channels);
    updateDetections(result);
}

void LightTracker::step() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return;

    if (m_interpolating) {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration<float>(now - m_lastInterpStartTime).count();

        float interpDuration = 1.0f;
        float t = std::min(1.0f, elapsed / interpDuration);

        t = t * t * (3.0f - 2.0f * t);

        m_currentLightDir = Vec3::slerp(m_previousLightDir, m_targetLightDir, t);

        if (t >= 1.0f) {
            m_interpolating = false;
            m_currentLightDir = m_targetLightDir;
        }
    }
}

LightParams LightTracker::getLightParams() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    LightParams params = m_baseLightParams;
    params.lightDirX = m_currentLightDir.x;
    params.lightDirY = m_currentLightDir.y;
    params.lightDirZ = m_currentLightDir.z;
    return params;
}

Vec3 LightTracker::getCurrentLightDir() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_currentLightDir;
}

Vec3 LightTracker::getTargetLightDir() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_targetLightDir;
}

void LightTracker::setTargetClasses(const std::vector<int>& classIds) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_config.targetClasses = classIds;
    if (m_detector) {
        m_detector->setTargetClasses(classIds);
    }
    LOG_INFO() << "Target classes updated: " << classIds.size() << " categories";
}

void LightTracker::setUpdateInterval(float seconds) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_config.updateIntervalSec = std::max(0.5f, seconds);
}

void LightTracker::setInterpolationSpeed(float speed) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_config.interpolationSpeed = std::clamp(speed, 0.001f, 1.0f);
}

void LightTracker::setDefaultLightDir(const Vec3& dir) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_config.defaultLightDir = dir.normalized();
    if (!m_interpolating) {
        m_targetLightDir = m_config.defaultLightDir;
        m_previousLightDir = m_currentLightDir;
        m_interpolating = true;
        m_lastInterpStartTime = std::chrono::steady_clock::now();
    }
}

void LightTracker::setLightParams(const LightParams& baseParams) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_baseLightParams = baseParams;
}

}
