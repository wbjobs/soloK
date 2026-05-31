#include "vk浮雕/relief_pipeline.h"
#include "vk浮雕/logger.h"
#include "vk浮雕/sobel_detector.h"

namespace vk浮雕 {

ReliefPipeline::~ReliefPipeline() {
    cleanup();
}

bool ReliefPipeline::init(const Config& config) {
    m_config = config;
    m_width = config.width;
    m_height = config.height;
    
    VulkanContext::Config vkConfig;
    vkConfig.enableValidationLayers = false;
    vkConfig.width = config.width;
    vkConfig.height = config.height;
    
    if (!m_vulkanContext.init(vkConfig)) {
        LOG_ERROR() << "Failed to initialize Vulkan context";
        return false;
    }
    
    m_edgeDetector = EdgeDetectorFactory::create(config.edgeDetectorType);
    
    if (!m_edgeDetector) {
        LOG_ERROR() << "Failed to create edge detector";
        return false;
    }
    
    if (!m_edgeDetector->init(&m_vulkanContext, config.width, config.height)) {
        LOG_ERROR() << "Failed to initialize edge detector";
        return false;
    }
    
    if (auto* sobel = dynamic_cast<SobelDetector*>(m_edgeDetector.get())) {
        sobel->setThreshold(config.sobelThreshold);
        sobel->setEdgeStrength(config.sobelStrength);
    }
    
    m_normalMapGen = std::make_unique<NormalMapGenerator>();
    if (!m_normalMapGen->init(&m_vulkanContext, config.width, config.height)) {
        LOG_ERROR() << "Failed to initialize normal map generator";
        return false;
    }
    m_normalMapGen->setStrength(config.normalStrength);
    
    m_lightingRenderer = std::make_unique<LightingRenderer>();
    if (!m_lightingRenderer->init(&m_vulkanContext, config.width, config.height)) {
        LOG_ERROR() << "Failed to initialize lighting renderer";
        return false;
    }

    if (config.enableObjectTracking) {
        m_lightTracker = std::make_unique<LightTracker>();
        LightTracker::Config trackerConfig;
        trackerConfig.enableTracking = true;
        trackerConfig.modelPath = config.yoloModelPath;
        trackerConfig.targetClasses = config.targetClasses;
        trackerConfig.updateIntervalSec = config.trackingUpdateInterval;
        trackerConfig.confidenceThreshold = config.trackingConfidence;
        trackerConfig.gpuId = config.trackingGpuId;
        trackerConfig.defaultLightDir = Vec3(
            config.lightParams.lightDirX,
            config.lightParams.lightDirY,
            config.lightParams.lightDirZ
        );

        if (!m_lightTracker->init(trackerConfig)) {
            LOG_WARNING() << "Failed to init light tracker, tracking disabled";
            m_lightTracker.reset();
        } else {
            m_lightTracker->setLightParams(config.lightParams);
        }
    }
    
    m_edgeMap.allocate(config.width, config.height);
    m_heightMap.allocate(config.width, config.height);
    m_normalMap.allocate(config.width, config.height);
    
    m_initialized = true;
    LOG_INFO() << "Relief pipeline initialized: " << config.width << "x" << config.height
               << " (tracking: " << (m_lightTracker ? "ON" : "OFF") << ")";
    return true;
}

void ReliefPipeline::cleanup() {
    if (!m_initialized) return;
    
    if (m_lightTracker) {
        m_lightTracker->cleanup();
        m_lightTracker.reset();
    }

    if (m_lightingRenderer) {
        m_lightingRenderer->cleanup();
        m_lightingRenderer.reset();
    }
    
    if (m_normalMapGen) {
        m_normalMapGen->cleanup();
        m_normalMapGen.reset();
    }
    
    if (m_edgeDetector) {
        m_edgeDetector->cleanup();
        m_edgeDetector.reset();
    }
    
    m_vulkanContext.cleanup();
    
    m_initialized = false;
    m_width = 0;
    m_height = 0;
    LOG_INFO() << "Relief pipeline cleaned up";
}

bool ReliefPipeline::processFrame(const Frame& inputFrame, Frame& outputFrame) {
    if (!m_initialized) return false;
    
    if (inputFrame.width != m_width || inputFrame.height != m_height) {
        LOG_ERROR() << "Input frame size mismatch";
        return false;
    }

    if (m_lightTracker && m_lightTracker->isTracking()) {
        m_lightTracker->updateFrame(inputFrame);
        m_lightTracker->step();
        m_config.lightParams = m_lightTracker->getLightParams();
    }
    
    m_edgeDetector->process(inputFrame, m_edgeMap, m_heightMap);
    
    m_normalMapGen->process(m_heightMap, m_normalMap);
    
    m_lightingRenderer->process(m_normalMap, inputFrame, outputFrame, m_config.lightParams);
    
    return true;
}

void ReliefPipeline::setEdgeDetector(std::unique_ptr<IEdgeDetector> detector) {
    if (m_initialized && detector) {
        detector->init(&m_vulkanContext, m_width, m_height);
    }
    m_edgeDetector = std::move(detector);
}

void ReliefPipeline::setLightParams(const LightParams& params) {
    m_config.lightParams = params;
    if (m_lightTracker) {
        m_lightTracker->setLightParams(params);
    }
}

void ReliefPipeline::setNormalStrength(float strength) {
    m_config.normalStrength = strength;
    if (m_normalMapGen) {
        m_normalMapGen->setStrength(strength);
    }
}

}
