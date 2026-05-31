#pragma once

#include <vulkan/vulkan.h>
#include <memory>
#include "edge_detector.h"
#include "vulkan_context.h"
#include "compute_pipeline.h"
#include "vulkan_utils.h"

namespace vk浮雕 {

class SobelDetector : public IEdgeDetector {
public:
    SobelDetector() = default;
    ~SobelDetector() override;
    
    bool init(VulkanContext* context, uint32_t width, uint32_t height) override;
    void cleanup() override;
    
    void process(const Frame& inputFrame, Frame& outputEdge, FrameFloat& outputHeight) override;
    
    std::string getName() const override { return "Sobel"; }
    
    void setThreshold(float threshold) { m_threshold = threshold; }
    void setEdgeStrength(float strength) { m_edgeStrength = strength; }
    
private:
    bool createImages();
    bool createBuffers();
    bool createPipeline();
    bool createSampler();
    
    void uploadFrame(const Frame& frame);
    void downloadResults(Frame& outputEdge, FrameFloat& outputHeight);
    
    VulkanContext* m_context = nullptr;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    
    float m_threshold = 30.0f;
    float m_edgeStrength = 1.0f;
    
    vulkan_utils::Image m_inputImage;
    vulkan_utils::Image m_edgeImage;
    vulkan_utils::Image m_heightImage;
    
    vulkan_utils::Buffer m_stagingBuffer;
    vulkan_utils::Buffer m_edgeOutputBuffer;
    vulkan_utils::Buffer m_heightOutputBuffer;
    
    VkSampler m_sampler = VK_NULL_HANDLE;
    VkFence m_fence = VK_NULL_HANDLE;
    VkCommandBuffer m_commandBuffer = VK_NULL_HANDLE;
    
    std::unique_ptr<ComputePipeline> m_sobelPipeline;
};

}
