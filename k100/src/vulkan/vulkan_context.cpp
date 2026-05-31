#include "vk浮雕/vulkan_context.h"
#include "vk浮雕/logger.h"
#include <vector>
#include <set>
#include <cstring>

namespace vk浮雕 {

static VKAPI_ATTR VkBool32 VKAPI_CALL debugCallback(
    VkDebugUtilsMessageSeverityFlagBitsEXT severity,
    VkDebugUtilsMessageTypeFlagsEXT type,
    const VkDebugUtilsMessengerCallbackDataEXT* pCallbackData,
    void* pUserData) {
    
    if (severity >= VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT) {
        LOG_WARNING() << "Vulkan: " << pCallbackData->pMessage;
    } else {
        LOG_INFO() << "Vulkan: " << pCallbackData->pMessage;
    }
    
    return VK_FALSE;
}

VulkanContext::~VulkanContext() {
    cleanup();
}

bool VulkanContext::init(const Config& config) {
    if (m_initialized) return true;
    
    m_width = config.width;
    m_height = config.height;
    m_validationLayersEnabled = config.enableValidationLayers;
    
    if (!createInstance()) {
        LOG_ERROR() << "Failed to create Vulkan instance";
        return false;
    }
    
    if (m_validationLayersEnabled && !setupDebugMessenger()) {
        LOG_ERROR() << "Failed to setup debug messenger";
        return false;
    }
    
    if (!pickPhysicalDevice()) {
        LOG_ERROR() << "Failed to find suitable GPU";
        return false;
    }
    
    if (!createLogicalDevice()) {
        LOG_ERROR() << "Failed to create logical device";
        return false;
    }
    
    if (!createCommandPool()) {
        LOG_ERROR() << "Failed to create command pool";
        return false;
    }
    
    m_initialized = true;
    LOG_INFO() << "Vulkan context initialized successfully";
    return true;
}

void VulkanContext::cleanup() {
    if (!m_initialized) return;
    
    if (m_commandPool != VK_NULL_HANDLE) {
        vkDestroyCommandPool(m_device, m_commandPool, nullptr);
        m_commandPool = VK_NULL_HANDLE;
    }
    
    if (m_device != VK_NULL_HANDLE) {
        vkDestroyDevice(m_device, nullptr);
        m_device = VK_NULL_HANDLE;
    }
    
    if (m_validationLayersEnabled && m_debugMessenger != VK_NULL_HANDLE) {
        auto func = (PFN_vkDestroyDebugUtilsMessengerEXT)
            vkGetInstanceProcAddr(m_instance, "vkDestroyDebugUtilsMessengerEXT");
        if (func != nullptr) {
            func(m_instance, m_debugMessenger, nullptr);
        }
        m_debugMessenger = VK_NULL_HANDLE;
    }
    
    if (m_instance != VK_NULL_HANDLE) {
        vkDestroyInstance(m_instance, nullptr);
        m_instance = VK_NULL_HANDLE;
    }
    
    m_initialized = false;
    LOG_INFO() << "Vulkan context cleaned up";
}

bool VulkanContext::createInstance() {
    VkApplicationInfo appInfo{};
    appInfo.sType = VK_STRUCTURE_TYPE_APPLICATION_INFO;
    appInfo.pApplicationName = "vk浮雕";
    appInfo.applicationVersion = VK_MAKE_VERSION(1, 0, 0);
    appInfo.pEngineName = "No Engine";
    appInfo.engineVersion = VK_MAKE_VERSION(1, 0, 0);
    appInfo.apiVersion = VK_API_VERSION_1_3;
    
    VkInstanceCreateInfo createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
    createInfo.pApplicationInfo = &appInfo;
    
    uint32_t extensionCount = 0;
    vkEnumerateInstanceExtensionProperties(nullptr, &extensionCount, nullptr);
    std::vector<VkExtensionProperties> extensions(extensionCount);
    vkEnumerateInstanceExtensionProperties(nullptr, &extensionCount, extensions.data());
    
    std::vector<const char*> requiredExtensions;
    requiredExtensions.push_back(VK_KHR_GET_PHYSICAL_DEVICE_PROPERTIES_2_EXTENSION_NAME);
    
    if (m_validationLayersEnabled) {
        requiredExtensions.push_back(VK_EXT_DEBUG_UTILS_EXTENSION_NAME);
    }
    
    for (const auto& ext : requiredExtensions) {
        bool found = false;
        for (const auto& prop : extensions) {
            if (strcmp(ext, prop.extensionName) == 0) {
                found = true;
                break;
            }
        }
        if (!found) {
            LOG_ERROR() << "Required extension not available: " << ext;
            return false;
        }
    }
    
    createInfo.enabledExtensionCount = static_cast<uint32_t>(requiredExtensions.size());
    createInfo.ppEnabledExtensionNames = requiredExtensions.data();
    
    if (m_validationLayersEnabled) {
        const std::vector<const char*> validationLayers = {
            "VK_LAYER_KHRONOS_validation"
        };
        
        if (!checkValidationLayerSupport()) {
            LOG_ERROR() << "Validation layers not available";
            return false;
        }
        
        createInfo.enabledLayerCount = static_cast<uint32_t>(validationLayers.size());
        createInfo.ppEnabledLayerNames = validationLayers.data();
        
        VkDebugUtilsMessengerCreateInfoEXT debugCreateInfo{};
        debugCreateInfo.sType = VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT;
        debugCreateInfo.messageSeverity = 
            VK_DEBUG_UTILS_MESSAGE_SEVERITY_VERBOSE_BIT_EXT |
            VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT |
            VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT;
        debugCreateInfo.messageType = 
            VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT |
            VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT |
            VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT;
        debugCreateInfo.pfnUserCallback = debugCallback;
        
        createInfo.pNext = &debugCreateInfo;
    } else {
        createInfo.enabledLayerCount = 0;
        createInfo.pNext = nullptr;
    }
    
    VkResult result = vkCreateInstance(&createInfo, nullptr, &m_instance);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to create instance: " << result;
        return false;
    }
    
    return true;
}

bool VulkanContext::checkValidationLayerSupport() {
    uint32_t layerCount;
    vkEnumerateInstanceLayerProperties(&layerCount, nullptr);
    
    std::vector<VkLayerProperties> availableLayers(layerCount);
    vkEnumerateInstanceLayerProperties(&layerCount, availableLayers.data());
    
    const std::vector<const char*> validationLayers = {
        "VK_LAYER_KHRONOS_validation"
    };
    
    for (const char* layerName : validationLayers) {
        bool layerFound = false;
        
        for (const auto& layerProperties : availableLayers) {
            if (strcmp(layerName, layerProperties.layerName) == 0) {
                layerFound = true;
                break;
            }
        }
        
        if (!layerFound) {
            return false;
        }
    }
    
    return true;
}

bool VulkanContext::setupDebugMessenger() {
    VkDebugUtilsMessengerCreateInfoEXT createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT;
    createInfo.messageSeverity = 
        VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT;
    createInfo.messageType = 
        VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT;
    createInfo.pfnUserCallback = debugCallback;
    
    auto func = (PFN_vkCreateDebugUtilsMessengerEXT)
        vkGetInstanceProcAddr(m_instance, "vkCreateDebugUtilsMessengerEXT");
    
    if (func == nullptr) {
        LOG_ERROR() << "Failed to get debug messenger create function";
        return false;
    }
    
    VkResult result = func(m_instance, &createInfo, nullptr, &m_debugMessenger);
    return result == VK_SUCCESS;
}

bool VulkanContext::pickPhysicalDevice() {
    uint32_t deviceCount = 0;
    vkEnumeratePhysicalDevices(m_instance, &deviceCount, nullptr);
    
    if (deviceCount == 0) {
        LOG_ERROR() << "No GPUs with Vulkan support found";
        return false;
    }
    
    std::vector<VkPhysicalDevice> devices(deviceCount);
    vkEnumeratePhysicalDevices(m_instance, &deviceCount, devices.data());
    
    int bestScore = -1;
    VkPhysicalDevice bestDevice = VK_NULL_HANDLE;
    
    for (const auto& device : devices) {
        int score = rateDeviceSuitability(device);
        if (score > bestScore) {
            bestScore = score;
            bestDevice = device;
        }
    }
    
    if (bestDevice == VK_NULL_HANDLE) {
        LOG_ERROR() << "No suitable GPU found";
        return false;
    }
    
    m_physicalDevice = bestDevice;
    
    VkPhysicalDeviceProperties props;
    vkGetPhysicalDeviceProperties(m_physicalDevice, &props);
    LOG_INFO() << "Using GPU: " << props.deviceName;
    
    return true;
}

int VulkanContext::rateDeviceSuitability(VkPhysicalDevice device) {
    VkPhysicalDeviceProperties deviceProperties;
    VkPhysicalDeviceFeatures deviceFeatures;
    vkGetPhysicalDeviceProperties(device, &deviceProperties);
    vkGetPhysicalDeviceFeatures(device, &deviceFeatures);
    
    int score = 0;
    
    if (deviceProperties.deviceType == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU) {
        score += 1000;
    } else if (deviceProperties.deviceType == VK_PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU) {
        score += 500;
    }
    
    score += deviceProperties.limits.maxImageDimension2D;
    
    if (!checkDeviceExtensionSupport(device)) {
        return -1;
    }
    
    uint32_t queueFamilyCount = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(device, &queueFamilyCount, nullptr);
    
    std::vector<VkQueueFamilyProperties> queueFamilies(queueFamilyCount);
    vkGetPhysicalDeviceQueueFamilyProperties(device, &queueFamilyCount, queueFamilies.data());
    
    bool hasGraphics = false;
    bool hasCompute = false;
    
    for (const auto& queueFamily : queueFamilies) {
        if (queueFamily.queueFlags & VK_QUEUE_GRAPHICS_BIT) {
            hasGraphics = true;
        }
        if (queueFamily.queueFlags & VK_QUEUE_COMPUTE_BIT) {
            hasCompute = true;
        }
    }
    
    if (!hasGraphics || !hasCompute) {
        return -1;
    }
    
    if (!deviceFeatures.geometryShader) {
        return -1;
    }
    
    return score;
}

bool VulkanContext::checkDeviceExtensionSupport(VkPhysicalDevice device) {
    uint32_t extensionCount;
    vkEnumerateDeviceExtensionProperties(device, nullptr, &extensionCount, nullptr);
    
    std::vector<VkExtensionProperties> availableExtensions(extensionCount);
    vkEnumerateDeviceExtensionProperties(device, nullptr, &extensionCount, availableExtensions.data());
    
    const std::vector<const char*> requiredExtensions = {
        VK_KHR_SWAPCHAIN_EXTENSION_NAME
    };
    
    for (const char* required : requiredExtensions) {
        bool found = false;
        for (const auto& extension : availableExtensions) {
            if (strcmp(required, extension.extensionName) == 0) {
                found = true;
                break;
            }
        }
        if (!found) return false;
    }
    
    return true;
}

bool VulkanContext::createLogicalDevice() {
    uint32_t queueFamilyCount = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(m_physicalDevice, &queueFamilyCount, nullptr);
    
    std::vector<VkQueueFamilyProperties> queueFamilies(queueFamilyCount);
    vkGetPhysicalDeviceQueueFamilyProperties(m_physicalDevice, &queueFamilyCount, queueFamilies.data());
    
    int graphicsFamily = -1;
    int computeFamily = -1;
    
    for (int i = 0; i < queueFamilies.size(); i++) {
        if (queueFamilies[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) {
            graphicsFamily = i;
        }
        if (queueFamilies[i].queueFlags & VK_QUEUE_COMPUTE_BIT) {
            computeFamily = i;
        }
    }
    
    if (graphicsFamily == -1 || computeFamily == -1) {
        LOG_ERROR() << "Failed to find required queue families";
        return false;
    }
    
    std::set<uint32_t> uniqueQueueFamilies = {
        static_cast<uint32_t>(graphicsFamily),
        static_cast<uint32_t>(computeFamily)
    };
    
    float queuePriority = 1.0f;
    std::vector<VkDeviceQueueCreateInfo> queueCreateInfos;
    
    for (uint32_t queueFamily : uniqueQueueFamilies) {
        VkDeviceQueueCreateInfo queueCreateInfo{};
        queueCreateInfo.sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
        queueCreateInfo.queueFamilyIndex = queueFamily;
        queueCreateInfo.queueCount = 1;
        queueCreateInfo.pQueuePriorities = &queuePriority;
        queueCreateInfos.push_back(queueCreateInfo);
    }
    
    VkPhysicalDeviceFeatures deviceFeatures{};
    deviceFeatures.shaderInt64 = VK_TRUE;
    
    VkDeviceCreateInfo createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
    createInfo.queueCreateInfoCount = static_cast<uint32_t>(queueCreateInfos.size());
    createInfo.pQueueCreateInfos = queueCreateInfos.data();
    createInfo.pEnabledFeatures = &deviceFeatures;
    
    const std::vector<const char*> deviceExtensions = {
        VK_KHR_SWAPCHAIN_EXTENSION_NAME
    };
    createInfo.enabledExtensionCount = static_cast<uint32_t>(deviceExtensions.size());
    createInfo.ppEnabledExtensionNames = deviceExtensions.data();
    
    if (m_validationLayersEnabled) {
        const std::vector<const char*> validationLayers = {
            "VK_LAYER_KHRONOS_validation"
        };
        createInfo.enabledLayerCount = static_cast<uint32_t>(validationLayers.size());
        createInfo.ppEnabledLayerNames = validationLayers.data();
    } else {
        createInfo.enabledLayerCount = 0;
    }
    
    VkResult result = vkCreateDevice(m_physicalDevice, &createInfo, nullptr, &m_device);
    if (result != VK_SUCCESS) {
        LOG_ERROR() << "Failed to create logical device: " << result;
        return false;
    }
    
    vkGetDeviceQueue(m_device, graphicsFamily, 0, &m_graphicsQueue);
    vkGetDeviceQueue(m_device, computeFamily, 0, &m_computeQueue);
    
    return true;
}

bool VulkanContext::createCommandPool() {
    uint32_t queueFamilyCount = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(m_physicalDevice, &queueFamilyCount, nullptr);
    
    std::vector<VkQueueFamilyProperties> queueFamilies(queueFamilyCount);
    vkGetPhysicalDeviceQueueFamilyProperties(m_physicalDevice, &queueFamilyCount, queueFamilies.data());
    
    int graphicsFamily = -1;
    for (int i = 0; i < queueFamilies.size(); i++) {
        if (queueFamilies[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) {
            graphicsFamily = i;
            break;
        }
    }
    
    VkCommandPoolCreateInfo poolInfo{};
    poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
    poolInfo.queueFamilyIndex = graphicsFamily;
    poolInfo.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
    
    VkResult result = vkCreateCommandPool(m_device, &poolInfo, nullptr, &m_commandPool);
    return result == VK_SUCCESS;
}

uint32_t VulkanContext::findMemoryType(uint32_t typeFilter, VkMemoryPropertyFlags properties) const {
    VkPhysicalDeviceMemoryProperties memProperties;
    vkGetPhysicalDeviceMemoryProperties(m_physicalDevice, &memProperties);
    
    for (uint32_t i = 0; i < memProperties.memoryTypeCount; i++) {
        if ((typeFilter & (1 << i)) && 
            (memProperties.memoryTypes[i].propertyFlags & properties) == properties) {
            return i;
        }
    }
    
    throw std::runtime_error("Failed to find suitable memory type");
}

}
