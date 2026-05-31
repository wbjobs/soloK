#pragma once

#include <vulkan/vulkan.h>
#include <memory>
#include "common.h"
#include "vulkan_context.h"
#include "compute_pipeline.h"
#include "vulkan_utils.h"

namespace vk浮雕 {

class NormalMapGenerator {
public:
    NormalMapGenerator() = default;
    ~NormalMapGenerator();
    
    bool init(VulkanContext* context, uint32_t width, uint32_t height);
    void cleanup();
    
    void process(const FrameFloat& heightMap, Frame& outputNormal);
    
    void setStrength(float strength) { m_strength = strength; }
    
private:
    bool createImages();
    bool createBuffers();
    bool createPipeline();
    bool createSampler();
    
    void uploadHeightMap(const FrameFloat& heightMap);
    void downloadResult(Frame& outputNormal);
    
    VulkanContext* m_context = nullptr;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    float m_strength = 1.0f;
    
    vulkan_utils::Image m_heightImage;
    vulkan_utils::Image m_normalImage;
    
    vulkan_utils::Buffer m_stagingBuffer;
    vulkan_utils::Buffer m_outputBuffer;
    
    VkSampler m_sampler = VK_NULL_HANDLE;
    VkFence m_fence = VK_NULL_HANDLE;
    VkCommandBuffer m_commandBuffer = VK_NULL_HANDLE;
    
    std::unique_ptr<ComputePipeline> m_normalPipeline;
};

}
