#include "vk浮雕/lighting_renderer.h"
#include "vk浮雕/logger.h"
#include "vk浮雕/utils.h"

namespace vk浮雕 {

struct LightingPushConstants {
    uint32_t width;
    uint32_t height;
    float ambientIntensity;
    float directionalIntensity;
    float lightDirX;
    float lightDirY;
    float lightDirZ;
    float heightScale;
};

LightingRenderer::~LightingRenderer() {
    cleanup();
}

bool LightingRenderer::init(VulkanContext* context, uint32_t width, uint32_t height) {
    m_context = context;
    m_width = width;
    m_height = height;
    
    if (!createImages()) return false;
    if (!createBuffers()) return false;
    if (!createSampler()) return false;
    if (!createPipeline()) return false;
    
    VkCommandBufferAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    allocInfo.commandPool = context->getCommandPool();
    allocInfo.commandBufferCount = 1;
    
    VkResult result = vkAllocateCommandBuffers(context->getDevice(), &allocInfo, &m_commandBuffer);
    if (result != VK_SUCCESS) return false;
    
    VkFenceCreateInfo fenceInfo{};
    fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
    fenceInfo.flags = VK_FENCE_CREATE_SIGNALED_BIT;
    
    result = vkCreateFence(context->getDevice(), &fenceInfo, nullptr, &m_fence);
    return result == VK_SUCCESS;
}

void LightingRenderer::cleanup() {
    if (m_context == nullptr) return;
    
    VkDevice device = m_context->getDevice();
    
    if (m_fence != VK_NULL_HANDLE) {
        vkDestroyFence(device, m_fence, nullptr);
        m_fence = VK_NULL_HANDLE;
    }
    
    if (m_commandBuffer != VK_NULL_HANDLE) {
        vkFreeCommandBuffers(device, m_context->getCommandPool(), 1, &m_commandBuffer);
        m_commandBuffer = VK_NULL_HANDLE;
    }
    
    if (m_sampler != VK_NULL_HANDLE) {
        vkDestroySampler(device, m_sampler, nullptr);
        m_sampler = VK_NULL_HANDLE;
    }
    
    vulkan_utils::destroyBuffer(device, m_stagingBuffer);
    vulkan_utils::destroyBuffer(device, m_outputBuffer);
    vulkan_utils::destroyBuffer(device, m_paramsBuffer);
    
    vulkan_utils::destroyImage(device, m_normalImage);
    vulkan_utils::destroyImage(device, m_originalImage);
    vulkan_utils::destroyImage(device, m_outputImage);
    
    m_lightingPipeline.reset();
    m_context = nullptr;
    m_width = 0;
    m_height = 0;
}

bool LightingRenderer::createImages() {
    VkDevice device = m_context->getDevice();
    VkPhysicalDevice physicalDevice = m_context->getPhysicalDevice();
    
    m_normalImage = vulkan_utils::createImage(
        device, physicalDevice,
        m_width, m_height, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );
    
    if (m_normalImage.image == VK_NULL_HANDLE) return false;
    
    m_normalImage.view = vulkan_utils::createImageView(
        device, m_normalImage.image, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_ASPECT_COLOR_BIT
    );
    
    if (m_normalImage.view == VK_NULL_HANDLE) return false;
    
    vulkan_utils::transitionImageLayout(device, m_context->getCommandPool(), m_context->getGraphicsQueue(),
                                        m_normalImage, VK_FORMAT_R8G8B8A8_UNORM,
                                        VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_GENERAL);
    
    m_originalImage = vulkan_utils::createImage(
        device, physicalDevice,
        m_width, m_height, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );
    
    if (m_originalImage.image == VK_NULL_HANDLE) return false;
    
    m_originalImage.view = vulkan_utils::createImageView(
        device, m_originalImage.image, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_ASPECT_COLOR_BIT
    );
    
    if (m_originalImage.view == VK_NULL_HANDLE) return false;
    
    vulkan_utils::transitionImageLayout(device, m_context->getCommandPool(), m_context->getGraphicsQueue(),
                                        m_originalImage, VK_FORMAT_R8G8B8A8_UNORM,
                                        VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_GENERAL);
    
    m_outputImage = vulkan_utils::createImage(
        device, physicalDevice,
        m_width, m_height, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );
    
    if (m_outputImage.image == VK_NULL_HANDLE) return false;
    
    m_outputImage.view = vulkan_utils::createImageView(
        device, m_outputImage.image, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_ASPECT_COLOR_BIT
    );
    
    if (m_outputImage.view == VK_NULL_HANDLE) return false;
    
    vulkan_utils::transitionImageLayout(device, m_context->getCommandPool(), m_context->getGraphicsQueue(),
                                        m_outputImage, VK_FORMAT_R8G8B8A8_UNORM,
                                        VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_GENERAL);
    
    return true;
}

bool LightingRenderer::createBuffers() {
    VkDevice device = m_context->getDevice();
    VkPhysicalDevice physicalDevice = m_context->getPhysicalDevice();
    
    VkDeviceSize stagingSize = m_width * m_height * 4;
    m_stagingBuffer = vulkan_utils::createBuffer(
        device, physicalDevice, stagingSize,
        VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT
    );
    
    if (m_stagingBuffer.buffer == VK_NULL_HANDLE) return false;
    
    VkDeviceSize outputSize = m_width * m_height * 4;
    m_outputBuffer = vulkan_utils::createBuffer(
        device, physicalDevice, outputSize,
        VK_BUFFER_USAGE_TRANSFER_DST_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT
    );
    
    if (m_outputBuffer.buffer == VK_NULL_HANDLE) return false;
    
    return true;
}

bool LightingRenderer::createSampler() {
    VkSamplerCreateInfo samplerInfo{};
    samplerInfo.sType = VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO;
    samplerInfo.magFilter = VK_FILTER_NEAREST;
    samplerInfo.minFilter = VK_FILTER_NEAREST;
    samplerInfo.addressModeU = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    samplerInfo.addressModeV = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    samplerInfo.addressModeW = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    samplerInfo.borderColor = VK_BORDER_COLOR_INT_OPAQUE_BLACK;
    samplerInfo.unnormalizedCoordinates = VK_FALSE;
    samplerInfo.compareEnable = VK_FALSE;
    samplerInfo.mipmapMode = VK_SAMPLER_MIPMAP_MODE_LINEAR;
    
    VkResult result = vkCreateSampler(m_context->getDevice(), &samplerInfo, nullptr, &m_sampler);
    return result == VK_SUCCESS;
}

bool LightingRenderer::createPipeline() {
    m_lightingPipeline = std::make_unique<ComputePipeline>();
    
    std::vector<ComputePipeline::DescriptorBinding> bindings = {
        {0, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, VK_SHADER_STAGE_COMPUTE_BIT, 1},
        {1, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, VK_SHADER_STAGE_COMPUTE_BIT, 1},
        {2, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, VK_SHADER_STAGE_COMPUTE_BIT, 1},
    };
    
    std::string shaderPath = "shaders/lighting.comp.spv";
    
    if (!m_lightingPipeline->init(m_context, shaderPath, bindings, sizeof(LightingPushConstants))) {
        return false;
    }
    
    m_lightingPipeline->updateDescriptorSet(0, m_normalImage, m_sampler);
    m_lightingPipeline->updateDescriptorSet(1, m_originalImage, m_sampler);
    m_lightingPipeline->updateDescriptorSet(2, m_outputImage, m_sampler);
    
    return true;
}

void LightingRenderer::uploadTextures(const Frame& normalMap, const Frame& originalImage) {
    VkCommandBuffer cmdBuf = vulkan_utils::beginSingleTimeCommands(
        m_context->getDevice(), m_context->getCommandPool());
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_normalImage, VK_FORMAT_R8G8B8A8_UNORM,
                                       VK_IMAGE_LAYOUT_GENERAL, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL);
    
    std::memcpy(m_stagingBuffer.mapped, normalMap.ptr(), normalMap.size());
    
    VkBufferImageCopy region{};
    region.bufferOffset = 0;
    region.bufferRowLength = 0;
    region.bufferImageHeight = 0;
    region.imageSubresource.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    region.imageSubresource.mipLevel = 0;
    region.imageSubresource.baseArrayLayer = 0;
    region.imageSubresource.layerCount = 1;
    region.imageOffset = {0, 0, 0};
    region.imageExtent = {m_width, m_height, 1};
    
    vkCmdCopyBufferToImage(cmdBuf, m_stagingBuffer.buffer, m_normalImage.image,
                          VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &region);
    
    vulkan_utils::endSingleTimeCommands(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(), cmdBuf);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_normalImage, VK_FORMAT_R8G8B8A8_UNORM,
                                       VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_GENERAL);
    
    cmdBuf = vulkan_utils::beginSingleTimeCommands(
        m_context->getDevice(), m_context->getCommandPool());
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_originalImage, VK_FORMAT_R8G8B8A8_UNORM,
                                       VK_IMAGE_LAYOUT_GENERAL, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL);
    
    std::memcpy(m_stagingBuffer.mapped, originalImage.ptr(), originalImage.size());
    
    vkCmdCopyBufferToImage(cmdBuf, m_stagingBuffer.buffer, m_originalImage.image,
                          VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &region);
    
    vulkan_utils::endSingleTimeCommands(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(), cmdBuf);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_originalImage, VK_FORMAT_R8G8B8A8_UNORM,
                                       VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_GENERAL);
}

void LightingRenderer::downloadResult(Frame& outputRelief) {
    outputRelief.allocate(m_width, m_height);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_outputImage, VK_FORMAT_R8G8B8A8_UNORM,
                                       VK_IMAGE_LAYOUT_GENERAL, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL);
    
    vulkan_utils::copyImageToBuffer(m_context->getDevice(), m_context->getCommandPool(),
                                   m_context->getGraphicsQueue(),
                                   m_outputImage, m_outputBuffer, m_width, m_height);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_outputImage, VK_FORMAT_R8G8B8A8_UNORM,
                                       VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, VK_IMAGE_LAYOUT_GENERAL);
    
    std::memcpy(outputRelief.ptr(), m_outputBuffer.mapped, outputRelief.size());
}

void LightingRenderer::process(const Frame& normalMap, const Frame& originalImage,
                               Frame& outputRelief, const LightParams& params) {
    uploadTextures(normalMap, originalImage);
    
    vkWaitForFences(m_context->getDevice(), 1, &m_fence, VK_TRUE, UINT64_MAX);
    vkResetFences(m_context->getDevice(), 1, &m_fence);
    vkResetCommandBuffer(m_commandBuffer, 0);
    
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
    
    vkBeginCommandBuffer(m_commandBuffer, &beginInfo);
    
    LightingPushConstants pc{};
    pc.width = m_width;
    pc.height = m_height;
    pc.ambientIntensity = params.ambientIntensity;
    pc.directionalIntensity = params.directionalIntensity;
    pc.lightDirX = params.lightDirX;
    pc.lightDirY = params.lightDirY;
    pc.lightDirZ = params.lightDirZ;
    pc.heightScale = params.heightScale;
    
    m_lightingPipeline->pushConstants(m_commandBuffer, pc);
    
    uint32_t groupX = (m_width + 15) / 16;
    uint32_t groupY = (m_height + 15) / 16;
    m_lightingPipeline->dispatch(m_commandBuffer, groupX, groupY, 1);
    
    vkEndCommandBuffer(m_commandBuffer);
    
    VkSubmitInfo submitInfo{};
    submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    submitInfo.commandBufferCount = 1;
    submitInfo.pCommandBuffers = &m_commandBuffer;
    
    vkQueueSubmit(m_context->getComputeQueue(), 1, &submitInfo, m_fence);
    vkWaitForFences(m_context->getDevice(), 1, &m_fence, VK_TRUE, UINT64_MAX);
    
    downloadResult(outputRelief);
}

}
