#include "vk浮雕/sobel_detector.h"
#include "vk浮雕/logger.h"
#include "vk浮雕/utils.h"

namespace vk浮雕 {

struct SobelPushConstants {
    uint32_t width;
    uint32_t height;
    float threshold;
    float edgeStrength;
};

SobelDetector::~SobelDetector() {
    cleanup();
}

bool SobelDetector::init(VulkanContext* context, uint32_t width, uint32_t height) {
    m_context = context;
    m_width = width;
    m_height = height;
    
    if (!createImages()) {
        LOG_ERROR() << "Failed to create images";
        return false;
    }
    
    if (!createBuffers()) {
        LOG_ERROR() << "Failed to create buffers";
        return false;
    }
    
    if (!createSampler()) {
        LOG_ERROR() << "Failed to create sampler";
        return false;
    }
    
    if (!createPipeline()) {
        LOG_ERROR() << "Failed to create pipeline";
        return false;
    }
    
    VkCommandBufferAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    allocInfo.commandPool = context->getCommandPool();
    allocInfo.commandBufferCount = 1;
    
    VkResult result = vkAllocateCommandBuffers(context->getDevice(), &allocInfo, &m_commandBuffer);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to allocate command buffer";
        return false;
    }
    
    VkFenceCreateInfo fenceInfo{};
    fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
    fenceInfo.flags = VK_FENCE_CREATE_SIGNALED_BIT;
    
    result = vkCreateFence(context->getDevice(), &fenceInfo, nullptr, &m_fence);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to create fence";
        return false;
    }
    
    return true;
}

void SobelDetector::cleanup() {
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
    vulkan_utils::destroyBuffer(device, m_edgeOutputBuffer);
    vulkan_utils::destroyBuffer(device, m_heightOutputBuffer);
    
    vulkan_utils::destroyImage(device, m_inputImage);
    vulkan_utils::destroyImage(device, m_edgeImage);
    vulkan_utils::destroyImage(device, m_heightImage);
    
    m_sobelPipeline.reset();
    m_context = nullptr;
    m_width = 0;
    m_height = 0;
}

bool SobelDetector::createImages() {
    VkDevice device = m_context->getDevice();
    VkPhysicalDevice physicalDevice = m_context->getPhysicalDevice();
    
    m_inputImage = vulkan_utils::createImage(
        device, physicalDevice,
        m_width, m_height, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_STORAGE_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );
    
    if (m_inputImage.image == VK_NULL_HANDLE) return false;
    
    m_inputImage.view = vulkan_utils::createImageView(
        device, m_inputImage.image, VK_FORMAT_R8G8B8A8_UNORM,
        VK_IMAGE_ASPECT_COLOR_BIT
    );
    
    if (m_inputImage.view == VK_NULL_HANDLE) return false;
    
    vulkan_utils::transitionImageLayout(device, m_context->getCommandPool(), m_context->getGraphicsQueue(),
                                        m_inputImage, VK_FORMAT_R8G8B8A8_UNORM,
                                        VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_GENERAL);
    
    m_edgeImage = vulkan_utils::createImage(
        device, physicalDevice,
        m_width, m_height, VK_FORMAT_R8_UNORM,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );
    
    if (m_edgeImage.image == VK_NULL_HANDLE) return false;
    
    m_edgeImage.view = vulkan_utils::createImageView(
        device, m_edgeImage.image, VK_FORMAT_R8_UNORM,
        VK_IMAGE_ASPECT_COLOR_BIT
    );
    
    if (m_edgeImage.view == VK_NULL_HANDLE) return false;
    
    vulkan_utils::transitionImageLayout(device, m_context->getCommandPool(), m_context->getGraphicsQueue(),
                                        m_edgeImage, VK_FORMAT_R8_UNORM,
                                        VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_GENERAL);
    
    m_heightImage = vulkan_utils::createImage(
        device, physicalDevice,
        m_width, m_height, VK_FORMAT_R32_SFLOAT,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );
    
    if (m_heightImage.image == VK_NULL_HANDLE) return false;
    
    m_heightImage.view = vulkan_utils::createImageView(
        device, m_heightImage.image, VK_FORMAT_R32_SFLOAT,
        VK_IMAGE_ASPECT_COLOR_BIT
    );
    
    if (m_heightImage.view == VK_NULL_HANDLE) return false;
    
    vulkan_utils::transitionImageLayout(device, m_context->getCommandPool(), m_context->getGraphicsQueue(),
                                        m_heightImage, VK_FORMAT_R32_SFLOAT,
                                        VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_GENERAL);
    
    return true;
}

bool SobelDetector::createBuffers() {
    VkDevice device = m_context->getDevice();
    VkPhysicalDevice physicalDevice = m_context->getPhysicalDevice();
    
    VkDeviceSize stagingSize = m_width * m_height * 4;
    m_stagingBuffer = vulkan_utils::createBuffer(
        device, physicalDevice, stagingSize,
        VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT
    );
    
    if (m_stagingBuffer.buffer == VK_NULL_HANDLE) return false;
    
    VkDeviceSize edgeSize = m_width * m_height;
    m_edgeOutputBuffer = vulkan_utils::createBuffer(
        device, physicalDevice, edgeSize,
        VK_BUFFER_USAGE_TRANSFER_DST_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT
    );
    
    if (m_edgeOutputBuffer.buffer == VK_NULL_HANDLE) return false;
    
    VkDeviceSize heightSize = m_width * m_height * sizeof(float);
    m_heightOutputBuffer = vulkan_utils::createBuffer(
        device, physicalDevice, heightSize,
        VK_BUFFER_USAGE_TRANSFER_DST_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT
    );
    
    if (m_heightOutputBuffer.buffer == VK_NULL_HANDLE) return false;
    
    return true;
}

bool SobelDetector::createSampler() {
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

bool SobelDetector::createPipeline() {
    m_sobelPipeline = std::make_unique<ComputePipeline>();
    
    std::vector<ComputePipeline::DescriptorBinding> bindings = {
        {0, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, VK_SHADER_STAGE_COMPUTE_BIT, 1},
        {1, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, VK_SHADER_STAGE_COMPUTE_BIT, 1},
        {2, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, VK_SHADER_STAGE_COMPUTE_BIT, 1},
    };
    
    std::string shaderPath = "shaders/sobel.comp.spv";
    
    if (!m_sobelPipeline->init(m_context, shaderPath, bindings, sizeof(SobelPushConstants))) {
        return false;
    }
    
    m_sobelPipeline->updateDescriptorSet(0, m_inputImage, m_sampler);
    m_sobelPipeline->updateDescriptorSet(1, m_edgeImage, m_sampler);
    m_sobelPipeline->updateDescriptorSet(2, m_heightImage, m_sampler);
    
    return true;
}

void SobelDetector::uploadFrame(const Frame& frame) {
    std::memcpy(m_stagingBuffer.mapped, frame.ptr(), frame.size());
    
    VkCommandBuffer cmdBuf = vulkan_utils::beginSingleTimeCommands(
        m_context->getDevice(), m_context->getCommandPool());
    
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
    
    vkCmdCopyBufferToImage(cmdBuf, m_stagingBuffer.buffer, m_inputImage.image,
                          VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &region);
    
    vulkan_utils::endSingleTimeCommands(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(), cmdBuf);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_inputImage, VK_FORMAT_R8G8B8A8_UNORM,
                                       VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_GENERAL);
}

void SobelDetector::downloadResults(Frame& outputEdge, FrameFloat& outputHeight) {
    outputEdge.allocate(m_width, m_height);
    outputHeight.allocate(m_width, m_height);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_edgeImage, VK_FORMAT_R8_UNORM,
                                       VK_IMAGE_LAYOUT_GENERAL, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL);
    
    vulkan_utils::copyImageToBuffer(m_context->getDevice(), m_context->getCommandPool(),
                                   m_context->getGraphicsQueue(),
                                   m_edgeImage, m_edgeOutputBuffer, m_width, m_height);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_edgeImage, VK_FORMAT_R8_UNORM,
                                       VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, VK_IMAGE_LAYOUT_GENERAL);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_heightImage, VK_FORMAT_R32_SFLOAT,
                                       VK_IMAGE_LAYOUT_GENERAL, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL);
    
    vulkan_utils::copyImageToBuffer(m_context->getDevice(), m_context->getCommandPool(),
                                   m_context->getGraphicsQueue(),
                                   m_heightImage, m_heightOutputBuffer, m_width, m_height);
    
    vulkan_utils::transitionImageLayout(m_context->getDevice(), m_context->getCommandPool(),
                                       m_context->getGraphicsQueue(),
                                       m_heightImage, VK_FORMAT_R32_SFLOAT,
                                       VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, VK_IMAGE_LAYOUT_GENERAL);
    
    uint8_t* edgeData = reinterpret_cast<uint8_t*>(m_edgeOutputBuffer.mapped);
    for (size_t i = 0; i < outputEdge.size(); i += 4) {
        size_t grayIdx = i / 4;
        uint8_t v = edgeData[grayIdx];
        outputEdge.ptr()[i] = v;
        outputEdge.ptr()[i + 1] = v;
        outputEdge.ptr()[i + 2] = v;
        outputEdge.ptr()[i + 3] = 255;
    }
    
    float* heightData = reinterpret_cast<float*>(m_heightOutputBuffer.mapped);
    std::memcpy(outputHeight.ptr(), heightData, outputHeight.size() * sizeof(float));
}

void SobelDetector::process(const Frame& inputFrame, Frame& outputEdge, FrameFloat& outputHeight) {
    uploadFrame(inputFrame);
    
    vkWaitForFences(m_context->getDevice(), 1, &m_fence, VK_TRUE, UINT64_MAX);
    vkResetFences(m_context->getDevice(), 1, &m_fence);
    vkResetCommandBuffer(m_commandBuffer, 0);
    
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
    
    vkBeginCommandBuffer(m_commandBuffer, &beginInfo);
    
    SobelPushConstants pc{};
    pc.width = m_width;
    pc.height = m_height;
    pc.threshold = m_threshold;
    pc.edgeStrength = m_edgeStrength;
    
    m_sobelPipeline->pushConstants(m_commandBuffer, pc);
    
    uint32_t groupX = (m_width + 15) / 16;
    uint32_t groupY = (m_height + 15) / 16;
    m_sobelPipeline->dispatch(m_commandBuffer, groupX, groupY, 1);
    
    vkEndCommandBuffer(m_commandBuffer);
    
    VkSubmitInfo submitInfo{};
    submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    submitInfo.commandBufferCount = 1;
    submitInfo.pCommandBuffers = &m_commandBuffer;
    
    vkQueueSubmit(m_context->getComputeQueue(), 1, &submitInfo, m_fence);
    vkWaitForFences(m_context->getDevice(), 1, &m_fence, VK_TRUE, UINT64_MAX);
    
    downloadResults(outputEdge, outputHeight);
}

}
