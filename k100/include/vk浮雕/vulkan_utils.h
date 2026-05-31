#pragma once

#include <vulkan/vulkan.h>
#include <vector>
#include <string>
#include "common.h"

namespace vk浮雕::vulkan_utils {

struct Buffer {
    VkBuffer buffer = VK_NULL_HANDLE;
    VkDeviceMemory memory = VK_NULL_HANDLE;
    VkDeviceSize size = 0;
    void* mapped = nullptr;
};

struct Image {
    VkImage image = VK_NULL_HANDLE;
    VkDeviceMemory memory = VK_NULL_HANDLE;
    VkImageView view = VK_NULL_HANDLE;
    VkFormat format = VK_FORMAT_UNDEFINED;
    uint32_t width = 0;
    uint32_t height = 0;
};

VkShaderModule createShaderModule(VkDevice device, const std::vector<uint8_t>& code);

Buffer createBuffer(VkDevice device, VkPhysicalDevice physicalDevice,
                    VkDeviceSize size, VkBufferUsageFlags usage,
                    VkMemoryPropertyFlags properties);

Image createImage(VkDevice device, VkPhysicalDevice physicalDevice,
                  uint32_t width, uint32_t height, VkFormat format,
                  VkImageTiling tiling, VkImageUsageFlags usage,
                  VkMemoryPropertyFlags properties);

ImageView createImageView(VkDevice device, VkImage image, VkFormat format,
                          VkImageAspectFlags aspectFlags);

void copyBuffer(VkDevice device, VkCommandPool commandPool, VkQueue queue,
                Buffer& srcBuffer, Buffer& dstBuffer, VkDeviceSize size);

void copyBufferToImage(VkDevice device, VkCommandPool commandPool, VkQueue queue,
                       Buffer& buffer, Image& image, uint32_t width, uint32_t height);

void copyImageToBuffer(VkDevice device, VkCommandPool commandPool, VkQueue queue,
                       Image& image, Buffer& buffer, uint32_t width, uint32_t height);

void transitionImageLayout(VkDevice device, VkCommandPool commandPool, VkQueue queue,
                           Image& image, VkFormat format,
                           VkImageLayout oldLayout, VkImageLayout newLayout);

void destroyBuffer(VkDevice device, Buffer& buffer);

void destroyImage(VkDevice device, Image& image);

VkCommandBuffer beginSingleTimeCommands(VkDevice device, VkCommandPool commandPool);

void endSingleTimeCommands(VkDevice device, VkCommandPool commandPool,
                           VkQueue queue, VkCommandBuffer commandBuffer);

}
