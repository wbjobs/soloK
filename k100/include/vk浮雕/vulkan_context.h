#pragma once

#include <vulkan/vulkan.h>
#include <vector>
#include <string>
#include "common.h"

namespace vk浮雕 {

class VulkanContext {
public:
    struct Config {
        bool enableValidationLayers = true;
        uint32_t width = 1920;
        uint32_t height = 1080;
    };

    VulkanContext() = default;
    ~VulkanContext();
    
    bool init(const Config& config);
    void cleanup();
    
    VkInstance getInstance() const { return m_instance; }
    VkPhysicalDevice getPhysicalDevice() const { return m_physicalDevice; }
    VkDevice getDevice() const { return m_device; }
    VkQueue getGraphicsQueue() const { return m_graphicsQueue; }
    VkQueue getComputeQueue() const { return m_computeQueue; }
    VkCommandPool getCommandPool() const { return m_commandPool; }
    ImageSize getImageSize() const { return {m_width, m_height}; }
    
    uint32_t findMemoryType(uint32_t typeFilter, VkMemoryPropertyFlags properties) const;
    
private:
    bool createInstance();
    bool setupDebugMessenger();
    bool pickPhysicalDevice();
    bool createLogicalDevice();
    bool createCommandPool();
    
    bool checkValidationLayerSupport();
    bool checkDeviceExtensionSupport(VkPhysicalDevice device);
    int rateDeviceSuitability(VkPhysicalDevice device);
    
    VkInstance m_instance = VK_NULL_HANDLE;
    VkDebugUtilsMessengerEXT m_debugMessenger = VK_NULL_HANDLE;
    VkPhysicalDevice m_physicalDevice = VK_NULL_HANDLE;
    VkDevice m_device = VK_NULL_HANDLE;
    VkQueue m_graphicsQueue = VK_NULL_HANDLE;
    VkQueue m_computeQueue = VK_NULL_HANDLE;
    VkCommandPool m_commandPool = VK_NULL_HANDLE;
    
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    bool m_validationLayersEnabled = false;
    bool m_initialized = false;
};

}
