#include "vk浮雕/vulkan_utils.h"
#include "vk浮雕/logger.h"
#include <cstring>

namespace vk浮雕::vulkan_utils {

VkShaderModule createShaderModule(VkDevice device, const std::vector<uint8_t>& code) {
    VkShaderModuleCreateInfo createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
    createInfo.codeSize = code.size();
    createInfo.pCode = reinterpret_cast<const uint32_t*>(code.data());
    
    VkShaderModule shaderModule;
    VkResult result = vkCreateShaderModule(device, &createInfo, nullptr, &shaderModule);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to create shader module: " << result;
        return VK_NULL_HANDLE;
    }
    
    return shaderModule;
}

Buffer createBuffer(VkDevice device, VkPhysicalDevice physicalDevice,
                    VkDeviceSize size, VkBufferUsageFlags usage,
                    VkMemoryPropertyFlags properties) {
    Buffer buffer;
    buffer.size = size;
    
    VkBufferCreateInfo bufferInfo{};
    bufferInfo.sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
    bufferInfo.size = size;
    bufferInfo.usage = usage;
    bufferInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    
    VkResult result = vkCreateBuffer(device, &bufferInfo, nullptr, &buffer.buffer);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to create buffer: " << result;
        return {};
    }
    
    VkMemoryRequirements memRequirements;
    vkGetBufferMemoryRequirements(device, buffer.buffer, &memRequirements);
    
    VkPhysicalDeviceMemoryProperties memProperties;
    vkGetPhysicalDeviceMemoryProperties(physicalDevice, &memProperties);
    
    uint32_t memoryTypeIndex = UINT32_MAX;
    for (uint32_t i = 0; i < memProperties.memoryTypeCount; i++) {
        if ((memRequirements.memoryTypeBits & (1 << i)) &&
            (memProperties.memoryTypes[i].propertyFlags & properties) == properties) {
            memoryTypeIndex = i;
            break;
        }
    }
    
    if (memoryTypeIndex == UINT32_MAX) {
        LOG_ERROR() << "Failed to find suitable memory type";
        vkDestroyBuffer(device, buffer.buffer, nullptr);
        return {};
    }
    
    VkMemoryAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    allocInfo.allocationSize = memRequirements.size;
    allocInfo.memoryTypeIndex = memoryTypeIndex;
    
    result = vkAllocateMemory(device, &allocInfo, nullptr, &buffer.memory);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to allocate buffer memory: " << result;
        vkDestroyBuffer(device, buffer.buffer, nullptr);
        return {};
    }
    
    vkBindBufferMemory(device, buffer.buffer, buffer.memory, 0);
    
    if (properties & VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT) {
        vkMapMemory(device, buffer.memory, 0, size, 0, &buffer.mapped);
    }
    
    return buffer;
}

Image createImage(VkDevice device, VkPhysicalDevice physicalDevice,
                  uint32_t width, uint32_t height, VkFormat format,
                  VkImageTiling tiling, VkImageUsageFlags usage,
                  VkMemoryPropertyFlags properties) {
    Image image;
    image.width = width;
    image.height = height;
    image.format = format;
    
    VkImageCreateInfo imageInfo{};
    imageInfo.sType = VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;
    imageInfo.imageType = VK_IMAGE_TYPE_2D;
    imageInfo.extent.width = width;
    imageInfo.extent.height = height;
    imageInfo.extent.depth = 1;
    imageInfo.mipLevels = 1;
    imageInfo.arrayLayers = 1;
    imageInfo.format = format;
    imageInfo.tiling = tiling;
    imageInfo.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    imageInfo.usage = usage;
    imageInfo.samples = VK_SAMPLE_COUNT_1_BIT;
    imageInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    
    VkResult result = vkCreateImage(device, &imageInfo, nullptr, &image.image);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to create image: " << result;
        return {};
    }
    
    VkMemoryRequirements memRequirements;
    vkGetImageMemoryRequirements(device, image.image, &memRequirements);
    
    VkPhysicalDeviceMemoryProperties memProperties;
    vkGetPhysicalDeviceMemoryProperties(physicalDevice, &memProperties);
    
    uint32_t memoryTypeIndex = UINT32_MAX;
    for (uint32_t i = 0; i < memProperties.memoryTypeCount; i++) {
        if ((memRequirements.memoryTypeBits & (1 << i)) &&
            (memProperties.memoryTypes[i].propertyFlags & properties) == properties) {
            memoryTypeIndex = i;
            break;
        }
    }
    
    if (memoryTypeIndex == UINT32_MAX) {
        LOG_ERROR() << "Failed to find suitable memory type for image";
        vkDestroyImage(device, image.image, nullptr);
        return {};
    }
    
    VkMemoryAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    allocInfo.allocationSize = memRequirements.size;
    allocInfo.memoryTypeIndex = memoryTypeIndex;
    
    result = vkAllocateMemory(device, &allocInfo, nullptr, &image.memory);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to allocate image memory: " << result;
        vkDestroyImage(device, image.image, nullptr);
        return {};
    }
    
    vkBindImageMemory(device, image.image, image.memory, 0);
    
    return image;
}

ImageView createImageView(VkDevice device, VkImage image, VkFormat format,
                          VkImageAspectFlags aspectFlags) {
    VkImageViewCreateInfo viewInfo{};
    viewInfo.sType = VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;
    viewInfo.image = image;
    viewInfo.viewType = VK_IMAGE_VIEW_TYPE_2D;
    viewInfo.format = format;
    viewInfo.subresourceRange.aspectMask = aspectFlags;
    viewInfo.subresourceRange.baseMipLevel = 0;
    viewInfo.subresourceRange.levelCount = 1;
    viewInfo.subresourceRange.baseArrayLayer = 0;
    viewInfo.subresourceRange.layerCount = 1;
    
    VkImageView imageView;
    VkResult result = vkCreateImageView(device, &viewInfo, nullptr, &imageView);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to create image view: " << result;
        return VK_NULL_HANDLE;
    }
    
    return imageView;
}

void copyBuffer(VkDevice device, VkCommandPool commandPool, VkQueue queue,
                Buffer& srcBuffer, Buffer& dstBuffer, VkDeviceSize size) {
    VkCommandBuffer commandBuffer = beginSingleTimeCommands(device, commandPool);
    
    VkBufferCopy copyRegion{};
    copyRegion.size = size;
    vkCmdCopyBuffer(commandBuffer, srcBuffer.buffer, dstBuffer.buffer, 1, &copyRegion);
    
    endSingleTimeCommands(device, commandPool, queue, commandBuffer);
}

void copyBufferToImage(VkDevice device, VkCommandPool commandPool, VkQueue queue,
                       Buffer& buffer, Image& image, uint32_t width, uint32_t height) {
    VkCommandBuffer commandBuffer = beginSingleTimeCommands(device, commandPool);
    
    VkBufferImageCopy region{};
    region.bufferOffset = 0;
    region.bufferRowLength = 0;
    region.bufferImageHeight = 0;
    region.imageSubresource.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    region.imageSubresource.mipLevel = 0;
    region.imageSubresource.baseArrayLayer = 0;
    region.imageSubresource.layerCount = 1;
    region.imageOffset = {0, 0, 0};
    region.imageExtent = {width, height, 1};
    
    vkCmdCopyBufferToImage(commandBuffer, buffer.buffer, image.image,
                          VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &region);
    
    endSingleTimeCommands(device, commandPool, queue, commandBuffer);
}

void copyImageToBuffer(VkDevice device, VkCommandPool commandPool, VkQueue queue,
                       Image& image, Buffer& buffer, uint32_t width, uint32_t height) {
    VkCommandBuffer commandBuffer = beginSingleTimeCommands(device, commandPool);
    
    VkBufferImageCopy region{};
    region.bufferOffset = 0;
    region.bufferRowLength = 0;
    region.bufferImageHeight = 0;
    region.imageSubresource.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    region.imageSubresource.mipLevel = 0;
    region.imageSubresource.baseArrayLayer = 0;
    region.imageSubresource.layerCount = 1;
    region.imageOffset = {0, 0, 0};
    region.imageExtent = {width, height, 1};
    
    vkCmdCopyImageToBuffer(commandBuffer, image.image,
                          VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
                          buffer.buffer, 1, &region);
    
    endSingleTimeCommands(device, commandPool, queue, commandBuffer);
}

void transitionImageLayout(VkDevice device, VkCommandPool commandPool, VkQueue queue,
                           Image& image, VkFormat format,
                           VkImageLayout oldLayout, VkImageLayout newLayout) {
    VkCommandBuffer commandBuffer = beginSingleTimeCommands(device, commandPool);
    
    VkImageMemoryBarrier barrier{};
    barrier.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
    barrier.oldLayout = oldLayout;
    barrier.newLayout = newLayout;
    barrier.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    barrier.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    barrier.image = image.image;
    barrier.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    barrier.subresourceRange.baseMipLevel = 0;
    barrier.subresourceRange.levelCount = 1;
    barrier.subresourceRange.baseArrayLayer = 0;
    barrier.subresourceRange.layerCount = 1;
    
    if (newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL) {
        barrier.subresourceRange.aspectMask = VK_IMAGE_ASPECT_DEPTH_BIT;
        if (format == VK_FORMAT_D32_SFLOAT_S8_UINT || format == VK_FORMAT_D24_UNORM_S8_UINT) {
            barrier.subresourceRange.aspectMask |= VK_IMAGE_ASPECT_STENCIL_BIT;
        }
    }
    
    VkPipelineStageFlags sourceStage;
    VkPipelineStageFlags destinationStage;
    
    if (oldLayout == VK_IMAGE_LAYOUT_UNDEFINED && 
        newLayout == VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL) {
        barrier.srcAccessMask = 0;
        barrier.dstAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        sourceStage = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT;
        destinationStage = VK_PIPELINE_STAGE_TRANSFER_BIT;
    } else if (oldLayout == VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL && 
               newLayout == VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL) {
        barrier.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
        sourceStage = VK_PIPELINE_STAGE_TRANSFER_BIT;
        destinationStage = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
    } else if (oldLayout == VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL &&
               newLayout == VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL) {
        barrier.srcAccessMask = VK_ACCESS_SHADER_READ_BIT;
        barrier.dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
        sourceStage = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
        destinationStage = VK_PIPELINE_STAGE_TRANSFER_BIT;
    } else if (oldLayout == VK_IMAGE_LAYOUT_UNDEFINED &&
               newLayout == VK_IMAGE_LAYOUT_GENERAL) {
        barrier.srcAccessMask = 0;
        barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT | VK_ACCESS_SHADER_WRITE_BIT;
        sourceStage = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT;
        destinationStage = VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT;
    } else if (oldLayout == VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL &&
               newLayout == VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL) {
        barrier.srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
        barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
        sourceStage = VK_PIPELINE_STAGE_TRANSFER_BIT;
        destinationStage = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
    } else {
        barrier.srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT;
        barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
        sourceStage = VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT;
        destinationStage = VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT;
    }
    
    vkCmdPipelineBarrier(commandBuffer, sourceStage, destinationStage, 0,
                        0, nullptr, 0, nullptr, 1, &barrier);
    
    endSingleTimeCommands(device, commandPool, queue, commandBuffer);
}

void destroyBuffer(VkDevice device, Buffer& buffer) {
    if (buffer.mapped != nullptr) {
        vkUnmapMemory(device, buffer.memory);
        buffer.mapped = nullptr;
    }
    if (buffer.buffer != VK_NULL_HANDLE) {
        vkDestroyBuffer(device, buffer.buffer, nullptr);
        buffer.buffer = VK_NULL_HANDLE;
    }
    if (buffer.memory != VK_NULL_HANDLE) {
        vkFreeMemory(device, buffer.memory, nullptr);
        buffer.memory = VK_NULL_HANDLE;
    }
    buffer.size = 0;
}

void destroyImage(VkDevice device, Image& image) {
    if (image.view != VK_NULL_HANDLE) {
        vkDestroyImageView(device, image.view, nullptr);
        image.view = VK_NULL_HANDLE;
    }
    if (image.image != VK_NULL_HANDLE) {
        vkDestroyImage(device, image.image, nullptr);
        image.image = VK_NULL_HANDLE;
    }
    if (image.memory != VK_NULL_HANDLE) {
        vkFreeMemory(device, image.memory, nullptr);
        image.memory = VK_NULL_HANDLE;
    }
    image.width = 0;
    image.height = 0;
    image.format = VK_FORMAT_UNDEFINED;
}

VkCommandBuffer beginSingleTimeCommands(VkDevice device, VkCommandPool commandPool) {
    VkCommandBufferAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    allocInfo.commandPool = commandPool;
    allocInfo.commandBufferCount = 1;
    
    VkCommandBuffer commandBuffer;
    vkAllocateCommandBuffers(device, &allocInfo, &commandBuffer);
    
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
    beginInfo.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    
    vkBeginCommandBuffer(commandBuffer, &beginInfo);
    
    return commandBuffer;
}

void endSingleTimeCommands(VkDevice device, VkCommandPool commandPool,
                           VkQueue queue, VkCommandBuffer commandBuffer) {
    vkEndCommandBuffer(commandBuffer);
    
    VkSubmitInfo submitInfo{};
    submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    submitInfo.commandBufferCount = 1;
    submitInfo.pCommandBuffers = &commandBuffer;
    
    vkQueueSubmit(queue, 1, &submitInfo, VK_NULL_HANDLE);
    vkQueueWaitIdle(queue);
    
    vkFreeCommandBuffers(device, commandPool, 1, &commandBuffer);
}

}
