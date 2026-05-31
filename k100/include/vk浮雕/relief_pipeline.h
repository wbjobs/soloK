#pragma once

#include <memory>
#include <string>
#include "common.h"
#include "vulkan_context.h"
#include "edge_detector.h"
#include "normal_map.h"
#include "lighting_renderer.h"
#include "light_tracker.h"

namespace vk浮雕 {

class ReliefPipeline {
public:
    struct Config {
        uint32_t width = 1920;
        uint32_t height = 1080;
        std::string edgeDetectorType = "sobel";
        LightParams lightParams;
        float normalStrength = 1.0f;
        float sobelThreshold = 30.0f;
        float sobelStrength = 1.0f;
        bool enableObjectTracking = false;
        std::string yoloModelPath;
        std::vector<int> targetClasses = {0, 2};
        float trackingUpdateInterval = 5.0f;
        float trackingConfidence = 0.25f;
        int trackingGpuId = -1;
    };

    ReliefPipeline() = default;
    ~ReliefPipeline();

    bool init(const Config& config);
    void cleanup();

    bool processFrame(const Frame& inputFrame, Frame& outputFrame);

    void setEdgeDetector(std::unique_ptr<IEdgeDetector> detector);
    void setLightParams(const LightParams& params);
    void setNormalStrength(float strength);

    LightTracker* getLightTracker() { return m_lightTracker.get(); }
    const LightTracker* getLightTracker() const { return m_lightTracker.get(); }

    uint32_t getWidth() const { return m_width; }
    uint32_t getHeight() const { return m_height; }

private:
    VulkanContext m_vulkanContext;
    std::unique_ptr<IEdgeDetector> m_edgeDetector;
    std::unique_ptr<NormalMapGenerator> m_normalMapGen;
    std::unique_ptr<LightingRenderer> m_lightingRenderer;
    std::unique_ptr<LightTracker> m_lightTracker;

    FrameFloat m_heightMap;
    Frame m_edgeMap;
    Frame m_normalMap;

    uint32_t m_width = 0;
    uint32_t m_height = 0;
    Config m_config;
    bool m_initialized = false;
};

}
