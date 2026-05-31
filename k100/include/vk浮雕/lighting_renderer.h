#pragma once

#include <vulkan/vulkan.h>
#include <memory>
#include "common.h"
#include "vulkan_context.h"
#include "compute_pipeline.h"
#include "vulkan_utils.h"

namespace vk浮雕 {

class LightingRenderer {
public:
    LightingRenderer() = default;
    ~LightingRenderer();
    
    bool init(VulkanContext* context, uint32_t width, uint32_t height);
    void cleanup();
    
    void process(const Frame& normalMap, const Frame& originalImage,
                 Frame& outputRelief, const LightParams& params);
    
private:
    bool createImages();
    bool createBuffers();
    bool createPipeline();
    bool createSampler();
    
    void uploadTextures(const Frame& normalMap, const Frame& originalImage);
    void downloadResult(Frame& outputRelief);
    
    VulkanContext* m_context = nullptr;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    
    vulkan_utils::Image m_normalImage;
    vulkan_utils::Image m_originalImage;
    vulkan_utils::Image m_outputImage;
    
    vulkan_utils::Buffer m_stagingBuffer;
    vulkan_utils::Buffer m_outputBuffer;
    vulkan_utils::Buffer m_paramsBuffer;
    
    VkSampler m_sampler = VK_NULL_HANDLE;
    VkFence m_fence = VK_NULL_HANDLE;
    VkCommandBuffer m_commandBuffer = VK_NULL_HANDLE;
    
    std::unique_ptr<ComputePipeline> m_lightingPipeline;
};

}
