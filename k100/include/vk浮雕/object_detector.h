#pragma once

#include <vector>
#include <string>
#include <memory>
#include <cstdint>

namespace vk浮雕 {

struct Detection {
    float x1, y1, x2, y2;
    float confidence;
    int classId;
    std::string className;

    float centerX() const { return (x1 + x2) * 0.5f; }
    float centerY() const { return (y1 + y2) * 0.5f; }
    float width() const { return x2 - x1; }
    float height() const { return y2 - y1; }
    float area() const { return width() * height(); }
};

struct DetectionResult {
    std::vector<Detection> detections;
    uint32_t imageWidth = 0;
    uint32_t imageHeight = 0;
    double inferenceTimeMs = 0.0;
};

class IObjectDetector {
public:
    virtual ~IObjectDetector() = default;

    virtual bool init(const std::string& modelPath, int gpuId = -1) = 0;
    virtual void cleanup() = 0;

    virtual DetectionResult detect(const uint8_t* imageData, uint32_t width, uint32_t height, uint32_t channels) = 0;

    virtual void setConfidenceThreshold(float threshold) = 0;
    virtual void setNMSThreshold(float threshold) = 0;
    virtual void setTargetClasses(const std::vector<int>& classIds) = 0;
    virtual void clearTargetClasses() = 0;

    virtual std::string getName() const = 0;
    virtual std::vector<std::string> getClassNames() const = 0;

    DetectionResult detect(const Frame& frame) {
        return detect(frame.ptr(), frame.width, frame.height, 4);
    }
};

class ObjectDetectorFactory {
public:
    static std::unique_ptr<IObjectDetector> create(const std::string& type);
};

}
