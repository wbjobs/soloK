#include "vk浮雕/offscreen_renderer.h"
#include "vk浮雕/logger.h"

namespace vk浮雕 {

OffscreenRenderer::~OffscreenRenderer() {
    cleanup();
}

bool OffscreenRenderer::init(VulkanContext* context, uint32_t width, uint32_t height) {
    m_context = context;
    m_width = width;
    m_height = height;
    
    if (!createRenderPass()) {
        LOG_ERROR() << "Failed to create render pass";
        return false;
    }
    
    if (!createImages()) {
        LOG_ERROR() << "Failed to create images";
        return false;
    }
    
    if (!createFramebuffer()) {
        LOG_ERROR() << "Failed to create framebuffer";
        return false;
    }
    
    LOG_INFO() << "Offscreen renderer initialized: " << width << "x" << height;
    return true;
}

void OffscreenRenderer::cleanup() {
    if (m_context == nullptr) return;
    
    VkDevice device = m_context->getDevice();
    
    if (m_framebuffer != VK_NULL_HANDLE) {
        vkDestroyFramebuffer(device, m_framebuffer, nullptr);
        m_framebuffer = VK_NULL_HANDLE;
    }
    
    vulkan_utils::destroyImage(device, m_colorImage);
    vulkan_utils::destroyImage(device, m_depthImage);
    
    if (m_renderPass != VK_NULL_HANDLE) {
        vkDestroyRenderPass(device, m_renderPass, nullptr);
        m_renderPass = VK_NULL_HANDLE;
    }
    
    m_context = nullptr;
    m_width = 0;
    m_height = 0;
}

bool OffscreenRenderer::createRenderPass() {
    VkAttachmentDescription colorAttachment{};
    colorAttachment.format = VK_FORMAT_R8G8B8A8_UNORM;
    colorAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    colorAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    colorAttachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    colorAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    colorAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    colorAttachment.finalLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
    
    VkAttachmentDescription depthAttachment{};
    depthAttachment.format = VK_FORMAT_D32_SFLOAT;
    depthAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    depthAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    depthAttachment.storeOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    depthAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    depthAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    depthAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    depthAttachment.finalLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;
    
    VkAttachmentReference colorAttachmentRef{};
    colorAttachmentRef.attachment = 0;
    colorAttachmentRef.layout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
    
    VkAttachmentReference depthAttachmentRef{};
    depthAttachmentRef.attachment = 1;
    depthAttachmentRef.layout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;
    
    VkSubpassDescription subpass{};
    subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 1;
    subpass.pColorAttachments = &colorAttachmentRef;
    subpass.pDepthStencilAttachment = &depthAttachmentRef;
    
    VkSubpassDependency dependency{};
    dependency.srcSubpass = VK_SUBPASS_EXTERNAL;
    dependency.dstSubpass = 0;
    dependency.srcStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT |
                              VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;
    dependency.srcAccessMask = 0;
    dependency.dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT |
                              VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;
    dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT |
                               VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
    
    std::array<VkAttachmentDescription, 2> attachments = {colorAttachment, depthAttachment};
    
    VkRenderPassCreateInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    renderPassInfo.attachmentCount = static_cast<uint32_t>(attachments.size());
    renderPassInfo.pAttachments = attachments.data();
    renderPassInfo.subpassCount = 1;
    renderPassInfo.pSubpasses = &subpass;
    renderPassInfo.dependencyCount = 1;
    renderPassInfo.pDependencies = &dependency;
    
    VkResult result = vkCreateRenderPass(m_context->getDevice(), &renderPassInfo, nullptr, &m_renderPass);
    return result == VK_SUCCESS;
}

bool OffscreenRenderer::createImages() {
    VkDevice device = m_context->getDevice();
    VkPhysicalDevice physicalDevice = m_context->getPhysicalDevice();
    
    m_colorImage = vulkan_utils::createImage(
        device, physicalDevice,
        m_width, m_height, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );
    
    if (m_colorImage.image == VK_NULL_HANDLE) {
        LOG_ERROR() << "Failed to create color image";
        return false;
    }
    
    m_colorImage.view = vulkan_utils::createImageView(
        device, m_colorImage.image, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_ASPECT_COLOR_BIT
    );
    
    if (m_colorImage.view == VK_NULL_HANDLE) {
        LOG_ERROR() << "Failed to create color image view";
        return false;
    }
    
    m_depthImage = vulkan_utils::createImage(
        device, physicalDevice,
        m_width, m_height, VK_FORMAT_D32_SFLOAT,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );
    
    if (m_depthImage.image == VK_NULL_HANDLE) {
        LOG_ERROR() << "Failed to create depth image";
        return false;
    }
    
    m_depthImage.view = vulkan_utils::createImageView(
        device, m_depthImage.image, VK_FORMAT_D32_SFLOAT,
        VK_IMAGE_ASPECT_DEPTH_BIT
    );
    
    if (m_depthImage.view == VK_NULL_HANDLE) {
        LOG_ERROR() << "Failed to create depth image view";
        return false;
    }
    
    return true;
}

bool OffscreenRenderer::createFramebuffer() {
    std::array<VkImageView, 2> attachments = {
        m_colorImage.view,
        m_depthImage.view
    };
    
    VkFramebufferCreateInfo framebufferInfo{};
    framebufferInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
    framebufferInfo.renderPass = m_renderPass;
    framebufferInfo.attachmentCount = static_cast<uint32_t>(attachments.size());
    framebufferInfo.pAttachments = attachments.data();
    framebufferInfo.width = m_width;
    framebufferInfo.height = m_height;
    framebufferInfo.layers = 1;
    
    VkResult result = vkCreateFramebuffer(m_context->getDevice(), &framebufferInfo, nullptr, &m_framebuffer);
    return result == VK_SUCCESS;
}

}
