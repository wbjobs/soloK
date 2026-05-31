#pragma once

#include <vector>
#include <string>
#include <memory>
#include <chrono>
#include <mutex>
#include <cmath>
#include "common.h"
#include "object_detector.h"

namespace vk浮雕 {

struct Vec3 {
    float x, y, z;

    Vec3() : x(0), y(0), z(0) {}
    Vec3(float x_, float y_, float z_) : x(x_), y(y_), z(z_) {}

    float length() const {
        return std::sqrt(x * x + y * y + z * z);
    }

    Vec3 normalized() const {
        float len = length();
        if (len < 1e-6f) return Vec3(0, 0, 1);
        return Vec3(x / len, y / len, z / len);
    }

    static float dot(const Vec3& a, const Vec3& b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    static Vec3 slerp(const Vec3& from, const Vec3& to, float t) {
        Vec3 a = from.normalized();
        Vec3 b = to.normalized();

        float cosTheta = dot(a, b);
        if (cosTheta > 0.9995f) {
            return Vec3(
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t
            ).normalized();
        }

        cosTheta = std::clamp(cosTheta, -1.0f, 1.0f);
        float theta = std::acos(cosTheta);
        float sinTheta = std::sin(theta);

        if (sinTheta < 1e-6f) {
            return a;
        }

        float wa = std::sin((1.0f - t) * theta) / sinTheta;
        float wb = std::sin(t * theta) / sinTheta;

        return Vec3(
            wa * a.x + wb * b.x,
            wa * a.y + wb * b.y,
            wa * a.z + wb * b.z
        ).normalized();
    }
};

class LightTracker {
public:
    struct Config {
        float updateIntervalSec = 5.0f;
        float interpolationSpeed = 0.02f;
        float minObjectArea = 0.005f;
        float maxObjectArea = 0.8f;
        Vec3 defaultLightDir;
        bool enableTracking = false;
        std::string modelPath;
        std::vector<int> targetClasses = {0, 2};
        float confidenceThreshold = 0.25f;
        float nmsThreshold = 0.45f;
        int gpuId = -1;

        Config() {
            defaultLightDir = Vec3(-0.5f, -0.5f, 0.7f);
        }
    };

    LightTracker() = default;
    ~LightTracker();

    bool init(const Config& config);
    void cleanup();

    void updateDetections(const DetectionResult& result);
    void updateFrame(const Frame& frame);
    void updateFrame(const uint8_t* imageData, uint32_t w, uint32_t h, uint32_t channels);

    LightParams getLightParams() const;
    Vec3 getCurrentLightDir() const;
    Vec3 getTargetLightDir() const;

    void setTargetClasses(const std::vector<int>& classIds);
    void setUpdateInterval(float seconds);
    void setInterpolationSpeed(float speed);
    void setDefaultLightDir(const Vec3& dir);
    void setLightParams(const LightParams& baseParams);

    const DetectionResult& getLastDetections() const { return m_lastResult; }
    bool isTracking() const { return m_config.enableTracking && m_initialized; }

    void step();

private:
    Vec3 computeLightDirForObject(const Detection& det, uint32_t imageWidth, uint32_t imageHeight);
    const Detection* selectBestTarget(const DetectionResult& result);
    bool shouldUpdateDetection();

    Config m_config;
    LightParams m_baseLightParams;
    std::unique_ptr<IObjectDetector> m_detector;

    Vec3 m_currentLightDir;
    Vec3 m_targetLightDir;
    Vec3 m_previousLightDir;

    DetectionResult m_lastResult;
    std::chrono::steady_clock::time_point m_lastDetectionTime;
    std::chrono::steady_clock::time_point m_lastInterpStartTime;
    bool m_interpolating = false;

    std::mutex m_mutex;
    bool m_initialized = false;
};

}
