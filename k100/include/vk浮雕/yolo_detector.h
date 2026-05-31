#pragma once

#include "object_detector.h"
#include <vector>
#include <string>

namespace vk浮雕 {

class YOLODetector : public IObjectDetector {
public:
    YOLODetector() = default;
    ~YOLODetector() override;

    bool init(const std::string& modelPath, int gpuId = -1) override;
    void cleanup() override;

    DetectionResult detect(const uint8_t* imageData, uint32_t width, uint32_t height, uint32_t channels) override;

    void setConfidenceThreshold(float threshold) override { m_confThreshold = threshold; }
    void setNMSThreshold(float threshold) override { m_nmsThreshold = threshold; }
    void setTargetClasses(const std::vector<int>& classIds) override { m_targetClasses = classIds; }
    void clearTargetClasses() override { m_targetClasses.clear(); }

    std::string getName() const override { return "YOLOv8n"; }
    std::vector<std::string> getClassNames() const override { return m_classNames; }

private:
    struct Impl;
    Impl* m_impl = nullptr;

    float m_confThreshold = 0.25f;
    float m_nmsThreshold = 0.45f;
    std::vector<int> m_targetClasses;
    std::vector<std::string> m_classNames;
    int m_modelWidth = 640;
    int m_modelHeight = 640;
    bool m_initialized = false;

    std::vector<uint8_t> preprocess(const uint8_t* imageData, uint32_t width, uint32_t height, uint32_t channels);
    std::vector<Detection> postprocess(const float* output, uint32_t outputWidth, uint32_t outputHeight,
                                        uint32_t numDetections, uint32_t imageWidth, uint32_t imageHeight);
    std::vector<Detection> nms(std::vector<Detection>& detections, float iouThreshold);
    float iou(const Detection& a, const Detection& b);

    void loadClassNames();
};

}
