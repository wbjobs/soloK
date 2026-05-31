#pragma once

#include <vulkan/vulkan.h>
#include <memory>
#include "vulkan_context.h"
#include "vulkan_utils.h"

namespace vk浮雕 {

class OffscreenRenderer {
public:
    OffscreenRenderer() = default;
    ~OffscreenRenderer();
    
    bool init(VulkanContext* context, uint32_t width, uint32_t height);
    void cleanup();
    
    VkFramebuffer getFramebuffer() const { return m_framebuffer; }
    VkRenderPass getRenderPass() const { return m_renderPass; }
    vulkan_utils::Image& getColorImage() { return m_colorImage; }
    vulkan_utils::Image& getDepthImage() { return m_depthImage; }
    VkExtent2D getExtent() const { return {m_width, m_height}; }
    
private:
    bool createRenderPass();
    bool createImages();
    bool createFramebuffer();
    
    VulkanContext* m_context = nullptr;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    
    VkRenderPass m_renderPass = VK_NULL_HANDLE;
    VkFramebuffer m_framebuffer = VK_NULL_HANDLE;
    
    vulkan_utils::Image m_colorImage;
    vulkan_utils::Image m_depthImage;
};

}
