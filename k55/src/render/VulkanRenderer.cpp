#include "VulkanRenderer.h"
#include <fstream>
#include <iostream>
#include <cstring>
#include <limits>
#include <algorithm>
#include <set>
#include <mutex>
#include <random>
#include <array>

#ifndef NDEBUG
const bool enableValidationLayers = true;
#else
const bool enableValidationLayers = false;
#endif

const std::vector<const char*> validationLayers = {
    "VK_LAYER_KHRONOS_validation"
};

const std::vector<const char*> deviceExtensions = {
    VK_KHR_SWAPCHAIN_EXTENSION_NAME
};

static VKAPI_ATTR VkBool32 VKAPI_CALL debugCallback(
    VkDebugUtilsMessageSeverityFlagBitsEXT messageSeverity,
    VkDebugUtilsMessageTypeFlagsEXT messageType,
    const VkDebugUtilsMessengerCallbackDataEXT* pCallbackData,
    void* pUserData) {

    if (messageSeverity >= VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT) {
        std::cerr << "Vulkan: " << pCallbackData->pMessage << std::endl;
    }

    return VK_FALSE;
}

VulkanRenderer::~VulkanRenderer() {
    cleanup();
}

void VulkanRenderer::checkVulkanError(VkResult result, const char* operation) {
    if (result != VK_SUCCESS) {
        std::cerr << "Vulkan error during " << operation << ": " << result << std::endl;
    }
}

void VulkanRenderer::init(void* windowHandle, uint32_t w, uint32_t h) {
    width = w;
    height = h;

    ssaoParams = { Vec2(static_cast<float>(width), static_cast<float>(height)), 0.025f, 0.5f, 1.5f, 64 };
    postprocessParams = { Vec2(static_cast<float>(width), static_cast<float>(height)), 1.0f, 0.6f, 0.0f };

    createInstance();
    setupDebugMessenger();
    createSurface(windowHandle);
    pickPhysicalDevice();
    createLogicalDevice();
    createSwapChain();
    createImageViews();
    createRenderPass();
    createShadowRenderPass();
    createGBufferRenderPass();
    createSSAORenderPass();
    createBlurRenderPass();
    createReflectionRenderPass();
    createPostprocessRenderPass();
    createDescriptorSetLayout();
    createGraphicsPipeline();
    createShadowPipeline();
    createGBufferPipeline();
    createSSAOPipeline();
    createBlurPipeline();
    createReflectionPipeline();
    createPostprocessPipeline();
    createDepthResources();
    createShadowResources();
    createGBufferResources();
    createSSAOResources();
    createReflectionResources();
    createFramebuffers();
    createShadowFramebuffer();
    createPostprocessFramebuffer();
    createCommandPool();
    createUniformBuffers();
    generateSSAOKernel();
    generateSSAONoiseTexture();
    uploadSSAOKernel();
    createDescriptorPool();
    createDescriptorSets();
    createCommandBuffers();
    createSyncObjects();

    initialized = true;
}

void VulkanRenderer::cleanup() {
    if (!initialized) return;

    vkDeviceWaitIdle(device);

    for (auto& [key, mesh] : chunkMeshes) {
        if (mesh.vertexBuffer) vkDestroyBuffer(device, mesh.vertexBuffer, nullptr);
        if (mesh.vertexMemory) vkFreeMemory(device, mesh.vertexMemory, nullptr);
        if (mesh.indexBuffer) vkDestroyBuffer(device, mesh.indexBuffer, nullptr);
        if (mesh.indexMemory) vkFreeMemory(device, mesh.indexMemory, nullptr);
    }
    chunkMeshes.clear();

    cleanupSwapChain();

    vkDestroyImageView(device, shadowImageView, nullptr);
    vkDestroyImage(device, shadowImage, nullptr);
    vkFreeMemory(device, shadowImageMemory, nullptr);
    vkDestroyFramebuffer(device, shadowFramebuffer, nullptr);

    vkDestroyRenderPass(device, shadowRenderPass, nullptr);
    vkDestroyPipeline(device, shadowPipeline, nullptr);

    for (auto& frame : perFrame) {
        if (frame.cameraUniformBuffer) vkDestroyBuffer(device, frame.cameraUniformBuffer, nullptr);
        if (frame.cameraUniformMemory) vkFreeMemory(device, frame.cameraUniformMemory, nullptr);
        if (frame.lightUniformBuffer) vkDestroyBuffer(device, frame.lightUniformBuffer, nullptr);
        if (frame.lightUniformMemory) vkFreeMemory(device, frame.lightUniformMemory, nullptr);
    }

    vkDestroyDescriptorPool(device, descriptorPool, nullptr);
    vkDestroyPipeline(device, graphicsPipeline, nullptr);
    vkDestroyPipelineLayout(device, pipelineLayout, nullptr);
    vkDestroyDescriptorSetLayout(device, descriptorSetLayout, nullptr);
    vkDestroyRenderPass(device, renderPass, nullptr);

    cleanupGBuffer();
    cleanupSSAO();
    cleanupReflection();
    cleanupPostprocess();

    if (gbufferRenderPass) vkDestroyRenderPass(device, gbufferRenderPass, nullptr);
    if (ssaoRenderPass) vkDestroyRenderPass(device, ssaoRenderPass, nullptr);
    if (blurRenderPass) vkDestroyRenderPass(device, blurRenderPass, nullptr);
    if (reflectionRenderPass) vkDestroyRenderPass(device, reflectionRenderPass, nullptr);
    if (postprocessRenderPass) vkDestroyRenderPass(device, postprocessRenderPass, nullptr);

    if (gbufferDescriptorSetLayout) vkDestroyDescriptorSetLayout(device, gbufferDescriptorSetLayout, nullptr);
    if (ssaoDescriptorSetLayout) vkDestroyDescriptorSetLayout(device, ssaoDescriptorSetLayout, nullptr);
    if (blurDescriptorSetLayout) vkDestroyDescriptorSetLayout(device, blurDescriptorSetLayout, nullptr);
    if (postprocessDescriptorSetLayout) vkDestroyDescriptorSetLayout(device, postprocessDescriptorSetLayout, nullptr);

    if (gbufferPipelineLayout) vkDestroyPipelineLayout(device, gbufferPipelineLayout, nullptr);
    if (ssaoPipelineLayout) vkDestroyPipelineLayout(device, ssaoPipelineLayout, nullptr);
    if (blurPipelineLayout) vkDestroyPipelineLayout(device, blurPipelineLayout, nullptr);
    if (postprocessPipelineLayout) vkDestroyPipelineLayout(device, postprocessPipelineLayout, nullptr);

    if (gbufferPipeline) vkDestroyPipeline(device, gbufferPipeline, nullptr);
    if (ssaoPipeline) vkDestroyPipeline(device, ssaoPipeline, nullptr);
    if (blurPipeline) vkDestroyPipeline(device, blurPipeline, nullptr);
    if (reflectionPipeline) vkDestroyPipeline(device, reflectionPipeline, nullptr);
    if (postprocessPipeline) vkDestroyPipeline(device, postprocessPipeline, nullptr);

    for (int i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) {
        vkDestroySemaphore(device, imageAvailableSemaphores[i], nullptr);
        vkDestroySemaphore(device, shadowFinishedSemaphores[i], nullptr);
        vkDestroySemaphore(device, gbufferFinishedSemaphores[i], nullptr);
        vkDestroySemaphore(device, ssaoFinishedSemaphores[i], nullptr);
        vkDestroySemaphore(device, blurFinishedSemaphores[i], nullptr);
        vkDestroySemaphore(device, reflectionFinishedSemaphores[i], nullptr);
        vkDestroySemaphore(device, postprocessFinishedSemaphores[i], nullptr);
        vkDestroySemaphore(device, renderFinishedSemaphores[i], nullptr);
        vkDestroyFence(device, inFlightFences[i], nullptr);
    }

    vkDestroyCommandPool(device, commandPool, nullptr);
    vkDestroyDevice(device, nullptr);

    if (enableValidationLayers) {
        auto func = (PFN_vkDestroyDebugUtilsMessengerEXT)
            vkGetInstanceProcAddr(instance, "vkDestroyDebugUtilsMessengerEXT");
        if (func) {
            func(instance, debugMessenger, nullptr);
        }
    }

    vkDestroySurfaceKHR(instance, surface, nullptr);
    vkDestroyInstance(instance, nullptr);

    initialized = false;
}

void VulkanRenderer::cleanupSwapChain() {
    vkDestroyImageView(device, depthImageView, nullptr);
    vkDestroyImage(device, depthImage, nullptr);
    vkFreeMemory(device, depthImageMemory, nullptr);

    for (auto framebuffer : swapChainFramebuffers) {
        vkDestroyFramebuffer(device, framebuffer, nullptr);
    }
    swapChainFramebuffers.clear();

    for (auto imageView : swapChainImageViews) {
        vkDestroyImageView(device, imageView, nullptr);
    }
    swapChainImageViews.clear();

    if (!commandBuffers.empty()) {
        vkFreeCommandBuffers(device, commandPool,
            static_cast<uint32_t>(commandBuffers.size()), commandBuffers.data());
        commandBuffers.clear();
    }
    if (shadowCommandBuffer != VK_NULL_HANDLE) {
        vkFreeCommandBuffers(device, commandPool, 1, &shadowCommandBuffer);
        shadowCommandBuffer = VK_NULL_HANDLE;
    }
    if (gbufferCommandBuffer != VK_NULL_HANDLE) {
        vkFreeCommandBuffers(device, commandPool, 1, &gbufferCommandBuffer);
        gbufferCommandBuffer = VK_NULL_HANDLE;
    }
    if (ssaoCommandBuffer != VK_NULL_HANDLE) {
        vkFreeCommandBuffers(device, commandPool, 1, &ssaoCommandBuffer);
        ssaoCommandBuffer = VK_NULL_HANDLE;
    }
    if (blurCommandBuffer != VK_NULL_HANDLE) {
        vkFreeCommandBuffers(device, commandPool, 1, &blurCommandBuffer);
        blurCommandBuffer = VK_NULL_HANDLE;
    }
    if (reflectionCommandBuffer != VK_NULL_HANDLE) {
        vkFreeCommandBuffers(device, commandPool, 1, &reflectionCommandBuffer);
        reflectionCommandBuffer = VK_NULL_HANDLE;
    }
    if (postprocessCommandBuffer != VK_NULL_HANDLE) {
        vkFreeCommandBuffers(device, commandPool, 1, &postprocessCommandBuffer);
        postprocessCommandBuffer = VK_NULL_HANDLE;
    }

    vkDestroySwapchainKHR(device, swapChain, nullptr);
    swapChain = VK_NULL_HANDLE;
}

void VulkanRenderer::resize(uint32_t w, uint32_t h) {
    if (w == width && h == height) return;
    width = w;
    height = h;

    vkDeviceWaitIdle(device);
    recreateSwapChain();
}

void VulkanRenderer::recreateSwapChain() {
    cleanupSwapChain();

    cleanupGBuffer();
    cleanupSSAO();
    cleanupReflection();
    cleanupPostprocess();

    createSwapChain();
    createImageViews();
    createDepthResources();
    createGBufferResources();
    createSSAOResources();
    createReflectionResources();
    createPostprocessFramebuffer();
    createFramebuffers();
    createCommandBuffers();
}

void VulkanRenderer::createInstance() {
    if (enableValidationLayers && !checkValidationLayerSupport()) {
        throw std::runtime_error("Validation layers requested but not available!");
    }

    VkApplicationInfo appInfo{};
    appInfo.sType = VK_STRUCTURE_TYPE_APPLICATION_INFO;
    appInfo.pApplicationName = "Voxel Engine";
    appInfo.applicationVersion = VK_MAKE_VERSION(1, 0, 0);
    appInfo.pEngineName = "VoxelEngine";
    appInfo.engineVersion = VK_MAKE_VERSION(1, 0, 0);
    appInfo.apiVersion = VK_API_VERSION_1_2;

    VkInstanceCreateInfo createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
    createInfo.pApplicationInfo = &appInfo;

    auto extensions = getRequiredExtensions();
    createInfo.enabledExtensionCount = static_cast<uint32_t>(extensions.size());
    createInfo.ppEnabledExtensionNames = extensions.data();

    VkDebugUtilsMessengerCreateInfoEXT debugCreateInfo{};
    if (enableValidationLayers) {
        createInfo.enabledLayerCount = static_cast<uint32_t>(validationLayers.size());
        createInfo.ppEnabledLayerNames = validationLayers.data();
        populateDebugMessengerCreateInfo(debugCreateInfo);
        createInfo.pNext = (VkDebugUtilsMessengerCreateInfoEXT*)&debugCreateInfo;
    } else {
        createInfo.enabledLayerCount = 0;
        createInfo.pNext = nullptr;
    }

    VkResult result = vkCreateInstance(&createInfo, nullptr, &instance);
    checkVulkanError(result, "instance creation");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create Vulkan instance!");
    }
}

void VulkanRenderer::populateDebugMessengerCreateInfo(VkDebugUtilsMessengerCreateInfoEXT& createInfo) {
    createInfo = {};
    createInfo.sType = VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT;
    createInfo.messageSeverity =
        VK_DEBUG_UTILS_MESSAGE_SEVERITY_VERBOSE_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT;
    createInfo.messageType =
        VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT;
    createInfo.pfnUserCallback = debugCallback;
}

void VulkanRenderer::setupDebugMessenger() {
    if (!enableValidationLayers) return;

    VkDebugUtilsMessengerCreateInfoEXT createInfo;
    populateDebugMessengerCreateInfo(createInfo);

    auto func = (PFN_vkCreateDebugUtilsMessengerEXT)
        vkGetInstanceProcAddr(instance, "vkCreateDebugUtilsMessengerEXT");
    if (func) {
        checkVulkanError(func(instance, &createInfo, nullptr, &debugMessenger), "debug messenger");
    }
}

void VulkanRenderer::createSurface(void* windowHandle) {
#ifdef VK_USE_PLATFORM_WIN32_KHR
    HWND hwnd = static_cast<HWND>(windowHandle);
    HINSTANCE hinstance = GetModuleHandle(nullptr);

    VkWin32SurfaceCreateInfoKHR createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_WIN32_SURFACE_CREATE_INFO_KHR;
    createInfo.hwnd = hwnd;
    createInfo.hinstance = hinstance;

    VkResult result = vkCreateWin32SurfaceKHR(instance, &createInfo, nullptr, &surface);
    checkVulkanError(result, "Win32 surface creation");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create window surface!");
    }
#else
    throw std::runtime_error("Unsupported platform!");
#endif
}

void VulkanRenderer::pickPhysicalDevice() {
    uint32_t deviceCount = 0;
    vkEnumeratePhysicalDevices(instance, &deviceCount, nullptr);

    if (deviceCount == 0) {
        throw std::runtime_error("Failed to find GPUs with Vulkan support!");
    }

    std::vector<VkPhysicalDevice> devices(deviceCount);
    vkEnumeratePhysicalDevices(instance, &deviceCount, devices.data());

    for (const auto& device : devices) {
        if (isDeviceSuitable(device)) {
            physicalDevice = device;
            break;
        }
    }

    if (physicalDevice == VK_NULL_HANDLE) {
        throw std::runtime_error("Failed to find a suitable GPU!");
    }
}

bool VulkanRenderer::isDeviceSuitable(VkPhysicalDevice device) {
    QueueFamilyIndices indices = findQueueFamilies(device);
    bool extensionsSupported = checkDeviceExtensionSupport(device);
    bool swapChainAdequate = false;

    if (extensionsSupported) {
        SwapChainSupportDetails swapChainSupport = querySwapChainSupport(device);
        swapChainAdequate = !swapChainSupport.formats.empty() && !swapChainSupport.presentModes.empty();
    }

    VkPhysicalDeviceFeatures supportedFeatures;
    vkGetPhysicalDeviceFeatures(device, &supportedFeatures);

    return indices.isComplete() && extensionsSupported && swapChainAdequate && supportedFeatures.samplerAnisotropy;
}

bool VulkanRenderer::checkDeviceExtensionSupport(VkPhysicalDevice device) {
    uint32_t extensionCount;
    vkEnumerateDeviceExtensionProperties(device, nullptr, &extensionCount, nullptr);

    std::vector<VkExtensionProperties> availableExtensions(extensionCount);
    vkEnumerateDeviceExtensionProperties(device, nullptr, &extensionCount, availableExtensions.data());

    std::set<std::string> requiredExtensions(deviceExtensions.begin(), deviceExtensions.end());

    for (const auto& extension : availableExtensions) {
        requiredExtensions.erase(extension.extensionName);
    }

    return requiredExtensions.empty();
}

QueueFamilyIndices VulkanRenderer::findQueueFamilies(VkPhysicalDevice device) {
    QueueFamilyIndices indices;

    uint32_t queueFamilyCount = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(device, &queueFamilyCount, nullptr);

    std::vector<VkQueueFamilyProperties> queueFamilies(queueFamilyCount);
    vkGetPhysicalDeviceQueueFamilyProperties(device, &queueFamilyCount, queueFamilies.data());

    int i = 0;
    for (const auto& queueFamily : queueFamilies) {
        if (queueFamily.queueFlags & VK_QUEUE_GRAPHICS_BIT) {
            indices.graphicsFamily = i;
        }

        VkBool32 presentSupport = false;
        vkGetPhysicalDeviceSurfaceSupportKHR(device, i, surface, &presentSupport);

        if (presentSupport) {
            indices.presentFamily = i;
        }

        if (indices.isComplete()) {
            break;
        }

        i++;
    }

    return indices;
}

SwapChainSupportDetails VulkanRenderer::querySwapChainSupport(VkPhysicalDevice device) {
    SwapChainSupportDetails details;

    vkGetPhysicalDeviceSurfaceCapabilitiesKHR(device, surface, &details.capabilities);

    uint32_t formatCount;
    vkGetPhysicalDeviceSurfaceFormatsKHR(device, surface, &formatCount, nullptr);

    if (formatCount != 0) {
        details.formats.resize(formatCount);
        vkGetPhysicalDeviceSurfaceFormatsKHR(device, surface, &formatCount, details.formats.data());
    }

    uint32_t presentModeCount;
    vkGetPhysicalDeviceSurfacePresentModesKHR(device, surface, &presentModeCount, nullptr);

    if (presentModeCount != 0) {
        details.presentModes.resize(presentModeCount);
        vkGetPhysicalDeviceSurfacePresentModesKHR(device, surface, &presentModeCount, details.presentModes.data());
    }

    return details;
}

void VulkanRenderer::createLogicalDevice() {
    QueueFamilyIndices indices = findQueueFamilies(physicalDevice);

    std::vector<VkDeviceQueueCreateInfo> queueCreateInfos;
    std::set<uint32_t> uniqueQueueFamilies = {
        indices.graphicsFamily.value(),
        indices.presentFamily.value()
    };

    float queuePriority = 1.0f;
    for (uint32_t queueFamily : uniqueQueueFamilies) {
        VkDeviceQueueCreateInfo queueCreateInfo{};
        queueCreateInfo.sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
        queueCreateInfo.queueFamilyIndex = queueFamily;
        queueCreateInfo.queueCount = 1;
        queueCreateInfo.pQueuePriorities = &queuePriority;
        queueCreateInfos.push_back(queueCreateInfo);
    }

    VkPhysicalDeviceFeatures deviceFeatures{};
    deviceFeatures.samplerAnisotropy = VK_TRUE;
    deviceFeatures.shaderClipDistance = VK_TRUE;

    VkDeviceCreateInfo createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
    createInfo.queueCreateInfoCount = static_cast<uint32_t>(queueCreateInfos.size());
    createInfo.pQueueCreateInfos = queueCreateInfos.data();
    createInfo.pEnabledFeatures = &deviceFeatures;

    createInfo.enabledExtensionCount = static_cast<uint32_t>(deviceExtensions.size());
    createInfo.ppEnabledExtensionNames = deviceExtensions.data();

    if (enableValidationLayers) {
        createInfo.enabledLayerCount = static_cast<uint32_t>(validationLayers.size());
        createInfo.ppEnabledLayerNames = validationLayers.data();
    } else {
        createInfo.enabledLayerCount = 0;
    }

    VkResult result = vkCreateDevice(physicalDevice, &createInfo, nullptr, &device);
    checkVulkanError(result, "logical device");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create logical device!");
    }

    vkGetDeviceQueue(device, indices.graphicsFamily.value(), 0, &graphicsQueue);
    vkGetDeviceQueue(device, indices.presentFamily.value(), 0, &presentQueue);
}

VkSurfaceFormatKHR VulkanRenderer::chooseSwapSurfaceFormat(const std::vector<VkSurfaceFormatKHR>& availableFormats) {
    for (const auto& availableFormat : availableFormats) {
        if (availableFormat.format == VK_FORMAT_B8G8R8A8_SRGB &&
            availableFormat.colorSpace == VK_COLOR_SPACE_SRGB_NONLINEAR_KHR) {
            return availableFormat;
        }
    }

    return availableFormats[0];
}

VkPresentModeKHR VulkanRenderer::chooseSwapPresentMode(const std::vector<VkPresentModeKHR>& availablePresentModes) {
    for (const auto& availablePresentMode : availablePresentModes) {
        if (availablePresentMode == VK_PRESENT_MODE_MAILBOX_KHR) {
            return availablePresentMode;
        }
    }

    return VK_PRESENT_MODE_FIFO_KHR;
}

VkExtent2D VulkanRenderer::chooseSwapExtent(const VkSurfaceCapabilitiesKHR& capabilities) {
    if (capabilities.currentExtent.width != std::numeric_limits<uint32_t>::max()) {
        return capabilities.currentExtent;
    } else {
        VkExtent2D actualExtent = { width, height };

        actualExtent.width = std::clamp(actualExtent.width,
            capabilities.minImageExtent.width, capabilities.maxImageExtent.width);
        actualExtent.height = std::clamp(actualExtent.height,
            capabilities.minImageExtent.height, capabilities.maxImageExtent.height);

        return actualExtent;
    }
}

void VulkanRenderer::createSwapChain() {
    SwapChainSupportDetails swapChainSupport = querySwapChainSupport(physicalDevice);

    VkSurfaceFormatKHR surfaceFormat = chooseSwapSurfaceFormat(swapChainSupport.formats);
    VkPresentModeKHR presentMode = chooseSwapPresentMode(swapChainSupport.presentModes);
    VkExtent2D extent = chooseSwapExtent(swapChainSupport.capabilities);

    uint32_t imageCount = swapChainSupport.capabilities.minImageCount + 1;
    if (swapChainSupport.capabilities.maxImageCount > 0 &&
        imageCount > swapChainSupport.capabilities.maxImageCount) {
        imageCount = swapChainSupport.capabilities.maxImageCount;
    }

    VkSwapchainCreateInfoKHR createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR;
    createInfo.surface = surface;
    createInfo.minImageCount = imageCount;
    createInfo.imageFormat = surfaceFormat.format;
    createInfo.imageColorSpace = surfaceFormat.colorSpace;
    createInfo.imageExtent = extent;
    createInfo.imageArrayLayers = 1;
    createInfo.imageUsage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT;

    QueueFamilyIndices indices = findQueueFamilies(physicalDevice);
    uint32_t queueFamilyIndices[] = { indices.graphicsFamily.value(), indices.presentFamily.value() };

    if (indices.graphicsFamily != indices.presentFamily) {
        createInfo.imageSharingMode = VK_SHARING_MODE_CONCURRENT;
        createInfo.queueFamilyIndexCount = 2;
        createInfo.pQueueFamilyIndices = queueFamilyIndices;
    } else {
        createInfo.imageSharingMode = VK_SHARING_MODE_EXCLUSIVE;
        createInfo.queueFamilyIndexCount = 0;
        createInfo.pQueueFamilyIndices = nullptr;
    }

    createInfo.preTransform = swapChainSupport.capabilities.currentTransform;
    createInfo.compositeAlpha = VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR;
    createInfo.presentMode = presentMode;
    createInfo.clipped = VK_TRUE;
    createInfo.oldSwapchain = VK_NULL_HANDLE;

    VkResult result = vkCreateSwapchainKHR(device, &createInfo, nullptr, &swapChain);
    checkVulkanError(result, "swapchain");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create swap chain!");
    }

    vkGetSwapchainImagesKHR(device, swapChain, &imageCount, nullptr);
    swapChainImages.resize(imageCount);
    vkGetSwapchainImagesKHR(device, swapChain, &imageCount, swapChainImages.data());

    swapChainImageFormat = surfaceFormat.format;
    swapChainExtent = extent;
}

void VulkanRenderer::createImageViews() {
    swapChainImageViews.resize(swapChainImages.size());

    for (size_t i = 0; i < swapChainImages.size(); i++) {
        swapChainImageViews[i] = createImageView(
            swapChainImages[i], swapChainImageFormat, VK_IMAGE_ASPECT_COLOR_BIT);
    }
}

VkImageView VulkanRenderer::createImageView(VkImage image, VkFormat format, VkImageAspectFlags aspectFlags) {
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
    checkVulkanError(result, "image view");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create image views!");
    }

    return imageView;
}

void VulkanRenderer::createRenderPass() {
    VkAttachmentDescription colorAttachment{};
    colorAttachment.format = swapChainImageFormat;
    colorAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    colorAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    colorAttachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    colorAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    colorAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    colorAttachment.finalLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;

    VkAttachmentDescription depthAttachment{};
    depthAttachment.format = findDepthFormat();
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
    dependency.srcStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT | VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;
    dependency.srcAccessMask = 0;
    dependency.dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT | VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;
    dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT | VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;

    std::array<VkAttachmentDescription, 2> attachments = { colorAttachment, depthAttachment };
    VkRenderPassCreateInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    renderPassInfo.attachmentCount = static_cast<uint32_t>(attachments.size());
    renderPassInfo.pAttachments = attachments.data();
    renderPassInfo.subpassCount = 1;
    renderPassInfo.pSubpasses = &subpass;
    renderPassInfo.dependencyCount = 1;
    renderPassInfo.pDependencies = &dependency;

    VkResult result = vkCreateRenderPass(device, &renderPassInfo, nullptr, &renderPass);
    checkVulkanError(result, "render pass");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create render pass!");
    }
}

void VulkanRenderer::createShadowRenderPass() {
    VkAttachmentDescription depthAttachment{};
    depthAttachment.format = findDepthFormat();
    depthAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    depthAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    depthAttachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    depthAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    depthAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    depthAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    depthAttachment.finalLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_READ_ONLY_OPTIMAL;

    VkAttachmentReference depthAttachmentRef{};
    depthAttachmentRef.attachment = 0;
    depthAttachmentRef.layout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;

    VkSubpassDescription subpass{};
    subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 0;
    subpass.pDepthStencilAttachment = &depthAttachmentRef;

    VkSubpassDependency dependency{};
    dependency.srcSubpass = VK_SUBPASS_EXTERNAL;
    dependency.dstSubpass = 0;
    dependency.srcStageMask = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
    dependency.srcAccessMask = VK_ACCESS_SHADER_READ_BIT;
    dependency.dstStageMask = VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;
    dependency.dstAccessMask = VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
    dependency.dependencyFlags = VK_DEPENDENCY_BY_REGION_BIT;

    VkRenderPassCreateInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    renderPassInfo.attachmentCount = 1;
    renderPassInfo.pAttachments = &depthAttachment;
    renderPassInfo.subpassCount = 1;
    renderPassInfo.pSubpasses = &subpass;
    renderPassInfo.dependencyCount = 1;
    renderPassInfo.pDependencies = &dependency;

    VkResult result = vkCreateRenderPass(device, &renderPassInfo, nullptr, &shadowRenderPass);
    checkVulkanError(result, "shadow render pass");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create shadow render pass!");
    }
}

void VulkanRenderer::createDescriptorSetLayout() {
    VkDescriptorSetLayoutBinding cameraBinding{};
    cameraBinding.binding = 0;
    cameraBinding.descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
    cameraBinding.descriptorCount = 1;
    cameraBinding.stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
    cameraBinding.pImmutableSamplers = nullptr;

    VkDescriptorSetLayoutBinding lightBinding{};
    lightBinding.binding = 1;
    lightBinding.descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
    lightBinding.descriptorCount = 1;
    lightBinding.stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
    lightBinding.pImmutableSamplers = nullptr;

    VkDescriptorSetLayoutBinding shadowSamplerBinding{};
    shadowSamplerBinding.binding = 2;
    shadowSamplerBinding.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
    shadowSamplerBinding.descriptorCount = 1;
    shadowSamplerBinding.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
    shadowSamplerBinding.pImmutableSamplers = nullptr;

    std::array<VkDescriptorSetLayoutBinding, 3> bindings = { cameraBinding, lightBinding, shadowSamplerBinding };

    VkDescriptorSetLayoutCreateInfo layoutInfo{};
    layoutInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
    layoutInfo.bindingCount = static_cast<uint32_t>(bindings.size());
    layoutInfo.pBindings = bindings.data();

    VkResult result = vkCreateDescriptorSetLayout(device, &layoutInfo, nullptr, &descriptorSetLayout);
    checkVulkanError(result, "descriptor set layout");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create descriptor set layout!");
    }

    {
        VkDescriptorSetLayoutBinding gbufferCameraBinding{};
        gbufferCameraBinding.binding = 0;
        gbufferCameraBinding.descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        gbufferCameraBinding.descriptorCount = 1;
        gbufferCameraBinding.stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
        gbufferCameraBinding.pImmutableSamplers = nullptr;

        VkDescriptorSetLayoutBinding gbufferLightBinding{};
        gbufferLightBinding.binding = 1;
        gbufferLightBinding.descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        gbufferLightBinding.descriptorCount = 1;
        gbufferLightBinding.stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
        gbufferLightBinding.pImmutableSamplers = nullptr;

        std::array<VkDescriptorSetLayoutBinding, 2> gbufferBindings = { gbufferCameraBinding, gbufferLightBinding };

        VkDescriptorSetLayoutCreateInfo gbufferLayoutInfo{};
        gbufferLayoutInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
        gbufferLayoutInfo.bindingCount = static_cast<uint32_t>(gbufferBindings.size());
        gbufferLayoutInfo.pBindings = gbufferBindings.data();

        result = vkCreateDescriptorSetLayout(device, &gbufferLayoutInfo, nullptr, &gbufferDescriptorSetLayout);
        checkVulkanError(result, "gbuffer descriptor set layout");
        if (result != VK_SUCCESS) {
            throw std::runtime_error("Failed to create gbuffer descriptor set layout!");
        }
    }

    {
        VkDescriptorSetLayoutBinding positionTexBinding{};
        positionTexBinding.binding = 0;
        positionTexBinding.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        positionTexBinding.descriptorCount = 1;
        positionTexBinding.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
        positionTexBinding.pImmutableSamplers = nullptr;

        VkDescriptorSetLayoutBinding normalTexBinding{};
        normalTexBinding.binding = 1;
        normalTexBinding.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        normalTexBinding.descriptorCount = 1;
        normalTexBinding.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
        normalTexBinding.pImmutableSamplers = nullptr;

        VkDescriptorSetLayoutBinding noiseTexBinding{};
        noiseTexBinding.binding = 2;
        noiseTexBinding.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        noiseTexBinding.descriptorCount = 1;
        noiseTexBinding.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
        noiseTexBinding.pImmutableSamplers = nullptr;

        VkDescriptorSetLayoutBinding ssaoCameraBinding{};
        ssaoCameraBinding.binding = 3;
        ssaoCameraBinding.descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        ssaoCameraBinding.descriptorCount = 1;
        ssaoCameraBinding.stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
        ssaoCameraBinding.pImmutableSamplers = nullptr;

        VkDescriptorSetLayoutBinding kernelUBOBinding{};
        kernelUBOBinding.binding = 4;
        kernelUBOBinding.descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        kernelUBOBinding.descriptorCount = 1;
        kernelUBOBinding.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
        kernelUBOBinding.pImmutableSamplers = nullptr;

        std::array<VkDescriptorSetLayoutBinding, 5> ssaoBindings = {
            positionTexBinding, normalTexBinding, noiseTexBinding,
            ssaoCameraBinding, kernelUBOBinding
        };

        VkDescriptorSetLayoutCreateInfo ssaoLayoutInfo{};
        ssaoLayoutInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
        ssaoLayoutInfo.bindingCount = static_cast<uint32_t>(ssaoBindings.size());
        ssaoLayoutInfo.pBindings = ssaoBindings.data();

        result = vkCreateDescriptorSetLayout(device, &ssaoLayoutInfo, nullptr, &ssaoDescriptorSetLayout);
        checkVulkanError(result, "ssao descriptor set layout");
        if (result != VK_SUCCESS) {
            throw std::runtime_error("Failed to create ssao descriptor set layout!");
        }
    }

    {
        std::array<VkDescriptorSetLayoutBinding, 8> postprocessBindings{};

        for (int i = 0; i < 6; i++) {
            postprocessBindings[i].binding = i;
            postprocessBindings[i].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
            postprocessBindings[i].descriptorCount = 1;
            postprocessBindings[i].stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
            postprocessBindings[i].pImmutableSamplers = nullptr;
        }

        postprocessBindings[6].binding = 6;
        postprocessBindings[6].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        postprocessBindings[6].descriptorCount = 1;
        postprocessBindings[6].stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
        postprocessBindings[6].pImmutableSamplers = nullptr;

        postprocessBindings[7].binding = 7;
        postprocessBindings[7].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        postprocessBindings[7].descriptorCount = 1;
        postprocessBindings[7].stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
        postprocessBindings[7].pImmutableSamplers = nullptr;

        VkDescriptorSetLayoutCreateInfo postprocessLayoutInfo{};
        postprocessLayoutInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
        postprocessLayoutInfo.bindingCount = static_cast<uint32_t>(postprocessBindings.size());
        postprocessLayoutInfo.pBindings = postprocessBindings.data();

        result = vkCreateDescriptorSetLayout(device, &postprocessLayoutInfo, nullptr, &postprocessDescriptorSetLayout);
        checkVulkanError(result, "postprocess descriptor set layout");
        if (result != VK_SUCCESS) {
            throw std::runtime_error("Failed to create postprocess descriptor set layout!");
        }
    }

    {
        VkDescriptorSetLayoutBinding ssaoImageBinding{};
        ssaoImageBinding.binding = 0;
        ssaoImageBinding.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        ssaoImageBinding.descriptorCount = 1;
        ssaoImageBinding.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
        ssaoImageBinding.pImmutableSamplers = nullptr;

        VkDescriptorSetLayoutBinding normalImageBinding{};
        normalImageBinding.binding = 1;
        normalImageBinding.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        normalImageBinding.descriptorCount = 1;
        normalImageBinding.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
        normalImageBinding.pImmutableSamplers = nullptr;

        std::array<VkDescriptorSetLayoutBinding, 2> blurBindings = { ssaoImageBinding, normalImageBinding };

        VkDescriptorSetLayoutCreateInfo blurLayoutInfo{};
        blurLayoutInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
        blurLayoutInfo.bindingCount = static_cast<uint32_t>(blurBindings.size());
        blurLayoutInfo.pBindings = blurBindings.data();

        result = vkCreateDescriptorSetLayout(device, &blurLayoutInfo, nullptr, &blurDescriptorSetLayout);
        checkVulkanError(result, "blur descriptor set layout");
        if (result != VK_SUCCESS) {
            throw std::runtime_error("Failed to create blur descriptor set layout!");
        }
    }
}

std::vector<char> VulkanRenderer::readFile(const std::string& filename) {
    std::ifstream file(filename, std::ios::ate | std::ios::binary);

    if (!file.is_open()) {
        std::cerr << "Warning: Could not open shader file: " << filename << std::endl;
        return std::vector<char>();
    }

    size_t fileSize = (size_t)file.tellg();
    std::vector<char> buffer(fileSize);
    file.seekg(0);
    file.read(buffer.data(), fileSize);
    file.close();

    return buffer;
}

VkShaderModule VulkanRenderer::createShaderModule(const std::vector<char>& code) {
    if (code.empty()) return VK_NULL_HANDLE;

    VkShaderModuleCreateInfo createInfo{};
    createInfo.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
    createInfo.codeSize = code.size();
    createInfo.pCode = reinterpret_cast<const uint32_t*>(code.data());

    VkShaderModule shaderModule;
    VkResult result = vkCreateShaderModule(device, &createInfo, nullptr, &shaderModule);
    checkVulkanError(result, "shader module");

    return shaderModule;
}

void VulkanRenderer::createGraphicsPipeline() {
    auto vertShaderCode = readFile("shaders/voxel.vert.spv");
    auto fragShaderCode = readFile("shaders/voxel.frag.spv");

    VkShaderModule vertShaderModule = createShaderModule(vertShaderCode);
    VkShaderModule fragShaderModule = createShaderModule(fragShaderCode);

    VkPipelineShaderStageCreateInfo vertShaderStageInfo{};
    vertShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    vertShaderStageInfo.stage = VK_SHADER_STAGE_VERTEX_BIT;
    vertShaderStageInfo.module = vertShaderModule;
    vertShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo fragShaderStageInfo{};
    fragShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    fragShaderStageInfo.stage = VK_SHADER_STAGE_FRAGMENT_BIT;
    fragShaderStageInfo.module = fragShaderModule;
    fragShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo shaderStages[] = { vertShaderStageInfo, fragShaderStageInfo };

    VkVertexInputBindingDescription bindingDescription{};
    bindingDescription.binding = 0;
    bindingDescription.stride = sizeof(Vertex);
    bindingDescription.inputRate = VK_VERTEX_INPUT_RATE_VERTEX;

    std::array<VkVertexInputAttributeDescription, 4> attributeDescriptions{};
    attributeDescriptions[0].binding = 0;
    attributeDescriptions[0].location = 0;
    attributeDescriptions[0].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[0].offset = offsetof(Vertex, position);

    attributeDescriptions[1].binding = 0;
    attributeDescriptions[1].location = 1;
    attributeDescriptions[1].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[1].offset = offsetof(Vertex, normal);

    attributeDescriptions[2].binding = 0;
    attributeDescriptions[2].location = 2;
    attributeDescriptions[2].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[2].offset = offsetof(Vertex, color);

    attributeDescriptions[3].binding = 0;
    attributeDescriptions[3].location = 3;
    attributeDescriptions[3].format = VK_FORMAT_R32G32_SFLOAT;
    attributeDescriptions[3].offset = offsetof(Vertex, uv);

    VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
    vertexInputInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
    vertexInputInfo.vertexBindingDescriptionCount = 1;
    vertexInputInfo.pVertexBindingDescriptions = &bindingDescription;
    vertexInputInfo.vertexAttributeDescriptionCount = static_cast<uint32_t>(attributeDescriptions.size());
    vertexInputInfo.pVertexAttributeDescriptions = attributeDescriptions.data();

    VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
    inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
    inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    inputAssembly.primitiveRestartEnable = VK_FALSE;

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = (float)swapChainExtent.width;
    viewport.height = (float)swapChainExtent.height;
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;

    VkRect2D scissor{};
    scissor.offset = { 0, 0 };
    scissor.extent = swapChainExtent;

    VkPipelineViewportStateCreateInfo viewportState{};
    viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
    viewportState.viewportCount = 1;
    viewportState.pViewports = &viewport;
    viewportState.scissorCount = 1;
    viewportState.pScissors = &scissor;

    VkPipelineRasterizationStateCreateInfo rasterizer{};
    rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
    rasterizer.depthClampEnable = VK_FALSE;
    rasterizer.rasterizerDiscardEnable = VK_FALSE;
    rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
    rasterizer.lineWidth = 1.0f;
    rasterizer.cullMode = VK_CULL_MODE_BACK_BIT;
    rasterizer.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    rasterizer.depthBiasEnable = VK_FALSE;

    VkPipelineMultisampleStateCreateInfo multisampling{};
    multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
    multisampling.sampleShadingEnable = VK_FALSE;
    multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

    VkPipelineDepthStencilStateCreateInfo depthStencil{};
    depthStencil.sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
    depthStencil.depthTestEnable = VK_TRUE;
    depthStencil.depthWriteEnable = VK_TRUE;
    depthStencil.depthCompareOp = VK_COMPARE_OP_LESS;
    depthStencil.depthBoundsTestEnable = VK_FALSE;
    depthStencil.stencilTestEnable = VK_FALSE;

    VkPipelineColorBlendAttachmentState colorBlendAttachment{};
    colorBlendAttachment.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
        VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
    colorBlendAttachment.blendEnable = VK_FALSE;

    VkPipelineColorBlendStateCreateInfo colorBlending{};
    colorBlending.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
    colorBlending.logicOpEnable = VK_FALSE;
    colorBlending.attachmentCount = 1;
    colorBlending.pAttachments = &colorBlendAttachment;

    VkPushConstantRange pushConstantRange{};
    pushConstantRange.stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
    pushConstantRange.offset = 0;
    pushConstantRange.size = sizeof(PushConstants);

    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &descriptorSetLayout;
    pipelineLayoutInfo.pushConstantRangeCount = 1;
    pipelineLayoutInfo.pPushConstantRanges = &pushConstantRange;

    VkResult result = vkCreatePipelineLayout(device, &pipelineLayoutInfo, nullptr, &pipelineLayout);
    checkVulkanError(result, "pipeline layout");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create pipeline layout!");
    }

    VkGraphicsPipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
    pipelineInfo.stageCount = 2;
    pipelineInfo.pStages = shaderStages;
    pipelineInfo.pVertexInputState = &vertexInputInfo;
    pipelineInfo.pInputAssemblyState = &inputAssembly;
    pipelineInfo.pViewportState = &viewportState;
    pipelineInfo.pRasterizationState = &rasterizer;
    pipelineInfo.pMultisampleState = &multisampling;
    pipelineInfo.pDepthStencilState = &depthStencil;
    pipelineInfo.pColorBlendState = &colorBlending;
    pipelineInfo.layout = pipelineLayout;
    pipelineInfo.renderPass = renderPass;
    pipelineInfo.subpass = 0;
    pipelineInfo.basePipelineHandle = VK_NULL_HANDLE;

    result = vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &graphicsPipeline);
    checkVulkanError(result, "graphics pipeline");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create graphics pipeline!");
    }

    if (vertShaderModule) vkDestroyShaderModule(device, vertShaderModule, nullptr);
    if (fragShaderModule) vkDestroyShaderModule(device, fragShaderModule, nullptr);
}

void VulkanRenderer::createShadowPipeline() {
    auto vertShaderCode = readFile("shaders/shadow.vert.spv");
    auto fragShaderCode = readFile("shaders/shadow.frag.spv");

    VkShaderModule vertShaderModule = createShaderModule(vertShaderCode);
    VkShaderModule fragShaderModule = createShaderModule(fragShaderCode);

    VkPipelineShaderStageCreateInfo vertShaderStageInfo{};
    vertShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    vertShaderStageInfo.stage = VK_SHADER_STAGE_VERTEX_BIT;
    vertShaderStageInfo.module = vertShaderModule;
    vertShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo fragShaderStageInfo{};
    fragShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    fragShaderStageInfo.stage = VK_SHADER_STAGE_FRAGMENT_BIT;
    fragShaderStageInfo.module = fragShaderModule;
    fragShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo shaderStages[] = { vertShaderStageInfo, fragShaderStageInfo };

    VkVertexInputBindingDescription bindingDescription{};
    bindingDescription.binding = 0;
    bindingDescription.stride = sizeof(Vertex);
    bindingDescription.inputRate = VK_VERTEX_INPUT_RATE_VERTEX;

    std::array<VkVertexInputAttributeDescription, 4> attributeDescriptions{};
    attributeDescriptions[0].binding = 0;
    attributeDescriptions[0].location = 0;
    attributeDescriptions[0].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[0].offset = offsetof(Vertex, position);

    attributeDescriptions[1].binding = 0;
    attributeDescriptions[1].location = 1;
    attributeDescriptions[1].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[1].offset = offsetof(Vertex, normal);

    attributeDescriptions[2].binding = 0;
    attributeDescriptions[2].location = 2;
    attributeDescriptions[2].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[2].offset = offsetof(Vertex, color);

    attributeDescriptions[3].binding = 0;
    attributeDescriptions[3].location = 3;
    attributeDescriptions[3].format = VK_FORMAT_R32G32_SFLOAT;
    attributeDescriptions[3].offset = offsetof(Vertex, uv);

    VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
    vertexInputInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
    vertexInputInfo.vertexBindingDescriptionCount = 1;
    vertexInputInfo.pVertexBindingDescriptions = &bindingDescription;
    vertexInputInfo.vertexAttributeDescriptionCount = static_cast<uint32_t>(attributeDescriptions.size());
    vertexInputInfo.pVertexAttributeDescriptions = attributeDescriptions.data();

    VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
    inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
    inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    inputAssembly.primitiveRestartEnable = VK_FALSE;

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = (float)SHADOW_MAP_SIZE;
    viewport.height = (float)SHADOW_MAP_SIZE;
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;

    VkRect2D scissor{};
    scissor.offset = { 0, 0 };
    scissor.extent.width = SHADOW_MAP_SIZE;
    scissor.extent.height = SHADOW_MAP_SIZE;

    VkPipelineViewportStateCreateInfo viewportState{};
    viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
    viewportState.viewportCount = 1;
    viewportState.pViewports = &viewport;
    viewportState.scissorCount = 1;
    viewportState.pScissors = &scissor;

    VkPipelineRasterizationStateCreateInfo rasterizer{};
    rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
    rasterizer.depthClampEnable = VK_TRUE;
    rasterizer.rasterizerDiscardEnable = VK_FALSE;
    rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
    rasterizer.lineWidth = 1.0f;
    rasterizer.cullMode = VK_CULL_MODE_BACK_BIT;
    rasterizer.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    rasterizer.depthBiasEnable = VK_TRUE;
    rasterizer.depthBiasConstantFactor = 4.0f;
    rasterizer.depthBiasClamp = 0.0f;
    rasterizer.depthBiasSlopeFactor = 1.5f;

    VkPipelineMultisampleStateCreateInfo multisampling{};
    multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
    multisampling.sampleShadingEnable = VK_FALSE;
    multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

    VkPipelineDepthStencilStateCreateInfo depthStencil{};
    depthStencil.sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
    depthStencil.depthTestEnable = VK_TRUE;
    depthStencil.depthWriteEnable = VK_TRUE;
    depthStencil.depthCompareOp = VK_COMPARE_OP_LESS_OR_EQUAL;
    depthStencil.depthBoundsTestEnable = VK_FALSE;
    depthStencil.stencilTestEnable = VK_FALSE;

    VkPipelineColorBlendAttachmentState colorBlendAttachment{};
    colorBlendAttachment.colorWriteMask = 0;

    VkPipelineColorBlendStateCreateInfo colorBlending{};
    colorBlending.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
    colorBlending.logicOpEnable = VK_FALSE;
    colorBlending.attachmentCount = 1;
    colorBlending.pAttachments = &colorBlendAttachment;

    VkPushConstantRange pushConstantRange{};
    pushConstantRange.stageFlags = VK_SHADER_STAGE_VERTEX_BIT;
    pushConstantRange.offset = 0;
    pushConstantRange.size = sizeof(PushConstants);

    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &descriptorSetLayout;
    pipelineLayoutInfo.pushConstantRangeCount = 1;
    pipelineLayoutInfo.pPushConstantRanges = &pushConstantRange;

    VkPipelineLayout shadowPipelineLayout;
    VkResult result = vkCreatePipelineLayout(device, &pipelineLayoutInfo, nullptr, &shadowPipelineLayout);
    checkVulkanError(result, "shadow pipeline layout");

    VkGraphicsPipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
    pipelineInfo.stageCount = 2;
    pipelineInfo.pStages = shaderStages;
    pipelineInfo.pVertexInputState = &vertexInputInfo;
    pipelineInfo.pInputAssemblyState = &inputAssembly;
    pipelineInfo.pViewportState = &viewportState;
    pipelineInfo.pRasterizationState = &rasterizer;
    pipelineInfo.pMultisampleState = &multisampling;
    pipelineInfo.pDepthStencilState = &depthStencil;
    pipelineInfo.pColorBlendState = &colorBlending;
    pipelineInfo.layout = shadowPipelineLayout;
    pipelineInfo.renderPass = shadowRenderPass;
    pipelineInfo.subpass = 0;
    pipelineInfo.basePipelineHandle = VK_NULL_HANDLE;

    result = vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &shadowPipeline);
    checkVulkanError(result, "shadow pipeline");

    vkDestroyPipelineLayout(device, shadowPipelineLayout, nullptr);

    if (vertShaderModule) vkDestroyShaderModule(device, vertShaderModule, nullptr);
    if (fragShaderModule) vkDestroyShaderModule(device, fragShaderModule, nullptr);
}

void VulkanRenderer::createFramebuffers() {
    swapChainFramebuffers.resize(swapChainImageViews.size());

    for (size_t i = 0; i < swapChainImageViews.size(); i++) {
        std::array<VkImageView, 2> attachments = {
            swapChainImageViews[i],
            depthImageView
        };

        VkFramebufferCreateInfo framebufferInfo{};
        framebufferInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
        framebufferInfo.renderPass = renderPass;
        framebufferInfo.attachmentCount = static_cast<uint32_t>(attachments.size());
        framebufferInfo.pAttachments = attachments.data();
        framebufferInfo.width = swapChainExtent.width;
        framebufferInfo.height = swapChainExtent.height;
        framebufferInfo.layers = 1;

        VkResult result = vkCreateFramebuffer(device, &framebufferInfo, nullptr, &swapChainFramebuffers[i]);
        checkVulkanError(result, "framebuffer");
        if (result != VK_SUCCESS) {
            throw std::runtime_error("Failed to create framebuffer!");
        }
    }
}

void VulkanRenderer::createShadowFramebuffer() {
    VkFramebufferCreateInfo framebufferInfo{};
    framebufferInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
    framebufferInfo.renderPass = shadowRenderPass;
    framebufferInfo.attachmentCount = 1;
    framebufferInfo.pAttachments = &shadowImageView;
    framebufferInfo.width = SHADOW_MAP_SIZE;
    framebufferInfo.height = SHADOW_MAP_SIZE;
    framebufferInfo.layers = 1;

    VkResult result = vkCreateFramebuffer(device, &framebufferInfo, nullptr, &shadowFramebuffer);
    checkVulkanError(result, "shadow framebuffer");
}

void VulkanRenderer::createCommandPool() {
    QueueFamilyIndices queueFamilyIndices = findQueueFamilies(physicalDevice);

    VkCommandPoolCreateInfo poolInfo{};
    poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
    poolInfo.queueFamilyIndex = queueFamilyIndices.graphicsFamily.value();
    poolInfo.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;

    VkResult result = vkCreateCommandPool(device, &poolInfo, nullptr, &commandPool);
    checkVulkanError(result, "command pool");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create command pool!");
    }
}

uint32_t VulkanRenderer::findMemoryType(uint32_t typeFilter, VkMemoryPropertyFlags properties) {
    VkPhysicalDeviceMemoryProperties memProperties;
    vkGetPhysicalDeviceMemoryProperties(physicalDevice, &memProperties);

    for (uint32_t i = 0; i < memProperties.memoryTypeCount; i++) {
        if ((typeFilter & (1 << i)) &&
            (memProperties.memoryTypes[i].propertyFlags & properties) == properties) {
            return i;
        }
    }

    throw std::runtime_error("Failed to find suitable memory type!");
}

void VulkanRenderer::createBuffer(VkDeviceSize size, VkBufferUsageFlags usage, VkMemoryPropertyFlags properties,
                                   VkBuffer& buffer, VkDeviceMemory& bufferMemory) {
    VkBufferCreateInfo bufferInfo{};
    bufferInfo.sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
    bufferInfo.size = size;
    bufferInfo.usage = usage;
    bufferInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;

    VkResult result = vkCreateBuffer(device, &bufferInfo, nullptr, &buffer);
    checkVulkanError(result, "buffer creation");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create buffer!");
    }

    VkMemoryRequirements memRequirements;
    vkGetBufferMemoryRequirements(device, buffer, &memRequirements);

    VkMemoryAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    allocInfo.allocationSize = memRequirements.size;
    allocInfo.memoryTypeIndex = findMemoryType(memRequirements.memoryTypeBits, properties);

    result = vkAllocateMemory(device, &allocInfo, nullptr, &bufferMemory);
    checkVulkanError(result, "buffer memory");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate buffer memory!");
    }

    vkBindBufferMemory(device, buffer, bufferMemory, 0);
}

void VulkanRenderer::copyBuffer(VkBuffer srcBuffer, VkBuffer dstBuffer, VkDeviceSize size) {
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

    VkBufferCopy copyRegion{};
    copyRegion.size = size;
    vkCmdCopyBuffer(commandBuffer, srcBuffer, dstBuffer, 1, &copyRegion);

    vkEndCommandBuffer(commandBuffer);

    VkSubmitInfo submitInfo{};
    submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    submitInfo.commandBufferCount = 1;
    submitInfo.pCommandBuffers = &commandBuffer;

    vkQueueSubmit(graphicsQueue, 1, &submitInfo, VK_NULL_HANDLE);
    vkQueueWaitIdle(graphicsQueue);

    vkFreeCommandBuffers(device, commandPool, 1, &commandBuffer);
}

void VulkanRenderer::createImage(uint32_t width, uint32_t height, VkFormat format, VkImageTiling tiling,
                                 VkImageUsageFlags usage, VkMemoryPropertyFlags properties, VkImage& image, VkDeviceMemory& imageMemory) {
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

    VkResult result = vkCreateImage(device, &imageInfo, nullptr, &image);
    checkVulkanError(result, "image creation");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create image!");
    }

    VkMemoryRequirements memRequirements;
    vkGetImageMemoryRequirements(device, image, &memRequirements);

    VkMemoryAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    allocInfo.allocationSize = memRequirements.size;
    allocInfo.memoryTypeIndex = findMemoryType(memRequirements.memoryTypeBits, properties);

    result = vkAllocateMemory(device, &allocInfo, nullptr, &imageMemory);
    checkVulkanError(result, "image memory");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate image memory!");
    }

    vkBindImageMemory(device, image, imageMemory, 0);
}

VkFormat VulkanRenderer::findSupportedFormat(const std::vector<VkFormat>& candidates, VkImageTiling tiling, VkFormatFeatureFlags features) {
    for (VkFormat format : candidates) {
        VkFormatProperties props;
        vkGetPhysicalDeviceFormatProperties(physicalDevice, format, &props);

        if (tiling == VK_IMAGE_TILING_LINEAR && (props.linearTilingFeatures & features) == features) {
            return format;
        } else if (tiling == VK_IMAGE_TILING_OPTIMAL && (props.optimalTilingFeatures & features) == features) {
            return format;
        }
    }

    throw std::runtime_error("Failed to find supported format!");
}

VkFormat VulkanRenderer::findDepthFormat() {
    return findSupportedFormat(
        { VK_FORMAT_D32_SFLOAT, VK_FORMAT_D32_SFLOAT_S8_UINT, VK_FORMAT_D24_UNORM_S8_UINT },
        VK_IMAGE_TILING_OPTIMAL,
        VK_FORMAT_FEATURE_DEPTH_STENCIL_ATTACHMENT_BIT
    );
}

bool VulkanRenderer::hasStencilComponent(VkFormat format) {
    return format == VK_FORMAT_D32_SFLOAT_S8_UINT || format == VK_FORMAT_D24_UNORM_S8_UINT;
}

void VulkanRenderer::transitionImageLayout(VkImage image, VkFormat format, VkImageLayout oldLayout, VkImageLayout newLayout) {
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

    VkImageMemoryBarrier barrier{};
    barrier.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
    barrier.oldLayout = oldLayout;
    barrier.newLayout = newLayout;
    barrier.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    barrier.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    barrier.image = image;
    barrier.subresourceRange.aspectMask = VK_IMAGE_ASPECT_DEPTH_BIT;
    barrier.subresourceRange.baseMipLevel = 0;
    barrier.subresourceRange.levelCount = 1;
    barrier.subresourceRange.baseArrayLayer = 0;
    barrier.subresourceRange.layerCount = 1;

    if (newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL) {
        barrier.subresourceRange.aspectMask = VK_IMAGE_ASPECT_DEPTH_BIT;
        if (hasStencilComponent(format)) {
            barrier.subresourceRange.aspectMask |= VK_IMAGE_ASPECT_STENCIL_BIT;
        }
    }

    if (oldLayout == VK_IMAGE_LAYOUT_UNDEFINED && newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL) {
        barrier.srcAccessMask = 0;
        barrier.dstAccessMask = VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_READ_BIT | VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
    } else if (oldLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL && newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_READ_ONLY_OPTIMAL) {
        barrier.srcAccessMask = VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
        barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
    } else {
        barrier.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        barrier.dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
    }

    vkCmdPipelineBarrier(
        commandBuffer,
        VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,
        0,
        0, nullptr,
        0, nullptr,
        1, &barrier
    );

    vkEndCommandBuffer(commandBuffer);

    VkSubmitInfo submitInfo{};
    submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    submitInfo.commandBufferCount = 1;
    submitInfo.pCommandBuffers = &commandBuffer;

    vkQueueSubmit(graphicsQueue, 1, &submitInfo, VK_NULL_HANDLE);
    vkQueueWaitIdle(graphicsQueue);

    vkFreeCommandBuffers(device, commandPool, 1, &commandBuffer);
}

void VulkanRenderer::createDepthResources() {
    VkFormat depthFormat = findDepthFormat();

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        depthFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        depthImage, depthImageMemory
    );

    depthImageView = createImageView(depthImage, depthFormat, VK_IMAGE_ASPECT_DEPTH_BIT);
}

void VulkanRenderer::createShadowResources() {
    VkFormat depthFormat = findDepthFormat();

    createImage(
        SHADOW_MAP_SIZE, SHADOW_MAP_SIZE,
        depthFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        shadowImage, shadowImageMemory
    );

    shadowImageView = createImageView(shadowImage, depthFormat, VK_IMAGE_ASPECT_DEPTH_BIT);
    transitionImageLayout(shadowImage, depthFormat, VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_DEPTH_STENCIL_READ_ONLY_OPTIMAL);
}

void VulkanRenderer::createUniformBuffers() {
    VkDeviceSize cameraBufferSize = sizeof(CameraUniforms);
    VkDeviceSize lightBufferSize = sizeof(LightUniforms);

    for (size_t i = 0; i < perFrame.size(); i++) {
        createBuffer(cameraBufferSize, VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT,
            VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
            perFrame[i].cameraUniformBuffer, perFrame[i].cameraUniformMemory);

        createBuffer(lightBufferSize, VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT,
            VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
            perFrame[i].lightUniformBuffer, perFrame[i].lightUniformMemory);
    }
}

void VulkanRenderer::createDescriptorPool() {
    std::array<VkDescriptorPoolSize, 2> poolSizes{};
    poolSizes[0].type = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
    poolSizes[0].descriptorCount = static_cast<uint32_t>(perFrame.size() * 5);
    poolSizes[1].type = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
    poolSizes[1].descriptorCount = static_cast<uint32_t>(perFrame.size() * 12);

    VkDescriptorPoolCreateInfo poolInfo{};
    poolInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;
    poolInfo.poolSizeCount = static_cast<uint32_t>(poolSizes.size());
    poolInfo.pPoolSizes = poolSizes.data();
    poolInfo.maxSets = static_cast<uint32_t>(perFrame.size() * 5);

    VkResult result = vkCreateDescriptorPool(device, &poolInfo, nullptr, &descriptorPool);
    checkVulkanError(result, "descriptor pool");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create descriptor pool!");
    }
}

void VulkanRenderer::createDescriptorSets() {
    std::vector<VkDescriptorSetLayout> layouts(perFrame.size(), descriptorSetLayout);

    VkDescriptorSetAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
    allocInfo.descriptorPool = descriptorPool;
    allocInfo.descriptorSetCount = static_cast<uint32_t>(perFrame.size());
    allocInfo.pSetLayouts = layouts.data();

    std::vector<VkDescriptorSet> sets(perFrame.size());
    VkResult result = vkAllocateDescriptorSets(device, &allocInfo, sets.data());
    checkVulkanError(result, "descriptor sets");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate descriptor sets!");
    }

    std::vector<VkDescriptorSetLayout> ssaoLayouts(perFrame.size(), ssaoDescriptorSetLayout);
    VkDescriptorSetAllocateInfo ssaoAllocInfo{};
    ssaoAllocInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
    ssaoAllocInfo.descriptorPool = descriptorPool;
    ssaoAllocInfo.descriptorSetCount = static_cast<uint32_t>(perFrame.size());
    ssaoAllocInfo.pSetLayouts = ssaoLayouts.data();

    std::vector<VkDescriptorSet> ssaoSets(perFrame.size());
    result = vkAllocateDescriptorSets(device, &ssaoAllocInfo, ssaoSets.data());
    checkVulkanError(result, "ssao descriptor sets");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate ssao descriptor sets!");
    }

    std::vector<VkDescriptorSetLayout> blurLayouts(perFrame.size(), blurDescriptorSetLayout);
    VkDescriptorSetAllocateInfo blurAllocInfo{};
    blurAllocInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
    blurAllocInfo.descriptorPool = descriptorPool;
    blurAllocInfo.descriptorSetCount = static_cast<uint32_t>(perFrame.size());
    blurAllocInfo.pSetLayouts = blurLayouts.data();

    std::vector<VkDescriptorSet> blurSets(perFrame.size());
    result = vkAllocateDescriptorSets(device, &blurAllocInfo, blurSets.data());
    checkVulkanError(result, "blur descriptor sets");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate blur descriptor sets!");
    }

    std::vector<VkDescriptorSetLayout> postprocessLayouts(perFrame.size(), postprocessDescriptorSetLayout);
    VkDescriptorSetAllocateInfo postprocessAllocInfo{};
    postprocessAllocInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
    postprocessAllocInfo.descriptorPool = descriptorPool;
    postprocessAllocInfo.descriptorSetCount = static_cast<uint32_t>(perFrame.size());
    postprocessAllocInfo.pSetLayouts = postprocessLayouts.data();

    std::vector<VkDescriptorSet> postprocessSets(perFrame.size());
    result = vkAllocateDescriptorSets(device, &postprocessAllocInfo, postprocessSets.data());
    checkVulkanError(result, "postprocess descriptor sets");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate postprocess descriptor sets!");
    }

    VkSamplerCreateInfo shadowSamplerInfo{};
    shadowSamplerInfo.sType = VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO;
    shadowSamplerInfo.magFilter = VK_FILTER_LINEAR;
    shadowSamplerInfo.minFilter = VK_FILTER_LINEAR;
    shadowSamplerInfo.addressModeU = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER;
    shadowSamplerInfo.addressModeV = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER;
    shadowSamplerInfo.addressModeW = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER;
    shadowSamplerInfo.anisotropyEnable = VK_TRUE;
    shadowSamplerInfo.maxAnisotropy = 16.0f;
    shadowSamplerInfo.borderColor = VK_BORDER_COLOR_FLOAT_OPAQUE_WHITE;
    shadowSamplerInfo.unnormalizedCoordinates = VK_FALSE;
    shadowSamplerInfo.compareEnable = VK_TRUE;
    shadowSamplerInfo.compareOp = VK_COMPARE_OP_LESS;

    VkSampler shadowSampler;
    result = vkCreateSampler(device, &shadowSamplerInfo, nullptr, &shadowSampler);
    checkVulkanError(result, "shadow sampler");

    VkSamplerCreateInfo linearSamplerInfo{};
    linearSamplerInfo.sType = VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO;
    linearSamplerInfo.magFilter = VK_FILTER_LINEAR;
    linearSamplerInfo.minFilter = VK_FILTER_LINEAR;
    linearSamplerInfo.addressModeU = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    linearSamplerInfo.addressModeV = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    linearSamplerInfo.addressModeW = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    linearSamplerInfo.anisotropyEnable = VK_FALSE;
    linearSamplerInfo.maxAnisotropy = 1.0f;
    linearSamplerInfo.borderColor = VK_BORDER_COLOR_FLOAT_OPAQUE_WHITE;
    linearSamplerInfo.unnormalizedCoordinates = VK_FALSE;
    linearSamplerInfo.compareEnable = VK_FALSE;
    linearSamplerInfo.compareOp = VK_COMPARE_OP_ALWAYS;

    VkSampler linearSampler;
    result = vkCreateSampler(device, &linearSamplerInfo, nullptr, &linearSampler);
    checkVulkanError(result, "linear sampler");

    VkSamplerCreateInfo noiseSamplerInfo{};
    noiseSamplerInfo.sType = VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO;
    noiseSamplerInfo.magFilter = VK_FILTER_NEAREST;
    noiseSamplerInfo.minFilter = VK_FILTER_NEAREST;
    noiseSamplerInfo.addressModeU = VK_SAMPLER_ADDRESS_MODE_REPEAT;
    noiseSamplerInfo.addressModeV = VK_SAMPLER_ADDRESS_MODE_REPEAT;
    noiseSamplerInfo.addressModeW = VK_SAMPLER_ADDRESS_MODE_REPEAT;
    noiseSamplerInfo.anisotropyEnable = VK_FALSE;
    noiseSamplerInfo.maxAnisotropy = 1.0f;
    noiseSamplerInfo.borderColor = VK_BORDER_COLOR_FLOAT_OPAQUE_WHITE;
    noiseSamplerInfo.unnormalizedCoordinates = VK_FALSE;
    noiseSamplerInfo.compareEnable = VK_FALSE;
    noiseSamplerInfo.compareOp = VK_COMPARE_OP_ALWAYS;

    VkSampler noiseSampler;
    result = vkCreateSampler(device, &noiseSamplerInfo, nullptr, &noiseSampler);
    checkVulkanError(result, "noise sampler");

    for (size_t i = 0; i < perFrame.size(); i++) {
        perFrame[i].descriptorSet = sets[i];
        perFrameDescriptors[i].ssaoDescriptorSet = ssaoSets[i];
        perFrameDescriptors[i].blurDescriptorSet = blurSets[i];
        perFrameDescriptors[i].postprocessDescriptorSet = postprocessSets[i];

        VkDescriptorBufferInfo cameraBufferInfo{};
        cameraBufferInfo.buffer = perFrame[i].cameraUniformBuffer;
        cameraBufferInfo.offset = 0;
        cameraBufferInfo.range = sizeof(CameraUniforms);

        VkDescriptorBufferInfo lightBufferInfo{};
        lightBufferInfo.buffer = perFrame[i].lightUniformBuffer;
        lightBufferInfo.offset = 0;
        lightBufferInfo.range = sizeof(LightUniforms);

        VkDescriptorImageInfo shadowImageInfo{};
        shadowImageInfo.imageLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_READ_ONLY_OPTIMAL;
        shadowImageInfo.imageView = shadowImageView;
        shadowImageInfo.sampler = shadowSampler;

        std::array<VkWriteDescriptorSet, 3> mainDescriptorWrites{};
        mainDescriptorWrites[0].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        mainDescriptorWrites[0].dstSet = perFrame[i].descriptorSet;
        mainDescriptorWrites[0].dstBinding = 0;
        mainDescriptorWrites[0].dstArrayElement = 0;
        mainDescriptorWrites[0].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        mainDescriptorWrites[0].descriptorCount = 1;
        mainDescriptorWrites[0].pBufferInfo = &cameraBufferInfo;

        mainDescriptorWrites[1].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        mainDescriptorWrites[1].dstSet = perFrame[i].descriptorSet;
        mainDescriptorWrites[1].dstBinding = 1;
        mainDescriptorWrites[1].dstArrayElement = 0;
        mainDescriptorWrites[1].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        mainDescriptorWrites[1].descriptorCount = 1;
        mainDescriptorWrites[1].pBufferInfo = &lightBufferInfo;

        mainDescriptorWrites[2].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        mainDescriptorWrites[2].dstSet = perFrame[i].descriptorSet;
        mainDescriptorWrites[2].dstBinding = 2;
        mainDescriptorWrites[2].dstArrayElement = 0;
        mainDescriptorWrites[2].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        mainDescriptorWrites[2].descriptorCount = 1;
        mainDescriptorWrites[2].pImageInfo = &shadowImageInfo;

        vkUpdateDescriptorSets(device, static_cast<uint32_t>(mainDescriptorWrites.size()), mainDescriptorWrites.data(), 0, nullptr);

        VkDescriptorImageInfo positionImageInfo{};
        positionImageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        positionImageInfo.imageView = gbuffer.positionView;
        positionImageInfo.sampler = linearSampler;

        VkDescriptorImageInfo normalImageInfo{};
        normalImageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        normalImageInfo.imageView = gbuffer.normalView;
        normalImageInfo.sampler = linearSampler;

        VkDescriptorImageInfo albedoImageInfo{};
        albedoImageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        albedoImageInfo.imageView = gbuffer.albedoView;
        albedoImageInfo.sampler = linearSampler;

        VkDescriptorImageInfo noiseImageInfo{};
        noiseImageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        noiseImageInfo.imageView = ssao.noiseView;
        noiseImageInfo.sampler = noiseSampler;

        VkDescriptorBufferInfo kernelBufferInfo{};
        kernelBufferInfo.buffer = ssao.kernelBuffer;
        kernelBufferInfo.offset = 0;
        kernelBufferInfo.range = sizeof(Vec3) * ssao.ssaoKernel.size();

        std::array<VkWriteDescriptorSet, 5> ssaoDescriptorWrites{};
        ssaoDescriptorWrites[0].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        ssaoDescriptorWrites[0].dstSet = perFrameDescriptors[i].ssaoDescriptorSet;
        ssaoDescriptorWrites[0].dstBinding = 0;
        ssaoDescriptorWrites[0].dstArrayElement = 0;
        ssaoDescriptorWrites[0].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        ssaoDescriptorWrites[0].descriptorCount = 1;
        ssaoDescriptorWrites[0].pImageInfo = &positionImageInfo;

        ssaoDescriptorWrites[1].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        ssaoDescriptorWrites[1].dstSet = perFrameDescriptors[i].ssaoDescriptorSet;
        ssaoDescriptorWrites[1].dstBinding = 1;
        ssaoDescriptorWrites[1].dstArrayElement = 0;
        ssaoDescriptorWrites[1].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        ssaoDescriptorWrites[1].descriptorCount = 1;
        ssaoDescriptorWrites[1].pImageInfo = &normalImageInfo;

        ssaoDescriptorWrites[2].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        ssaoDescriptorWrites[2].dstSet = perFrameDescriptors[i].ssaoDescriptorSet;
        ssaoDescriptorWrites[2].dstBinding = 2;
        ssaoDescriptorWrites[2].dstArrayElement = 0;
        ssaoDescriptorWrites[2].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        ssaoDescriptorWrites[2].descriptorCount = 1;
        ssaoDescriptorWrites[2].pImageInfo = &noiseImageInfo;

        ssaoDescriptorWrites[3].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        ssaoDescriptorWrites[3].dstSet = perFrameDescriptors[i].ssaoDescriptorSet;
        ssaoDescriptorWrites[3].dstBinding = 3;
        ssaoDescriptorWrites[3].dstArrayElement = 0;
        ssaoDescriptorWrites[3].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        ssaoDescriptorWrites[3].descriptorCount = 1;
        ssaoDescriptorWrites[3].pBufferInfo = &cameraBufferInfo;

        ssaoDescriptorWrites[4].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        ssaoDescriptorWrites[4].dstSet = perFrameDescriptors[i].ssaoDescriptorSet;
        ssaoDescriptorWrites[4].dstBinding = 4;
        ssaoDescriptorWrites[4].dstArrayElement = 0;
        ssaoDescriptorWrites[4].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        ssaoDescriptorWrites[4].descriptorCount = 1;
        ssaoDescriptorWrites[4].pBufferInfo = &kernelBufferInfo;

        vkUpdateDescriptorSets(device, static_cast<uint32_t>(ssaoDescriptorWrites.size()), ssaoDescriptorWrites.data(), 0, nullptr);

        VkDescriptorImageInfo ssaoImageInfo{};
        ssaoImageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        ssaoImageInfo.imageView = ssao.ssaoView;
        ssaoImageInfo.sampler = linearSampler;

        std::array<VkWriteDescriptorSet, 2> blurDescriptorWrites{};
        blurDescriptorWrites[0].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        blurDescriptorWrites[0].dstSet = perFrameDescriptors[i].blurDescriptorSet;
        blurDescriptorWrites[0].dstBinding = 0;
        blurDescriptorWrites[0].dstArrayElement = 0;
        blurDescriptorWrites[0].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        blurDescriptorWrites[0].descriptorCount = 1;
        blurDescriptorWrites[0].pImageInfo = &ssaoImageInfo;

        blurDescriptorWrites[1].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        blurDescriptorWrites[1].dstSet = perFrameDescriptors[i].blurDescriptorSet;
        blurDescriptorWrites[1].dstBinding = 1;
        blurDescriptorWrites[1].dstArrayElement = 0;
        blurDescriptorWrites[1].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        blurDescriptorWrites[1].descriptorCount = 1;
        blurDescriptorWrites[1].pImageInfo = &normalImageInfo;

        vkUpdateDescriptorSets(device, static_cast<uint32_t>(blurDescriptorWrites.size()), blurDescriptorWrites.data(), 0, nullptr);

        VkDescriptorImageInfo ssaoBlurImageInfo{};
        ssaoBlurImageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        ssaoBlurImageInfo.imageView = ssao.blurView;
        ssaoBlurImageInfo.sampler = linearSampler;

        VkDescriptorImageInfo reflectionImageInfo{};
        reflectionImageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        reflectionImageInfo.imageView = reflection.reflectionView;
        reflectionImageInfo.sampler = linearSampler;

        std::array<VkWriteDescriptorSet, 8> postprocessDescriptorWrites{};
        postprocessDescriptorWrites[0].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        postprocessDescriptorWrites[0].dstSet = perFrameDescriptors[i].postprocessDescriptorSet;
        postprocessDescriptorWrites[0].dstBinding = 0;
        postprocessDescriptorWrites[0].dstArrayElement = 0;
        postprocessDescriptorWrites[0].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        postprocessDescriptorWrites[0].descriptorCount = 1;
        postprocessDescriptorWrites[0].pImageInfo = &positionImageInfo;

        postprocessDescriptorWrites[1].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        postprocessDescriptorWrites[1].dstSet = perFrameDescriptors[i].postprocessDescriptorSet;
        postprocessDescriptorWrites[1].dstBinding = 1;
        postprocessDescriptorWrites[1].dstArrayElement = 0;
        postprocessDescriptorWrites[1].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        postprocessDescriptorWrites[1].descriptorCount = 1;
        postprocessDescriptorWrites[1].pImageInfo = &normalImageInfo;

        postprocessDescriptorWrites[2].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        postprocessDescriptorWrites[2].dstSet = perFrameDescriptors[i].postprocessDescriptorSet;
        postprocessDescriptorWrites[2].dstBinding = 2;
        postprocessDescriptorWrites[2].dstArrayElement = 0;
        postprocessDescriptorWrites[2].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        postprocessDescriptorWrites[2].descriptorCount = 1;
        postprocessDescriptorWrites[2].pImageInfo = &albedoImageInfo;

        postprocessDescriptorWrites[3].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        postprocessDescriptorWrites[3].dstSet = perFrameDescriptors[i].postprocessDescriptorSet;
        postprocessDescriptorWrites[3].dstBinding = 3;
        postprocessDescriptorWrites[3].dstArrayElement = 0;
        postprocessDescriptorWrites[3].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        postprocessDescriptorWrites[3].descriptorCount = 1;
        postprocessDescriptorWrites[3].pImageInfo = &ssaoBlurImageInfo;

        postprocessDescriptorWrites[4].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        postprocessDescriptorWrites[4].dstSet = perFrameDescriptors[i].postprocessDescriptorSet;
        postprocessDescriptorWrites[4].dstBinding = 4;
        postprocessDescriptorWrites[4].dstArrayElement = 0;
        postprocessDescriptorWrites[4].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        postprocessDescriptorWrites[4].descriptorCount = 1;
        postprocessDescriptorWrites[4].pImageInfo = &shadowImageInfo;

        postprocessDescriptorWrites[5].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        postprocessDescriptorWrites[5].dstSet = perFrameDescriptors[i].postprocessDescriptorSet;
        postprocessDescriptorWrites[5].dstBinding = 5;
        postprocessDescriptorWrites[5].dstArrayElement = 0;
        postprocessDescriptorWrites[5].descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        postprocessDescriptorWrites[5].descriptorCount = 1;
        postprocessDescriptorWrites[5].pImageInfo = &reflectionImageInfo;

        postprocessDescriptorWrites[6].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        postprocessDescriptorWrites[6].dstSet = perFrameDescriptors[i].postprocessDescriptorSet;
        postprocessDescriptorWrites[6].dstBinding = 6;
        postprocessDescriptorWrites[6].dstArrayElement = 0;
        postprocessDescriptorWrites[6].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        postprocessDescriptorWrites[6].descriptorCount = 1;
        postprocessDescriptorWrites[6].pBufferInfo = &cameraBufferInfo;

        postprocessDescriptorWrites[7].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        postprocessDescriptorWrites[7].dstSet = perFrameDescriptors[i].postprocessDescriptorSet;
        postprocessDescriptorWrites[7].dstBinding = 7;
        postprocessDescriptorWrites[7].dstArrayElement = 0;
        postprocessDescriptorWrites[7].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
        postprocessDescriptorWrites[7].descriptorCount = 1;
        postprocessDescriptorWrites[7].pBufferInfo = &lightBufferInfo;

        vkUpdateDescriptorSets(device, static_cast<uint32_t>(postprocessDescriptorWrites.size()), postprocessDescriptorWrites.data(), 0, nullptr);
    }
}

void VulkanRenderer::createCommandBuffers() {
    commandBuffers.resize(swapChainFramebuffers.size());

    VkCommandBufferAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    allocInfo.commandPool = commandPool;
    allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    allocInfo.commandBufferCount = static_cast<uint32_t>(commandBuffers.size());

    VkResult result = vkAllocateCommandBuffers(device, &allocInfo, commandBuffers.data());
    checkVulkanError(result, "command buffers");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate command buffers!");
    }

    VkCommandBufferAllocateInfo singleAllocInfo{};
    singleAllocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    singleAllocInfo.commandPool = commandPool;
    singleAllocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    singleAllocInfo.commandBufferCount = 1;

    result = vkAllocateCommandBuffers(device, &singleAllocInfo, &shadowCommandBuffer);
    checkVulkanError(result, "shadow command buffer");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate shadow command buffer!");
    }

    result = vkAllocateCommandBuffers(device, &singleAllocInfo, &gbufferCommandBuffer);
    checkVulkanError(result, "gbuffer command buffer");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate gbuffer command buffer!");
    }

    result = vkAllocateCommandBuffers(device, &singleAllocInfo, &ssaoCommandBuffer);
    checkVulkanError(result, "ssao command buffer");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate ssao command buffer!");
    }

    result = vkAllocateCommandBuffers(device, &singleAllocInfo, &blurCommandBuffer);
    checkVulkanError(result, "blur command buffer");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate blur command buffer!");
    }

    result = vkAllocateCommandBuffers(device, &singleAllocInfo, &reflectionCommandBuffer);
    checkVulkanError(result, "reflection command buffer");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate reflection command buffer!");
    }

    result = vkAllocateCommandBuffers(device, &singleAllocInfo, &postprocessCommandBuffer);
    checkVulkanError(result, "postprocess command buffer");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to allocate postprocess command buffer!");
    }
}

void VulkanRenderer::createSyncObjects() {
    imageAvailableSemaphores.resize(MAX_FRAMES_IN_FLIGHT);
    shadowFinishedSemaphores.resize(MAX_FRAMES_IN_FLIGHT);
    gbufferFinishedSemaphores.resize(MAX_FRAMES_IN_FLIGHT);
    ssaoFinishedSemaphores.resize(MAX_FRAMES_IN_FLIGHT);
    blurFinishedSemaphores.resize(MAX_FRAMES_IN_FLIGHT);
    reflectionFinishedSemaphores.resize(MAX_FRAMES_IN_FLIGHT);
    postprocessFinishedSemaphores.resize(MAX_FRAMES_IN_FLIGHT);
    renderFinishedSemaphores.resize(MAX_FRAMES_IN_FLIGHT);
    inFlightFences.resize(MAX_FRAMES_IN_FLIGHT);

    VkSemaphoreCreateInfo semaphoreInfo{};
    semaphoreInfo.sType = VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO;

    VkFenceCreateInfo fenceInfo{};
    fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
    fenceInfo.flags = VK_FENCE_CREATE_SIGNALED_BIT;

    for (int i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) {
        VkResult r1 = vkCreateSemaphore(device, &semaphoreInfo, nullptr, &imageAvailableSemaphores[i]);
        VkResult r2 = vkCreateSemaphore(device, &semaphoreInfo, nullptr, &shadowFinishedSemaphores[i]);
        VkResult r3 = vkCreateSemaphore(device, &semaphoreInfo, nullptr, &gbufferFinishedSemaphores[i]);
        VkResult r4 = vkCreateSemaphore(device, &semaphoreInfo, nullptr, &ssaoFinishedSemaphores[i]);
        VkResult r5 = vkCreateSemaphore(device, &semaphoreInfo, nullptr, &blurFinishedSemaphores[i]);
        VkResult r6 = vkCreateSemaphore(device, &semaphoreInfo, nullptr, &reflectionFinishedSemaphores[i]);
        VkResult r7 = vkCreateSemaphore(device, &semaphoreInfo, nullptr, &postprocessFinishedSemaphores[i]);
        VkResult r8 = vkCreateSemaphore(device, &semaphoreInfo, nullptr, &renderFinishedSemaphores[i]);
        VkResult r9 = vkCreateFence(device, &fenceInfo, nullptr, &inFlightFences[i]);

        checkVulkanError(r1, "semaphore");
        checkVulkanError(r2, "semaphore");
        checkVulkanError(r3, "semaphore");
        checkVulkanError(r4, "semaphore");
        checkVulkanError(r5, "semaphore");
        checkVulkanError(r6, "semaphore");
        checkVulkanError(r7, "semaphore");
        checkVulkanError(r8, "semaphore");
        checkVulkanError(r9, "fence");

        if (r1 != VK_SUCCESS || r2 != VK_SUCCESS || r3 != VK_SUCCESS || r4 != VK_SUCCESS ||
            r5 != VK_SUCCESS || r6 != VK_SUCCESS || r7 != VK_SUCCESS || r8 != VK_SUCCESS || r9 != VK_SUCCESS) {
            throw std::runtime_error("Failed to create synchronization objects!");
        }
    }
}

void VulkanRenderer::uploadChunkMesh(Chunk* chunk, LODLevel lod) {
    if (!chunk || !chunk->meshed) return;

    ChunkMeshKey key{ chunk->position, static_cast<int>(lod) };

    std::lock_guard<std::mutex> lock(meshMutex);

    auto& meshData = chunk->getMesh(lod);
    if (meshData.empty()) {
        auto it = chunkMeshes.find(key);
        if (it != chunkMeshes.end()) {
            if (it->second.vertexBuffer) vkDestroyBuffer(device, it->second.vertexBuffer, nullptr);
            if (it->second.vertexMemory) vkFreeMemory(device, it->second.vertexMemory, nullptr);
            if (it->second.indexBuffer) vkDestroyBuffer(device, it->second.indexBuffer, nullptr);
            if (it->second.indexMemory) vkFreeMemory(device, it->second.indexMemory, nullptr);
            chunkMeshes.erase(it);
        }
        return;
    }

    ChunkMesh mesh;
    mesh.indexCount = static_cast<uint32_t>(meshData.indexCount());

    VkDeviceSize vertexBufferSize = meshData.vertexCount() * sizeof(Vertex);
    VkDeviceSize indexBufferSize = meshData.indexCount() * sizeof(uint32_t);

    VkBuffer stagingVertexBuffer;
    VkDeviceMemory stagingVertexMemory;
    createBuffer(vertexBufferSize, VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
        stagingVertexBuffer, stagingVertexMemory);

    void* data;
    vkMapMemory(device, stagingVertexMemory, 0, vertexBufferSize, 0, &data);
    memcpy(data, meshData.vertices.data(), vertexBufferSize);
    vkUnmapMemory(device, stagingVertexMemory);

    createBuffer(vertexBufferSize, VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_VERTEX_BUFFER_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        mesh.vertexBuffer, mesh.vertexMemory);

    copyBuffer(stagingVertexBuffer, mesh.vertexBuffer, vertexBufferSize);

    vkDestroyBuffer(device, stagingVertexBuffer, nullptr);
    vkFreeMemory(device, stagingVertexMemory, nullptr);

    VkBuffer stagingIndexBuffer;
    VkDeviceMemory stagingIndexMemory;
    createBuffer(indexBufferSize, VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
        stagingIndexBuffer, stagingIndexMemory);

    vkMapMemory(device, stagingIndexMemory, 0, indexBufferSize, 0, &data);
    memcpy(data, meshData.indices.data(), indexBufferSize);
    vkUnmapMemory(device, stagingIndexMemory);

    createBuffer(indexBufferSize, VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_INDEX_BUFFER_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        mesh.indexBuffer, mesh.indexMemory);

    copyBuffer(stagingIndexBuffer, mesh.indexBuffer, indexBufferSize);

    vkDestroyBuffer(device, stagingIndexBuffer, nullptr);
    vkFreeMemory(device, stagingIndexMemory, nullptr);

    mesh.uploaded = true;
    mesh.meshVersion = chunk->meshVersion;

    auto it = chunkMeshes.find(key);
    if (it != chunkMeshes.end()) {
        if (it->second.vertexBuffer) vkDestroyBuffer(device, it->second.vertexBuffer, nullptr);
        if (it->second.vertexMemory) vkFreeMemory(device, it->second.vertexMemory, nullptr);
        if (it->second.indexBuffer) vkDestroyBuffer(device, it->second.indexBuffer, nullptr);
        if (it->second.indexMemory) vkFreeMemory(device, it->second.indexMemory, nullptr);
    }
    chunkMeshes[key] = mesh;
}

void VulkanRenderer::updateCameraUniforms(const CameraUniforms& uniforms) {
    if (!initialized) return;

    char* data;
    vkMapMemory(device, perFrame[currentFrame].cameraUniformMemory, 0, sizeof(CameraUniforms), 0, (void**)&data);
    memcpy(data, &uniforms, sizeof(CameraUniforms));
    vkUnmapMemory(device, perFrame[currentFrame].cameraUniformMemory);
}

void VulkanRenderer::updateLightUniforms(const LightUniforms& uniforms) {
    if (!initialized) return;

    char* data;
    vkMapMemory(device, perFrame[currentFrame].lightUniformMemory, 0, sizeof(LightUniforms), 0, (void**)&data);
    memcpy(data, &uniforms, sizeof(LightUniforms));
    vkUnmapMemory(device, perFrame[currentFrame].lightUniformMemory);
}

void VulkanRenderer::beginFrame() {
    if (!initialized) return;

    vkWaitForFences(device, 1, &inFlightFences[currentFrame], VK_TRUE, UINT64_MAX);
    vkResetFences(device, 1, &inFlightFences[currentFrame]);

    uint32_t imageIndex;
    VkResult result = vkAcquireNextImageKHR(device, swapChain, UINT64_MAX,
        imageAvailableSemaphores[currentFrame], VK_NULL_HANDLE, &imageIndex);

    if (result == VK_ERROR_OUT_OF_DATE_KHR) {
        recreateSwapChain();
        return;
    } else if (result != VK_SUCCESS && result != VK_SUBOPTIMAL_KHR) {
        checkVulkanError(result, "acquire next image");
        return;
    }

    currentImageIndex = imageIndex;
    vkResetCommandBuffer(commandBuffers[currentImageIndex], 0);
}

void VulkanRenderer::renderChunks(const std::vector<RenderChunk>& chunks) {
    if (!initialized) return;

    uint32_t imageIndex = currentImageIndex;

    for (const auto& rc : chunks) {
        ChunkMeshKey key{ rc.chunk->position, static_cast<int>(rc.lod) };

        if (rc.chunk->dirty) {
            continue;
        }

        auto it = chunkMeshes.find(key);
        if (it == chunkMeshes.end() || it->second.meshVersion != rc.chunk->meshVersion) {
            uploadChunkMesh(rc.chunk, rc.lod);
        }
    }

    vkResetCommandBuffer(shadowCommandBuffer, 0);
    recordShadowCommandBuffer(shadowCommandBuffer);

    VkSubmitInfo shadowSubmitInfo{};
    shadowSubmitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    shadowSubmitInfo.commandBufferCount = 1;
    shadowSubmitInfo.pCommandBuffers = &shadowCommandBuffer;
    shadowSubmitInfo.signalSemaphoreCount = 1;
    shadowSubmitInfo.pSignalSemaphores = &shadowFinishedSemaphores[currentFrame];

    VkResult result = vkQueueSubmit(graphicsQueue, 1, &shadowSubmitInfo, VK_NULL_HANDLE);
    checkVulkanError(result, "shadow queue submit");

    vkResetCommandBuffer(reflectionCommandBuffer, 0);
    recordReflectionCommandBuffer(reflectionCommandBuffer, chunks);

    VkSemaphore reflectionWaitSemaphores[] = { shadowFinishedSemaphores[currentFrame] };
    VkPipelineStageFlags reflectionWaitStages[] = { VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT };
    VkSubmitInfo reflectionSubmitInfo{};
    reflectionSubmitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    reflectionSubmitInfo.waitSemaphoreCount = 1;
    reflectionSubmitInfo.pWaitSemaphores = reflectionWaitSemaphores;
    reflectionSubmitInfo.pWaitDstStageMask = reflectionWaitStages;
    reflectionSubmitInfo.commandBufferCount = 1;
    reflectionSubmitInfo.pCommandBuffers = &reflectionCommandBuffer;
    reflectionSubmitInfo.signalSemaphoreCount = 1;
    reflectionSubmitInfo.pSignalSemaphores = &reflectionFinishedSemaphores[currentFrame];

    result = vkQueueSubmit(graphicsQueue, 1, &reflectionSubmitInfo, VK_NULL_HANDLE);
    checkVulkanError(result, "reflection queue submit");

    vkResetCommandBuffer(gbufferCommandBuffer, 0);
    recordGBufferCommandBuffer(gbufferCommandBuffer, chunks);

    VkSemaphore gbufferWaitSemaphores[] = { reflectionFinishedSemaphores[currentFrame] };
    VkPipelineStageFlags gbufferWaitStages[] = { VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT };
    VkSubmitInfo gbufferSubmitInfo{};
    gbufferSubmitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    gbufferSubmitInfo.waitSemaphoreCount = 1;
    gbufferSubmitInfo.pWaitSemaphores = gbufferWaitSemaphores;
    gbufferSubmitInfo.pWaitDstStageMask = gbufferWaitStages;
    gbufferSubmitInfo.commandBufferCount = 1;
    gbufferSubmitInfo.pCommandBuffers = &gbufferCommandBuffer;
    gbufferSubmitInfo.signalSemaphoreCount = 1;
    gbufferSubmitInfo.pSignalSemaphores = &gbufferFinishedSemaphores[currentFrame];

    result = vkQueueSubmit(graphicsQueue, 1, &gbufferSubmitInfo, VK_NULL_HANDLE);
    checkVulkanError(result, "gbuffer queue submit");

    vkResetCommandBuffer(ssaoCommandBuffer, 0);
    recordSSAOCommandBuffer(ssaoCommandBuffer);

    VkSemaphore ssaoWaitSemaphores[] = { gbufferFinishedSemaphores[currentFrame] };
    VkPipelineStageFlags ssaoWaitStages[] = { VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT };
    VkSubmitInfo ssaoSubmitInfo{};
    ssaoSubmitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    ssaoSubmitInfo.waitSemaphoreCount = 1;
    ssaoSubmitInfo.pWaitSemaphores = ssaoWaitSemaphores;
    ssaoSubmitInfo.pWaitDstStageMask = ssaoWaitStages;
    ssaoSubmitInfo.commandBufferCount = 1;
    ssaoSubmitInfo.pCommandBuffers = &ssaoCommandBuffer;
    ssaoSubmitInfo.signalSemaphoreCount = 1;
    ssaoSubmitInfo.pSignalSemaphores = &ssaoFinishedSemaphores[currentFrame];

    result = vkQueueSubmit(graphicsQueue, 1, &ssaoSubmitInfo, VK_NULL_HANDLE);
    checkVulkanError(result, "ssao queue submit");

    vkResetCommandBuffer(blurCommandBuffer, 0);
    recordBlurCommandBuffer(blurCommandBuffer);

    VkSemaphore blurWaitSemaphores[] = { ssaoFinishedSemaphores[currentFrame] };
    VkPipelineStageFlags blurWaitStages[] = { VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT };
    VkSubmitInfo blurSubmitInfo{};
    blurSubmitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    blurSubmitInfo.waitSemaphoreCount = 1;
    blurSubmitInfo.pWaitSemaphores = blurWaitSemaphores;
    blurSubmitInfo.pWaitDstStageMask = blurWaitStages;
    blurSubmitInfo.commandBufferCount = 1;
    blurSubmitInfo.pCommandBuffers = &blurCommandBuffer;
    blurSubmitInfo.signalSemaphoreCount = 1;
    blurSubmitInfo.pSignalSemaphores = &blurFinishedSemaphores[currentFrame];

    result = vkQueueSubmit(graphicsQueue, 1, &blurSubmitInfo, VK_NULL_HANDLE);
    checkVulkanError(result, "blur queue submit");

    vkResetCommandBuffer(postprocessCommandBuffer, 0);
    recordPostprocessCommandBuffer(postprocessCommandBuffer, imageIndex);

    VkSemaphore postprocessWaitSemaphores[] = { imageAvailableSemaphores[currentFrame], blurFinishedSemaphores[currentFrame], reflectionFinishedSemaphores[currentFrame], shadowFinishedSemaphores[currentFrame] };
    VkPipelineStageFlags postprocessWaitStages[] = {
        VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT,
        VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT,
        VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT,
        VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT
    };
    VkSemaphore postprocessSignalSemaphores[] = { renderFinishedSemaphores[currentFrame] };

    VkSubmitInfo postprocessSubmitInfo{};
    postprocessSubmitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    postprocessSubmitInfo.waitSemaphoreCount = 4;
    postprocessSubmitInfo.pWaitSemaphores = postprocessWaitSemaphores;
    postprocessSubmitInfo.pWaitDstStageMask = postprocessWaitStages;
    postprocessSubmitInfo.commandBufferCount = 1;
    postprocessSubmitInfo.pCommandBuffers = &postprocessCommandBuffer;
    postprocessSubmitInfo.signalSemaphoreCount = 1;
    postprocessSubmitInfo.pSignalSemaphores = postprocessSignalSemaphores;

    result = vkQueueSubmit(graphicsQueue, 1, &postprocessSubmitInfo, inFlightFences[currentFrame]);
    checkVulkanError(result, "postprocess queue submit");
}

void VulkanRenderer::endFrame() {
    if (!initialized) return;

    uint32_t imageIndex = currentImageIndex;

    VkSemaphore signalSemaphores[] = { renderFinishedSemaphores[currentFrame] };

    VkPresentInfoKHR presentInfo{};
    presentInfo.sType = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
    presentInfo.waitSemaphoreCount = 1;
    presentInfo.pWaitSemaphores = signalSemaphores;
    presentInfo.swapchainCount = 1;
    presentInfo.pSwapchains = &swapChain;
    presentInfo.pImageIndices = &imageIndex;

    VkResult result = vkQueuePresentKHR(presentQueue, &presentInfo);

    if (result == VK_ERROR_OUT_OF_DATE_KHR || result == VK_SUBOPTIMAL_KHR) {
        recreateSwapChain();
    } else if (result != VK_SUCCESS) {
        checkVulkanError(result, "present");
    }

    currentFrame = (currentFrame + 1) % MAX_FRAMES_IN_FLIGHT;
}

void VulkanRenderer::clearChunkMeshes() {
    if (!initialized) return;

    vkDeviceWaitIdle(device);
    for (auto& [key, mesh] : chunkMeshes) {
        if (mesh.vertexBuffer != VK_NULL_HANDLE) {
            vkDestroyBuffer(device, mesh.vertexBuffer, nullptr);
            vkFreeMemory(device, mesh.vertexMemory, nullptr);
        }
        if (mesh.indexBuffer != VK_NULL_HANDLE) {
            vkDestroyBuffer(device, mesh.indexBuffer, nullptr);
            vkFreeMemory(device, mesh.indexMemory, nullptr);
        }
    }
    chunkMeshes.clear();
}

void VulkanRenderer::recordShadowCommandBuffer(VkCommandBuffer commandBuffer) {
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;

    if (vkBeginCommandBuffer(commandBuffer, &beginInfo) != VK_SUCCESS) {
        return;
    }

    transitionImageLayout(shadowImage, findDepthFormat(),
        VK_IMAGE_LAYOUT_DEPTH_STENCIL_READ_ONLY_OPTIMAL,
        VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL);

    VkRenderPassBeginInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
    renderPassInfo.renderPass = shadowRenderPass;
    renderPassInfo.framebuffer = shadowFramebuffer;
    renderPassInfo.renderArea.offset = { 0, 0 };
    renderPassInfo.renderArea.extent.width = SHADOW_MAP_SIZE;
    renderPassInfo.renderArea.extent.height = SHADOW_MAP_SIZE;

    VkClearValue clearValue;
    clearValue.depthStencil = { 1.0f, 0 };
    renderPassInfo.clearValueCount = 1;
    renderPassInfo.pClearValues = &clearValue;

    vkCmdBeginRenderPass(commandBuffer, &renderPassInfo, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, shadowPipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, pipelineLayout, 0, 1, &perFrame[currentFrame].descriptorSet, 0, nullptr);

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = static_cast<float>(SHADOW_MAP_SIZE);
    viewport.height = static_cast<float>(SHADOW_MAP_SIZE);
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;
    vkCmdSetViewport(commandBuffer, 0, 1, &viewport);

    for (auto& [key, mesh] : chunkMeshes) {
        if (!mesh.uploaded || mesh.indexCount == 0) continue;

        PushConstants pc{};
        pc.model = Mat4::identity();
        pc.lodLevel = static_cast<float>(key.lod);

        vkCmdPushConstants(commandBuffer, pipelineLayout, VK_SHADER_STAGE_VERTEX_BIT, 0, sizeof(PushConstants), &pc);

        VkBuffer vertexBuffers[] = { mesh.vertexBuffer };
        VkDeviceSize offsets[] = { 0 };
        vkCmdBindVertexBuffers(commandBuffer, 0, 1, vertexBuffers, offsets);
        vkCmdBindIndexBuffer(commandBuffer, mesh.indexBuffer, 0, VK_INDEX_TYPE_UINT32);
        vkCmdDrawIndexed(commandBuffer, mesh.indexCount, 1, 0, 0, 0);
    }

    vkCmdEndRenderPass(commandBuffer);

    transitionImageLayout(shadowImage, findDepthFormat(),
        VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL,
        VK_IMAGE_LAYOUT_DEPTH_STENCIL_READ_ONLY_OPTIMAL);

    if (vkEndCommandBuffer(commandBuffer) != VK_SUCCESS) {
        return;
    }
}

void VulkanRenderer::recordCommandBuffer(VkCommandBuffer commandBuffer, uint32_t imageIndex) {
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;

    if (vkBeginCommandBuffer(commandBuffer, &beginInfo) != VK_SUCCESS) {
        return;
    }

    VkRenderPassBeginInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
    renderPassInfo.renderPass = renderPass;
    renderPassInfo.framebuffer = swapChainFramebuffers[imageIndex];
    renderPassInfo.renderArea.offset = { 0, 0 };
    renderPassInfo.renderArea.extent = swapChainExtent;

    std::array<VkClearValue, 2> clearValues{};
    clearValues[0].color = { {clearColor.x, clearColor.y, clearColor.z, 1.0f} };
    clearValues[1].depthStencil = { 1.0f, 0 };

    renderPassInfo.clearValueCount = static_cast<uint32_t>(clearValues.size());
    renderPassInfo.pClearValues = clearValues.data();

    vkCmdBeginRenderPass(commandBuffer, &renderPassInfo, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, graphicsPipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, pipelineLayout, 0, 1, &perFrame[currentFrame].descriptorSet, 0, nullptr);

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = static_cast<float>(swapChainExtent.width);
    viewport.height = static_cast<float>(swapChainExtent.height);
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;
    vkCmdSetViewport(commandBuffer, 0, 1, &viewport);

    VkRect2D scissor{};
    scissor.offset = { 0, 0 };
    scissor.extent = swapChainExtent;
    vkCmdSetScissor(commandBuffer, 0, 1, &scissor);

    for (auto& [key, mesh] : chunkMeshes) {
        if (!mesh.uploaded || mesh.indexCount == 0) continue;

        PushConstants pc{};
        pc.model = Mat4::identity();
        pc.baseColor = Vec3(1.0f);
        pc.lodLevel = static_cast<float>(key.lod);

        vkCmdPushConstants(commandBuffer, pipelineLayout,
            VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT,
            0, sizeof(PushConstants), &pc);

        VkBuffer vertexBuffers[] = { mesh.vertexBuffer };
        VkDeviceSize offsets[] = { 0 };
        vkCmdBindVertexBuffers(commandBuffer, 0, 1, vertexBuffers, offsets);
        vkCmdBindIndexBuffer(commandBuffer, mesh.indexBuffer, 0, VK_INDEX_TYPE_UINT32);
        vkCmdDrawIndexed(commandBuffer, mesh.indexCount, 1, 0, 0, 0);
    }

    vkCmdEndRenderPass(commandBuffer);

    if (vkEndCommandBuffer(commandBuffer) != VK_SUCCESS) {
        return;
    }
}

std::vector<const char*> VulkanRenderer::getRequiredExtensions() {
    std::vector<const char*> extensions;

    extensions.push_back(VK_KHR_SURFACE_EXTENSION_NAME);

#ifdef VK_USE_PLATFORM_WIN32_KHR
    extensions.push_back(VK_KHR_WIN32_SURFACE_EXTENSION_NAME);
#endif

    if (enableValidationLayers) {
        extensions.push_back(VK_EXT_DEBUG_UTILS_EXTENSION_NAME);
    }

    return extensions;
}

bool VulkanRenderer::checkValidationLayerSupport() {
    uint32_t layerCount;
    vkEnumerateInstanceLayerProperties(&layerCount, nullptr);

    std::vector<VkLayerProperties> availableLayers(layerCount);
    vkEnumerateInstanceLayerProperties(&layerCount, availableLayers.data());

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

void VulkanRenderer::copyBufferToImage(VkBuffer buffer, VkImage image, uint32_t width, uint32_t height) {
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

    VkBufferImageCopy region{};
    region.bufferOffset = 0;
    region.bufferRowLength = 0;
    region.bufferImageHeight = 0;
    region.imageSubresource.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    region.imageSubresource.mipLevel = 0;
    region.imageSubresource.baseArrayLayer = 0;
    region.imageSubresource.layerCount = 1;
    region.imageOffset = { 0, 0, 0 };
    region.imageExtent = { width, height, 1 };

    vkCmdCopyBufferToImage(commandBuffer, buffer, image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &region);

    vkEndCommandBuffer(commandBuffer);

    VkSubmitInfo submitInfo{};
    submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    submitInfo.commandBufferCount = 1;
    submitInfo.pCommandBuffers = &commandBuffer;

    vkQueueSubmit(graphicsQueue, 1, &submitInfo, VK_NULL_HANDLE);
    vkQueueWaitIdle(graphicsQueue);

    vkFreeCommandBuffers(device, commandPool, 1, &commandBuffer);
}

void VulkanRenderer::cleanupGBuffer() {
    if (!device) return;

    if (gbuffer.positionImage) {
        vkDestroyImageView(device, gbuffer.positionView, nullptr);
        vkDestroyImage(device, gbuffer.positionImage, nullptr);
        vkFreeMemory(device, gbuffer.positionMemory, nullptr);
    }
    if (gbuffer.normalImage) {
        vkDestroyImageView(device, gbuffer.normalView, nullptr);
        vkDestroyImage(device, gbuffer.normalImage, nullptr);
        vkFreeMemory(device, gbuffer.normalMemory, nullptr);
    }
    if (gbuffer.albedoImage) {
        vkDestroyImageView(device, gbuffer.albedoView, nullptr);
        vkDestroyImage(device, gbuffer.albedoImage, nullptr);
        vkFreeMemory(device, gbuffer.albedoMemory, nullptr);
    }
    if (gbuffer.depthImage) {
        vkDestroyImageView(device, gbuffer.depthView, nullptr);
        vkDestroyImage(device, gbuffer.depthImage, nullptr);
        vkFreeMemory(device, gbuffer.depthMemory, nullptr);
    }
    if (gbuffer.framebuffer) {
        vkDestroyFramebuffer(device, gbuffer.framebuffer, nullptr);
    }
}

void VulkanRenderer::cleanupSSAO() {
    if (!device) return;

    if (ssao.ssaoImage) {
        vkDestroyImageView(device, ssao.ssaoView, nullptr);
        vkDestroyImage(device, ssao.ssaoImage, nullptr);
        vkFreeMemory(device, ssao.ssaoMemory, nullptr);
    }
    if (ssao.blurImage) {
        vkDestroyImageView(device, ssao.blurView, nullptr);
        vkDestroyImage(device, ssao.blurImage, nullptr);
        vkFreeMemory(device, ssao.blurMemory, nullptr);
    }
    if (ssao.noiseImage) {
        vkDestroyImageView(device, ssao.noiseView, nullptr);
        vkDestroyImage(device, ssao.noiseImage, nullptr);
        vkFreeMemory(device, ssao.noiseMemory, nullptr);
    }
    if (ssao.kernelBuffer) {
        vkDestroyBuffer(device, ssao.kernelBuffer, nullptr);
        vkFreeMemory(device, ssao.kernelMemory, nullptr);
    }
    if (ssao.ssaoFramebuffer) {
        vkDestroyFramebuffer(device, ssao.ssaoFramebuffer, nullptr);
    }
    if (ssao.blurFramebuffer) {
        vkDestroyFramebuffer(device, ssao.blurFramebuffer, nullptr);
    }
}

void VulkanRenderer::cleanupReflection() {
    if (!device) return;

    if (reflection.reflectionImage) {
        vkDestroyImageView(device, reflection.reflectionView, nullptr);
        vkDestroyImage(device, reflection.reflectionImage, nullptr);
        vkFreeMemory(device, reflection.reflectionMemory, nullptr);
    }
    if (reflection.depthImage) {
        vkDestroyImageView(device, reflection.depthView, nullptr);
        vkDestroyImage(device, reflection.depthImage, nullptr);
        vkFreeMemory(device, reflection.depthMemory, nullptr);
    }
    if (reflection.framebuffer) {
        vkDestroyFramebuffer(device, reflection.framebuffer, nullptr);
    }
}

void VulkanRenderer::cleanupPostprocess() {
    if (!device) return;

    for (auto framebuffer : postprocess.framebuffers) {
        if (framebuffer) {
            vkDestroyFramebuffer(device, framebuffer, nullptr);
        }
    }
    postprocess.framebuffers.clear();
}

void VulkanRenderer::createGBufferRenderPass() {
    VkAttachmentDescription colorAttachments[3]{};

    for (int i = 0; i < 3; i++) {
        colorAttachments[i].format = VK_FORMAT_R16G16B16A16_SFLOAT;
        colorAttachments[i].samples = VK_SAMPLE_COUNT_1_BIT;
        colorAttachments[i].loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
        colorAttachments[i].storeOp = VK_ATTACHMENT_STORE_OP_STORE;
        colorAttachments[i].stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
        colorAttachments[i].stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
        colorAttachments[i].initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
        colorAttachments[i].finalLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
    }

    VkAttachmentDescription depthAttachment{};
    depthAttachment.format = findDepthFormat();
    depthAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    depthAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    depthAttachment.storeOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    depthAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    depthAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    depthAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    depthAttachment.finalLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;

    VkAttachmentReference colorRefs[3]{};
    for (int i = 0; i < 3; i++) {
        colorRefs[i].attachment = i;
        colorRefs[i].layout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
    }

    VkAttachmentReference depthRef{};
    depthRef.attachment = 3;
    depthRef.layout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;

    VkSubpassDescription subpass{};
    subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 3;
    subpass.pColorAttachments = colorRefs;
    subpass.pDepthStencilAttachment = &depthRef;

    VkSubpassDependency dependency{};
    dependency.srcSubpass = VK_SUBPASS_EXTERNAL;
    dependency.dstSubpass = 0;
    dependency.srcStageMask = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
    dependency.dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    dependency.srcAccessMask = VK_ACCESS_SHADER_READ_BIT;
    dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
    dependency.dependencyFlags = VK_DEPENDENCY_BY_REGION_BIT;

    VkAttachmentDescription attachments[4];
    for (int i = 0; i < 3; i++) attachments[i] = colorAttachments[i];
    attachments[3] = depthAttachment;

    VkRenderPassCreateInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    renderPassInfo.attachmentCount = 4;
    renderPassInfo.pAttachments = attachments;
    renderPassInfo.subpassCount = 1;
    renderPassInfo.pSubpasses = &subpass;
    renderPassInfo.dependencyCount = 1;
    renderPassInfo.pDependencies = &dependency;

    VkResult result = vkCreateRenderPass(device, &renderPassInfo, nullptr, &gbufferRenderPass);
    checkVulkanError(result, "gbuffer render pass");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create G-buffer render pass!");
    }
}

void VulkanRenderer::createSSAORenderPass() {
    VkAttachmentDescription colorAttachment{};
    colorAttachment.format = VK_FORMAT_R8_UNORM;
    colorAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    colorAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    colorAttachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    colorAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    colorAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    colorAttachment.finalLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;

    VkAttachmentReference colorAttachmentRef{};
    colorAttachmentRef.attachment = 0;
    colorAttachmentRef.layout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;

    VkSubpassDescription subpass{};
    subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 1;
    subpass.pColorAttachments = &colorAttachmentRef;

    VkSubpassDependency dependency{};
    dependency.srcSubpass = VK_SUBPASS_EXTERNAL;
    dependency.dstSubpass = 0;
    dependency.srcStageMask = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
    dependency.dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    dependency.srcAccessMask = VK_ACCESS_SHADER_READ_BIT;
    dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
    dependency.dependencyFlags = VK_DEPENDENCY_BY_REGION_BIT;

    VkRenderPassCreateInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    renderPassInfo.attachmentCount = 1;
    renderPassInfo.pAttachments = &colorAttachment;
    renderPassInfo.subpassCount = 1;
    renderPassInfo.pSubpasses = &subpass;
    renderPassInfo.dependencyCount = 1;
    renderPassInfo.pDependencies = &dependency;

    VkResult result = vkCreateRenderPass(device, &renderPassInfo, nullptr, &ssaoRenderPass);
    checkVulkanError(result, "ssao render pass");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create SSAO render pass!");
    }
}

void VulkanRenderer::createBlurRenderPass() {
    VkAttachmentDescription colorAttachment{};
    colorAttachment.format = VK_FORMAT_R8_UNORM;
    colorAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    colorAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    colorAttachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    colorAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    colorAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    colorAttachment.finalLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;

    VkAttachmentReference colorAttachmentRef{};
    colorAttachmentRef.attachment = 0;
    colorAttachmentRef.layout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;

    VkSubpassDescription subpass{};
    subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 1;
    subpass.pColorAttachments = &colorAttachmentRef;

    VkSubpassDependency dependency{};
    dependency.srcSubpass = VK_SUBPASS_EXTERNAL;
    dependency.dstSubpass = 0;
    dependency.srcStageMask = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
    dependency.dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    dependency.srcAccessMask = VK_ACCESS_SHADER_READ_BIT;
    dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
    dependency.dependencyFlags = VK_DEPENDENCY_BY_REGION_BIT;

    VkRenderPassCreateInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    renderPassInfo.attachmentCount = 1;
    renderPassInfo.pAttachments = &colorAttachment;
    renderPassInfo.subpassCount = 1;
    renderPassInfo.pSubpasses = &subpass;
    renderPassInfo.dependencyCount = 1;
    renderPassInfo.pDependencies = &dependency;

    VkResult result = vkCreateRenderPass(device, &renderPassInfo, nullptr, &blurRenderPass);
    checkVulkanError(result, "blur render pass");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create blur render pass!");
    }
}

void VulkanRenderer::createReflectionRenderPass() {
    VkAttachmentDescription colorAttachment{};
    colorAttachment.format = VK_FORMAT_R16G16B16A16_SFLOAT;
    colorAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    colorAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    colorAttachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    colorAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    colorAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    colorAttachment.finalLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;

    VkAttachmentDescription depthAttachment{};
    depthAttachment.format = findDepthFormat();
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
    dependency.srcStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT | VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;
    dependency.srcAccessMask = 0;
    dependency.dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT | VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;
    dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT | VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;

    std::array<VkAttachmentDescription, 2> attachments = { colorAttachment, depthAttachment };
    VkRenderPassCreateInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    renderPassInfo.attachmentCount = static_cast<uint32_t>(attachments.size());
    renderPassInfo.pAttachments = attachments.data();
    renderPassInfo.subpassCount = 1;
    renderPassInfo.pSubpasses = &subpass;
    renderPassInfo.dependencyCount = 1;
    renderPassInfo.pDependencies = &dependency;

    VkResult result = vkCreateRenderPass(device, &renderPassInfo, nullptr, &reflectionRenderPass);
    checkVulkanError(result, "reflection render pass");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create reflection render pass!");
    }
}

void VulkanRenderer::createPostprocessRenderPass() {
    VkAttachmentDescription colorAttachment{};
    colorAttachment.format = VK_FORMAT_R8G8B8A8_UNORM;
    colorAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    colorAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    colorAttachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    colorAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    colorAttachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    colorAttachment.finalLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;

    VkAttachmentReference colorAttachmentRef{};
    colorAttachmentRef.attachment = 0;
    colorAttachmentRef.layout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;

    VkSubpassDescription subpass{};
    subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 1;
    subpass.pColorAttachments = &colorAttachmentRef;

    VkSubpassDependency dependency{};
    dependency.srcSubpass = VK_SUBPASS_EXTERNAL;
    dependency.dstSubpass = 0;
    dependency.srcStageMask = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
    dependency.dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    dependency.srcAccessMask = VK_ACCESS_SHADER_READ_BIT;
    dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
    dependency.dependencyFlags = VK_DEPENDENCY_BY_REGION_BIT;

    VkRenderPassCreateInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    renderPassInfo.attachmentCount = 1;
    renderPassInfo.pAttachments = &colorAttachment;
    renderPassInfo.subpassCount = 1;
    renderPassInfo.pSubpasses = &subpass;
    renderPassInfo.dependencyCount = 1;
    renderPassInfo.pDependencies = &dependency;

    VkResult result = vkCreateRenderPass(device, &renderPassInfo, nullptr, &postprocessRenderPass);
    checkVulkanError(result, "postprocess render pass");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create postprocess render pass!");
    }
}

void VulkanRenderer::createGBufferPipeline() {
    auto vertShaderCode = readFile("shaders/gbuffer.vert.spv");
    auto fragShaderCode = readFile("shaders/gbuffer.frag.spv");

    VkShaderModule vertShaderModule = createShaderModule(vertShaderCode);
    VkShaderModule fragShaderModule = createShaderModule(fragShaderCode);

    VkPipelineShaderStageCreateInfo vertShaderStageInfo{};
    vertShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    vertShaderStageInfo.stage = VK_SHADER_STAGE_VERTEX_BIT;
    vertShaderStageInfo.module = vertShaderModule;
    vertShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo fragShaderStageInfo{};
    fragShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    fragShaderStageInfo.stage = VK_SHADER_STAGE_FRAGMENT_BIT;
    fragShaderStageInfo.module = fragShaderModule;
    fragShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo shaderStages[] = { vertShaderStageInfo, fragShaderStageInfo };

    VkVertexInputBindingDescription bindingDescription{};
    bindingDescription.binding = 0;
    bindingDescription.stride = sizeof(Vertex);
    bindingDescription.inputRate = VK_VERTEX_INPUT_RATE_VERTEX;

    std::array<VkVertexInputAttributeDescription, 4> attributeDescriptions{};
    attributeDescriptions[0].binding = 0;
    attributeDescriptions[0].location = 0;
    attributeDescriptions[0].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[0].offset = offsetof(Vertex, position);

    attributeDescriptions[1].binding = 0;
    attributeDescriptions[1].location = 1;
    attributeDescriptions[1].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[1].offset = offsetof(Vertex, normal);

    attributeDescriptions[2].binding = 0;
    attributeDescriptions[2].location = 2;
    attributeDescriptions[2].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[2].offset = offsetof(Vertex, color);

    attributeDescriptions[3].binding = 0;
    attributeDescriptions[3].location = 3;
    attributeDescriptions[3].format = VK_FORMAT_R32G32_SFLOAT;
    attributeDescriptions[3].offset = offsetof(Vertex, uv);

    VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
    vertexInputInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
    vertexInputInfo.vertexBindingDescriptionCount = 1;
    vertexInputInfo.pVertexBindingDescriptions = &bindingDescription;
    vertexInputInfo.vertexAttributeDescriptionCount = static_cast<uint32_t>(attributeDescriptions.size());
    vertexInputInfo.pVertexAttributeDescriptions = attributeDescriptions.data();

    VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
    inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
    inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    inputAssembly.primitiveRestartEnable = VK_FALSE;

    std::array<VkDynamicState, 2> dynamicStates = { VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR };

    VkPipelineDynamicStateCreateInfo dynamicState{};
    dynamicState.sType = VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO;
    dynamicState.dynamicStateCount = static_cast<uint32_t>(dynamicStates.size());
    dynamicState.pDynamicStates = dynamicStates.data();

    VkPipelineViewportStateCreateInfo viewportState{};
    viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
    viewportState.viewportCount = 1;
    viewportState.scissorCount = 1;

    VkPipelineRasterizationStateCreateInfo rasterizer{};
    rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
    rasterizer.depthClampEnable = VK_FALSE;
    rasterizer.rasterizerDiscardEnable = VK_FALSE;
    rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
    rasterizer.lineWidth = 1.0f;
    rasterizer.cullMode = VK_CULL_MODE_BACK_BIT;
    rasterizer.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    rasterizer.depthBiasEnable = VK_FALSE;

    VkPipelineMultisampleStateCreateInfo multisampling{};
    multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
    multisampling.sampleShadingEnable = VK_FALSE;
    multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

    VkPipelineDepthStencilStateCreateInfo depthStencil{};
    depthStencil.sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
    depthStencil.depthTestEnable = VK_TRUE;
    depthStencil.depthWriteEnable = VK_TRUE;
    depthStencil.depthCompareOp = VK_COMPARE_OP_LESS;
    depthStencil.depthBoundsTestEnable = VK_FALSE;
    depthStencil.stencilTestEnable = VK_FALSE;

    std::array<VkPipelineColorBlendAttachmentState, 3> colorBlendAttachments{};
    for (int i = 0; i < 3; i++) {
        colorBlendAttachments[i].colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
            VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
        colorBlendAttachments[i].blendEnable = VK_FALSE;
    }

    VkPipelineColorBlendStateCreateInfo colorBlending{};
    colorBlending.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
    colorBlending.logicOpEnable = VK_FALSE;
    colorBlending.attachmentCount = static_cast<uint32_t>(colorBlendAttachments.size());
    colorBlending.pAttachments = colorBlendAttachments.data();

    VkPushConstantRange pushConstantRange{};
    pushConstantRange.stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
    pushConstantRange.offset = 0;
    pushConstantRange.size = sizeof(PushConstants);

    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &gbufferDescriptorSetLayout;
    pipelineLayoutInfo.pushConstantRangeCount = 1;
    pipelineLayoutInfo.pPushConstantRanges = &pushConstantRange;

    VkResult result = vkCreatePipelineLayout(device, &pipelineLayoutInfo, nullptr, &gbufferPipelineLayout);
    checkVulkanError(result, "gbuffer pipeline layout");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create gbuffer pipeline layout!");
    }

    VkGraphicsPipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
    pipelineInfo.stageCount = 2;
    pipelineInfo.pStages = shaderStages;
    pipelineInfo.pVertexInputState = &vertexInputInfo;
    pipelineInfo.pInputAssemblyState = &inputAssembly;
    pipelineInfo.pViewportState = &viewportState;
    pipelineInfo.pRasterizationState = &rasterizer;
    pipelineInfo.pMultisampleState = &multisampling;
    pipelineInfo.pDepthStencilState = &depthStencil;
    pipelineInfo.pColorBlendState = &colorBlending;
    pipelineInfo.pDynamicState = &dynamicState;
    pipelineInfo.layout = gbufferPipelineLayout;
    pipelineInfo.renderPass = gbufferRenderPass;
    pipelineInfo.subpass = 0;
    pipelineInfo.basePipelineHandle = VK_NULL_HANDLE;

    result = vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &gbufferPipeline);
    checkVulkanError(result, "gbuffer pipeline");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create gbuffer pipeline!");
    }

    if (vertShaderModule) vkDestroyShaderModule(device, vertShaderModule, nullptr);
    if (fragShaderModule) vkDestroyShaderModule(device, fragShaderModule, nullptr);
}

void VulkanRenderer::createSSAOPipeline() {
    auto vertShaderCode = readFile("shaders/ssao.vert.spv");
    auto fragShaderCode = readFile("shaders/ssao.frag.spv");

    VkShaderModule vertShaderModule = createShaderModule(vertShaderCode);
    VkShaderModule fragShaderModule = createShaderModule(fragShaderCode);

    VkPipelineShaderStageCreateInfo vertShaderStageInfo{};
    vertShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    vertShaderStageInfo.stage = VK_SHADER_STAGE_VERTEX_BIT;
    vertShaderStageInfo.module = vertShaderModule;
    vertShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo fragShaderStageInfo{};
    fragShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    fragShaderStageInfo.stage = VK_SHADER_STAGE_FRAGMENT_BIT;
    fragShaderStageInfo.module = fragShaderModule;
    fragShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo shaderStages[] = { vertShaderStageInfo, fragShaderStageInfo };

    VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
    vertexInputInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
    vertexInputInfo.vertexBindingDescriptionCount = 0;
    vertexInputInfo.vertexAttributeDescriptionCount = 0;

    VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
    inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
    inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    inputAssembly.primitiveRestartEnable = VK_FALSE;

    std::array<VkDynamicState, 2> dynamicStates = { VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR };

    VkPipelineDynamicStateCreateInfo dynamicState{};
    dynamicState.sType = VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO;
    dynamicState.dynamicStateCount = static_cast<uint32_t>(dynamicStates.size());
    dynamicState.pDynamicStates = dynamicStates.data();

    VkPipelineViewportStateCreateInfo viewportState{};
    viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
    viewportState.viewportCount = 1;
    viewportState.scissorCount = 1;

    VkPipelineRasterizationStateCreateInfo rasterizer{};
    rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
    rasterizer.depthClampEnable = VK_FALSE;
    rasterizer.rasterizerDiscardEnable = VK_FALSE;
    rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
    rasterizer.lineWidth = 1.0f;
    rasterizer.cullMode = VK_CULL_MODE_NONE;
    rasterizer.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    rasterizer.depthBiasEnable = VK_FALSE;

    VkPipelineMultisampleStateCreateInfo multisampling{};
    multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
    multisampling.sampleShadingEnable = VK_FALSE;
    multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

    VkPipelineDepthStencilStateCreateInfo depthStencil{};
    depthStencil.sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
    depthStencil.depthTestEnable = VK_FALSE;
    depthStencil.depthWriteEnable = VK_FALSE;
    depthStencil.depthCompareOp = VK_COMPARE_OP_ALWAYS;
    depthStencil.depthBoundsTestEnable = VK_FALSE;
    depthStencil.stencilTestEnable = VK_FALSE;

    VkPipelineColorBlendAttachmentState colorBlendAttachment{};
    colorBlendAttachment.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
        VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
    colorBlendAttachment.blendEnable = VK_FALSE;

    VkPipelineColorBlendStateCreateInfo colorBlending{};
    colorBlending.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
    colorBlending.logicOpEnable = VK_FALSE;
    colorBlending.attachmentCount = 1;
    colorBlending.pAttachments = &colorBlendAttachment;

    VkPushConstantRange pushConstantRange{};
    pushConstantRange.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
    pushConstantRange.offset = 0;
    pushConstantRange.size = sizeof(SSAOPushConstants);

    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &ssaoDescriptorSetLayout;
    pipelineLayoutInfo.pushConstantRangeCount = 1;
    pipelineLayoutInfo.pPushConstantRanges = &pushConstantRange;

    VkResult result = vkCreatePipelineLayout(device, &pipelineLayoutInfo, nullptr, &ssaoPipelineLayout);
    checkVulkanError(result, "ssao pipeline layout");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create ssao pipeline layout!");
    }

    VkGraphicsPipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
    pipelineInfo.stageCount = 2;
    pipelineInfo.pStages = shaderStages;
    pipelineInfo.pVertexInputState = &vertexInputInfo;
    pipelineInfo.pInputAssemblyState = &inputAssembly;
    pipelineInfo.pViewportState = &viewportState;
    pipelineInfo.pRasterizationState = &rasterizer;
    pipelineInfo.pMultisampleState = &multisampling;
    pipelineInfo.pDepthStencilState = &depthStencil;
    pipelineInfo.pColorBlendState = &colorBlending;
    pipelineInfo.pDynamicState = &dynamicState;
    pipelineInfo.layout = ssaoPipelineLayout;
    pipelineInfo.renderPass = ssaoRenderPass;
    pipelineInfo.subpass = 0;
    pipelineInfo.basePipelineHandle = VK_NULL_HANDLE;

    result = vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &ssaoPipeline);
    checkVulkanError(result, "ssao pipeline");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create ssao pipeline!");
    }

    if (vertShaderModule) vkDestroyShaderModule(device, vertShaderModule, nullptr);
    if (fragShaderModule) vkDestroyShaderModule(device, fragShaderModule, nullptr);
}

void VulkanRenderer::createBlurPipeline() {
    auto vertShaderCode = readFile("shaders/blur.vert.spv");
    auto fragShaderCode = readFile("shaders/blur.frag.spv");

    VkShaderModule vertShaderModule = createShaderModule(vertShaderCode);
    VkShaderModule fragShaderModule = createShaderModule(fragShaderCode);

    VkPipelineShaderStageCreateInfo vertShaderStageInfo{};
    vertShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    vertShaderStageInfo.stage = VK_SHADER_STAGE_VERTEX_BIT;
    vertShaderStageInfo.module = vertShaderModule;
    vertShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo fragShaderStageInfo{};
    fragShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    fragShaderStageInfo.stage = VK_SHADER_STAGE_FRAGMENT_BIT;
    fragShaderStageInfo.module = fragShaderModule;
    fragShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo shaderStages[] = { vertShaderStageInfo, fragShaderStageInfo };

    VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
    vertexInputInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
    vertexInputInfo.vertexBindingDescriptionCount = 0;
    vertexInputInfo.vertexAttributeDescriptionCount = 0;

    VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
    inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
    inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    inputAssembly.primitiveRestartEnable = VK_FALSE;

    std::array<VkDynamicState, 2> dynamicStates = { VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR };

    VkPipelineDynamicStateCreateInfo dynamicState{};
    dynamicState.sType = VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO;
    dynamicState.dynamicStateCount = static_cast<uint32_t>(dynamicStates.size());
    dynamicState.pDynamicStates = dynamicStates.data();

    VkPipelineViewportStateCreateInfo viewportState{};
    viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
    viewportState.viewportCount = 1;
    viewportState.scissorCount = 1;

    VkPipelineRasterizationStateCreateInfo rasterizer{};
    rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
    rasterizer.depthClampEnable = VK_FALSE;
    rasterizer.rasterizerDiscardEnable = VK_FALSE;
    rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
    rasterizer.lineWidth = 1.0f;
    rasterizer.cullMode = VK_CULL_MODE_NONE;
    rasterizer.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    rasterizer.depthBiasEnable = VK_FALSE;

    VkPipelineMultisampleStateCreateInfo multisampling{};
    multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
    multisampling.sampleShadingEnable = VK_FALSE;
    multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

    VkPipelineDepthStencilStateCreateInfo depthStencil{};
    depthStencil.sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
    depthStencil.depthTestEnable = VK_FALSE;
    depthStencil.depthWriteEnable = VK_FALSE;
    depthStencil.depthCompareOp = VK_COMPARE_OP_ALWAYS;
    depthStencil.depthBoundsTestEnable = VK_FALSE;
    depthStencil.stencilTestEnable = VK_FALSE;

    VkPipelineColorBlendAttachmentState colorBlendAttachment{};
    colorBlendAttachment.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
        VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
    colorBlendAttachment.blendEnable = VK_FALSE;

    VkPipelineColorBlendStateCreateInfo colorBlending{};
    colorBlending.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
    colorBlending.logicOpEnable = VK_FALSE;
    colorBlending.attachmentCount = 1;
    colorBlending.pAttachments = &colorBlendAttachment;

    struct BlurPushConstants {
        Vec2 screenSize;
        float blurRadius;
        float edgeSharpness;
    };

    VkPushConstantRange pushConstantRange{};
    pushConstantRange.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
    pushConstantRange.offset = 0;
    pushConstantRange.size = sizeof(BlurPushConstants);

    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &blurDescriptorSetLayout;
    pipelineLayoutInfo.pushConstantRangeCount = 1;
    pipelineLayoutInfo.pPushConstantRanges = &pushConstantRange;

    VkResult result = vkCreatePipelineLayout(device, &pipelineLayoutInfo, nullptr, &blurPipelineLayout);
    checkVulkanError(result, "blur pipeline layout");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create blur pipeline layout!");
    }

    VkGraphicsPipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
    pipelineInfo.stageCount = 2;
    pipelineInfo.pStages = shaderStages;
    pipelineInfo.pVertexInputState = &vertexInputInfo;
    pipelineInfo.pInputAssemblyState = &inputAssembly;
    pipelineInfo.pViewportState = &viewportState;
    pipelineInfo.pRasterizationState = &rasterizer;
    pipelineInfo.pMultisampleState = &multisampling;
    pipelineInfo.pDepthStencilState = &depthStencil;
    pipelineInfo.pColorBlendState = &colorBlending;
    pipelineInfo.pDynamicState = &dynamicState;
    pipelineInfo.layout = blurPipelineLayout;
    pipelineInfo.renderPass = blurRenderPass;
    pipelineInfo.subpass = 0;
    pipelineInfo.basePipelineHandle = VK_NULL_HANDLE;

    result = vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &blurPipeline);
    checkVulkanError(result, "blur pipeline");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create blur pipeline!");
    }

    if (vertShaderModule) vkDestroyShaderModule(device, vertShaderModule, nullptr);
    if (fragShaderModule) vkDestroyShaderModule(device, fragShaderModule, nullptr);
}

void VulkanRenderer::createReflectionPipeline() {
    auto vertShaderCode = readFile("shaders/reflection.vert.spv");
    auto fragShaderCode = readFile("shaders/reflection.frag.spv");

    VkShaderModule vertShaderModule = createShaderModule(vertShaderCode);
    VkShaderModule fragShaderModule = createShaderModule(fragShaderCode);

    VkPipelineShaderStageCreateInfo vertShaderStageInfo{};
    vertShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    vertShaderStageInfo.stage = VK_SHADER_STAGE_VERTEX_BIT;
    vertShaderStageInfo.module = vertShaderModule;
    vertShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo fragShaderStageInfo{};
    fragShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    fragShaderStageInfo.stage = VK_SHADER_STAGE_FRAGMENT_BIT;
    fragShaderStageInfo.module = fragShaderModule;
    fragShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo shaderStages[] = { vertShaderStageInfo, fragShaderStageInfo };

    VkVertexInputBindingDescription bindingDescription{};
    bindingDescription.binding = 0;
    bindingDescription.stride = sizeof(Vertex);
    bindingDescription.inputRate = VK_VERTEX_INPUT_RATE_VERTEX;

    std::array<VkVertexInputAttributeDescription, 4> attributeDescriptions{};
    attributeDescriptions[0].binding = 0;
    attributeDescriptions[0].location = 0;
    attributeDescriptions[0].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[0].offset = offsetof(Vertex, position);

    attributeDescriptions[1].binding = 0;
    attributeDescriptions[1].location = 1;
    attributeDescriptions[1].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[1].offset = offsetof(Vertex, normal);

    attributeDescriptions[2].binding = 0;
    attributeDescriptions[2].location = 2;
    attributeDescriptions[2].format = VK_FORMAT_R32G32B32_SFLOAT;
    attributeDescriptions[2].offset = offsetof(Vertex, color);

    attributeDescriptions[3].binding = 0;
    attributeDescriptions[3].location = 3;
    attributeDescriptions[3].format = VK_FORMAT_R32G32_SFLOAT;
    attributeDescriptions[3].offset = offsetof(Vertex, uv);

    VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
    vertexInputInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
    vertexInputInfo.vertexBindingDescriptionCount = 1;
    vertexInputInfo.pVertexBindingDescriptions = &bindingDescription;
    vertexInputInfo.vertexAttributeDescriptionCount = static_cast<uint32_t>(attributeDescriptions.size());
    vertexInputInfo.pVertexAttributeDescriptions = attributeDescriptions.data();

    VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
    inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
    inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    inputAssembly.primitiveRestartEnable = VK_FALSE;

    std::array<VkDynamicState, 2> dynamicStates = { VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR };

    VkPipelineDynamicStateCreateInfo dynamicState{};
    dynamicState.sType = VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO;
    dynamicState.dynamicStateCount = static_cast<uint32_t>(dynamicStates.size());
    dynamicState.pDynamicStates = dynamicStates.data();

    VkPipelineViewportStateCreateInfo viewportState{};
    viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
    viewportState.viewportCount = 1;
    viewportState.scissorCount = 1;

    VkPipelineRasterizationStateCreateInfo rasterizer{};
    rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
    rasterizer.depthClampEnable = VK_FALSE;
    rasterizer.rasterizerDiscardEnable = VK_FALSE;
    rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
    rasterizer.lineWidth = 1.0f;
    rasterizer.cullMode = VK_CULL_MODE_BACK_BIT;
    rasterizer.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    rasterizer.depthBiasEnable = VK_FALSE;

    VkPipelineMultisampleStateCreateInfo multisampling{};
    multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
    multisampling.sampleShadingEnable = VK_FALSE;
    multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

    VkPipelineDepthStencilStateCreateInfo depthStencil{};
    depthStencil.sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
    depthStencil.depthTestEnable = VK_TRUE;
    depthStencil.depthWriteEnable = VK_TRUE;
    depthStencil.depthCompareOp = VK_COMPARE_OP_LESS;
    depthStencil.depthBoundsTestEnable = VK_FALSE;
    depthStencil.stencilTestEnable = VK_FALSE;

    VkPipelineColorBlendAttachmentState colorBlendAttachment{};
    colorBlendAttachment.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
        VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
    colorBlendAttachment.blendEnable = VK_FALSE;

    VkPipelineColorBlendStateCreateInfo colorBlending{};
    colorBlending.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
    colorBlending.logicOpEnable = VK_FALSE;
    colorBlending.attachmentCount = 1;
    colorBlending.pAttachments = &colorBlendAttachment;

    VkPushConstantRange pushConstantRange{};
    pushConstantRange.stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
    pushConstantRange.offset = 0;
    pushConstantRange.size = sizeof(PushConstants);

    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &descriptorSetLayout;
    pipelineLayoutInfo.pushConstantRangeCount = 1;
    pipelineLayoutInfo.pPushConstantRanges = &pushConstantRange;

    VkPipelineLayout reflectionPipelineLayout;
    VkResult result = vkCreatePipelineLayout(device, &pipelineLayoutInfo, nullptr, &reflectionPipelineLayout);
    checkVulkanError(result, "reflection pipeline layout");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create reflection pipeline layout!");
    }

    VkPipelineRasterizationStateCreateInfo rasterizerWithClip = rasterizer;
    rasterizerWithClip.rasterizerDiscardEnable = VK_FALSE;

    VkGraphicsPipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
    pipelineInfo.stageCount = 2;
    pipelineInfo.pStages = shaderStages;
    pipelineInfo.pVertexInputState = &vertexInputInfo;
    pipelineInfo.pInputAssemblyState = &inputAssembly;
    pipelineInfo.pViewportState = &viewportState;
    pipelineInfo.pRasterizationState = &rasterizerWithClip;
    pipelineInfo.pMultisampleState = &multisampling;
    pipelineInfo.pDepthStencilState = &depthStencil;
    pipelineInfo.pColorBlendState = &colorBlending;
    pipelineInfo.pDynamicState = &dynamicState;
    pipelineInfo.layout = reflectionPipelineLayout;
    pipelineInfo.renderPass = reflectionRenderPass;
    pipelineInfo.subpass = 0;
    pipelineInfo.basePipelineHandle = VK_NULL_HANDLE;

    pipelineInfo.pNext = nullptr;

    result = vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &reflectionPipeline);
    checkVulkanError(result, "reflection pipeline");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create reflection pipeline!");
    }

    vkDestroyPipelineLayout(device, reflectionPipelineLayout, nullptr);

    if (vertShaderModule) vkDestroyShaderModule(device, vertShaderModule, nullptr);
    if (fragShaderModule) vkDestroyShaderModule(device, fragShaderModule, nullptr);
}

void VulkanRenderer::createPostprocessPipeline() {
    auto vertShaderCode = readFile("shaders/postprocess.vert.spv");
    auto fragShaderCode = readFile("shaders/postprocess.frag.spv");

    VkShaderModule vertShaderModule = createShaderModule(vertShaderCode);
    VkShaderModule fragShaderModule = createShaderModule(fragShaderCode);

    VkPipelineShaderStageCreateInfo vertShaderStageInfo{};
    vertShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    vertShaderStageInfo.stage = VK_SHADER_STAGE_VERTEX_BIT;
    vertShaderStageInfo.module = vertShaderModule;
    vertShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo fragShaderStageInfo{};
    fragShaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    fragShaderStageInfo.stage = VK_SHADER_STAGE_FRAGMENT_BIT;
    fragShaderStageInfo.module = fragShaderModule;
    fragShaderStageInfo.pName = "main";

    VkPipelineShaderStageCreateInfo shaderStages[] = { vertShaderStageInfo, fragShaderStageInfo };

    VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
    vertexInputInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
    vertexInputInfo.vertexBindingDescriptionCount = 0;
    vertexInputInfo.vertexAttributeDescriptionCount = 0;

    VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
    inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
    inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    inputAssembly.primitiveRestartEnable = VK_FALSE;

    std::array<VkDynamicState, 2> dynamicStates = { VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR };

    VkPipelineDynamicStateCreateInfo dynamicState{};
    dynamicState.sType = VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO;
    dynamicState.dynamicStateCount = static_cast<uint32_t>(dynamicStates.size());
    dynamicState.pDynamicStates = dynamicStates.data();

    VkPipelineViewportStateCreateInfo viewportState{};
    viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
    viewportState.viewportCount = 1;
    viewportState.scissorCount = 1;

    VkPipelineRasterizationStateCreateInfo rasterizer{};
    rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
    rasterizer.depthClampEnable = VK_FALSE;
    rasterizer.rasterizerDiscardEnable = VK_FALSE;
    rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
    rasterizer.lineWidth = 1.0f;
    rasterizer.cullMode = VK_CULL_MODE_NONE;
    rasterizer.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    rasterizer.depthBiasEnable = VK_FALSE;

    VkPipelineMultisampleStateCreateInfo multisampling{};
    multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
    multisampling.sampleShadingEnable = VK_FALSE;
    multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

    VkPipelineDepthStencilStateCreateInfo depthStencil{};
    depthStencil.sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
    depthStencil.depthTestEnable = VK_FALSE;
    depthStencil.depthWriteEnable = VK_FALSE;
    depthStencil.depthCompareOp = VK_COMPARE_OP_ALWAYS;
    depthStencil.depthBoundsTestEnable = VK_FALSE;
    depthStencil.stencilTestEnable = VK_FALSE;

    VkPipelineColorBlendAttachmentState colorBlendAttachment{};
    colorBlendAttachment.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
        VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
    colorBlendAttachment.blendEnable = VK_FALSE;

    VkPipelineColorBlendStateCreateInfo colorBlending{};
    colorBlending.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
    colorBlending.logicOpEnable = VK_FALSE;
    colorBlending.attachmentCount = 1;
    colorBlending.pAttachments = &colorBlendAttachment;

    VkPushConstantRange pushConstantRange{};
    pushConstantRange.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
    pushConstantRange.offset = 0;
    pushConstantRange.size = sizeof(PostprocessPushConstants);

    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &postprocessDescriptorSetLayout;
    pipelineLayoutInfo.pushConstantRangeCount = 1;
    pipelineLayoutInfo.pPushConstantRanges = &pushConstantRange;

    VkResult result = vkCreatePipelineLayout(device, &pipelineLayoutInfo, nullptr, &postprocessPipelineLayout);
    checkVulkanError(result, "postprocess pipeline layout");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create postprocess pipeline layout!");
    }

    VkGraphicsPipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
    pipelineInfo.stageCount = 2;
    pipelineInfo.pStages = shaderStages;
    pipelineInfo.pVertexInputState = &vertexInputInfo;
    pipelineInfo.pInputAssemblyState = &inputAssembly;
    pipelineInfo.pViewportState = &viewportState;
    pipelineInfo.pRasterizationState = &rasterizer;
    pipelineInfo.pMultisampleState = &multisampling;
    pipelineInfo.pDepthStencilState = &depthStencil;
    pipelineInfo.pColorBlendState = &colorBlending;
    pipelineInfo.pDynamicState = &dynamicState;
    pipelineInfo.layout = postprocessPipelineLayout;
    pipelineInfo.renderPass = postprocessRenderPass;
    pipelineInfo.subpass = 0;
    pipelineInfo.basePipelineHandle = VK_NULL_HANDLE;

    result = vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &postprocessPipeline);
    checkVulkanError(result, "postprocess pipeline");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create postprocess pipeline!");
    }

    if (vertShaderModule) vkDestroyShaderModule(device, vertShaderModule, nullptr);
    if (fragShaderModule) vkDestroyShaderModule(device, fragShaderModule, nullptr);
}

void VulkanRenderer::createGBufferResources() {
    VkFormat colorFormat = VK_FORMAT_R16G16B16A16_SFLOAT;
    VkFormat depthFormat = findDepthFormat();

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        colorFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        gbuffer.positionImage, gbuffer.positionMemory
    );
    gbuffer.positionView = createImageView(gbuffer.positionImage, colorFormat, VK_IMAGE_ASPECT_COLOR_BIT);

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        colorFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        gbuffer.normalImage, gbuffer.normalMemory
    );
    gbuffer.normalView = createImageView(gbuffer.normalImage, colorFormat, VK_IMAGE_ASPECT_COLOR_BIT);

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        colorFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        gbuffer.albedoImage, gbuffer.albedoMemory
    );
    gbuffer.albedoView = createImageView(gbuffer.albedoImage, colorFormat, VK_IMAGE_ASPECT_COLOR_BIT);

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        depthFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        gbuffer.depthImage, gbuffer.depthMemory
    );
    gbuffer.depthView = createImageView(gbuffer.depthImage, depthFormat, VK_IMAGE_ASPECT_DEPTH_BIT);

    std::array<VkImageView, 4> attachments = {
        gbuffer.positionView,
        gbuffer.normalView,
        gbuffer.albedoView,
        gbuffer.depthView
    };

    VkFramebufferCreateInfo framebufferInfo{};
    framebufferInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
    framebufferInfo.renderPass = gbufferRenderPass;
    framebufferInfo.attachmentCount = static_cast<uint32_t>(attachments.size());
    framebufferInfo.pAttachments = attachments.data();
    framebufferInfo.width = swapChainExtent.width;
    framebufferInfo.height = swapChainExtent.height;
    framebufferInfo.layers = 1;

    VkResult result = vkCreateFramebuffer(device, &framebufferInfo, nullptr, &gbuffer.framebuffer);
    checkVulkanError(result, "gbuffer framebuffer");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create G-buffer framebuffer!");
    }
}

void VulkanRenderer::createSSAOResources() {
    VkFormat ssaoFormat = VK_FORMAT_R8_UNORM;
    VkFormat noiseFormat = VK_FORMAT_R8G8B8A8_SNORM;

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        ssaoFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        ssao.ssaoImage, ssao.ssaoMemory
    );
    ssao.ssaoView = createImageView(ssao.ssaoImage, ssaoFormat, VK_IMAGE_ASPECT_COLOR_BIT);

    {
        VkFramebufferCreateInfo framebufferInfo{};
        framebufferInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
        framebufferInfo.renderPass = ssaoRenderPass;
        framebufferInfo.attachmentCount = 1;
        framebufferInfo.pAttachments = &ssao.ssaoView;
        framebufferInfo.width = swapChainExtent.width;
        framebufferInfo.height = swapChainExtent.height;
        framebufferInfo.layers = 1;

        VkResult result = vkCreateFramebuffer(device, &framebufferInfo, nullptr, &ssao.ssaoFramebuffer);
        checkVulkanError(result, "ssao framebuffer");
        if (result != VK_SUCCESS) {
            throw std::runtime_error("Failed to create SSAO framebuffer!");
        }
    }

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        ssaoFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        ssao.blurImage, ssao.blurMemory
    );
    ssao.blurView = createImageView(ssao.blurImage, ssaoFormat, VK_IMAGE_ASPECT_COLOR_BIT);

    {
        VkFramebufferCreateInfo framebufferInfo{};
        framebufferInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
        framebufferInfo.renderPass = blurRenderPass;
        framebufferInfo.attachmentCount = 1;
        framebufferInfo.pAttachments = &ssao.blurView;
        framebufferInfo.width = swapChainExtent.width;
        framebufferInfo.height = swapChainExtent.height;
        framebufferInfo.layers = 1;

        VkResult result = vkCreateFramebuffer(device, &framebufferInfo, nullptr, &ssao.blurFramebuffer);
        checkVulkanError(result, "blur framebuffer");
        if (result != VK_SUCCESS) {
            throw std::runtime_error("Failed to create blur framebuffer!");
        }
    }

    createImage(
        4, 4,
        noiseFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        ssao.noiseImage, ssao.noiseMemory
    );
    ssao.noiseView = createImageView(ssao.noiseImage, noiseFormat, VK_IMAGE_ASPECT_COLOR_BIT);
}

void VulkanRenderer::createReflectionResources() {
    VkFormat colorFormat = VK_FORMAT_R16G16B16A16_SFLOAT;
    VkFormat depthFormat = findDepthFormat();

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        colorFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        reflection.reflectionImage, reflection.reflectionMemory
    );
    reflection.reflectionView = createImageView(reflection.reflectionImage, colorFormat, VK_IMAGE_ASPECT_COLOR_BIT);

    createImage(
        swapChainExtent.width, swapChainExtent.height,
        depthFormat,
        VK_IMAGE_TILING_OPTIMAL,
        VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        reflection.depthImage, reflection.depthMemory
    );
    reflection.depthView = createImageView(reflection.depthImage, depthFormat, VK_IMAGE_ASPECT_DEPTH_BIT);

    std::array<VkImageView, 2> attachments = {
        reflection.reflectionView,
        reflection.depthView
    };

    VkFramebufferCreateInfo framebufferInfo{};
    framebufferInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
    framebufferInfo.renderPass = reflectionRenderPass;
    framebufferInfo.attachmentCount = static_cast<uint32_t>(attachments.size());
    framebufferInfo.pAttachments = attachments.data();
    framebufferInfo.width = swapChainExtent.width;
    framebufferInfo.height = swapChainExtent.height;
    framebufferInfo.layers = 1;

    VkResult result = vkCreateFramebuffer(device, &framebufferInfo, nullptr, &reflection.framebuffer);
    checkVulkanError(result, "reflection framebuffer");
    if (result != VK_SUCCESS) {
        throw std::runtime_error("Failed to create reflection framebuffer!");
    }
}

void VulkanRenderer::createPostprocessFramebuffer() {
    std::vector<VkFramebuffer> framebuffers(swapChainImageViews.size());

    for (size_t i = 0; i < swapChainImageViews.size(); i++) {
        VkFramebufferCreateInfo framebufferInfo{};
        framebufferInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
        framebufferInfo.renderPass = postprocessRenderPass;
        framebufferInfo.attachmentCount = 1;
        framebufferInfo.pAttachments = &swapChainImageViews[i];
        framebufferInfo.width = swapChainExtent.width;
        framebufferInfo.height = swapChainExtent.height;
        framebufferInfo.layers = 1;

        VkResult result = vkCreateFramebuffer(device, &framebufferInfo, nullptr, &framebuffers[i]);
        checkVulkanError(result, "postprocess framebuffer");
        if (result != VK_SUCCESS) {
            throw std::runtime_error("Failed to create postprocess framebuffer!");
        }
    }

    postprocess.framebuffers = framebuffers;
}

void VulkanRenderer::generateSSAOKernel() {
    std::uniform_real_distribution<float> randomFloats(0.0f, 1.0f);
    std::default_random_engine generator;

    ssao.ssaoKernel.resize(64);
    for (size_t i = 0; i < 64; i++) {
        Vec3 sample(
            randomFloats(generator) * 2.0f - 1.0f,
            randomFloats(generator) * 2.0f - 1.0f,
            randomFloats(generator)
        );
        sample.normalize();

        float scale = static_cast<float>(i) / 64.0f;
        scale = 0.1f + scale * scale * 0.9f;
        sample *= scale;

        ssao.ssaoKernel[i] = sample;
    }
}

void VulkanRenderer::generateSSAONoiseTexture() {
    std::uniform_real_distribution<float> randomFloats(-1.0f, 1.0f);
    std::default_random_engine generator;

    std::array<char, 4 * 4 * 4> noiseData;
    for (size_t i = 0; i < 16; i++) {
        noiseData[i * 4 + 0] = static_cast<char>(randomFloats(generator) * 127.0f);
        noiseData[i * 4 + 1] = static_cast<char>(randomFloats(generator) * 127.0f);
        noiseData[i * 4 + 2] = static_cast<char>(randomFloats(generator) * 127.0f);
        noiseData[i * 4 + 3] = 0;
    }

    VkBuffer stagingBuffer;
    VkDeviceMemory stagingBufferMemory;
    createBuffer(
        noiseData.size(),
        VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
        stagingBuffer, stagingBufferMemory
    );

    void* data;
    vkMapMemory(device, stagingBufferMemory, 0, noiseData.size(), 0, &data);
    memcpy(data, noiseData.data(), noiseData.size());
    vkUnmapMemory(device, stagingBufferMemory);

    transitionImageLayout(
        ssao.noiseImage,
        VK_FORMAT_R8G8B8A8_SNORM,
        VK_IMAGE_LAYOUT_UNDEFINED,
        VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL
    );

    copyBufferToImage(stagingBuffer, ssao.noiseImage, 4, 4);

    transitionImageLayout(
        ssao.noiseImage,
        VK_FORMAT_R8G8B8A8_SNORM,
        VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL
    );

    vkDestroyBuffer(device, stagingBuffer, nullptr);
    vkFreeMemory(device, stagingBufferMemory, nullptr);
}

void VulkanRenderer::uploadSSAOKernel() {
    VkDeviceSize bufferSize = sizeof(Vec3) * ssao.ssaoKernel.size();

    createBuffer(
        bufferSize,
        VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
        ssao.kernelBuffer, ssao.kernelMemory
    );

    void* data;
    vkMapMemory(device, ssao.kernelMemory, 0, bufferSize, 0, &data);
    memcpy(data, ssao.ssaoKernel.data(), bufferSize);
    vkUnmapMemory(device, ssao.kernelMemory);
}

void VulkanRenderer::recordGBufferCommandBuffer(VkCommandBuffer commandBuffer, const std::vector<RenderChunk>& chunks) {
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;

    if (vkBeginCommandBuffer(commandBuffer, &beginInfo) != VK_SUCCESS) {
        return;
    }

    VkRenderPassBeginInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
    renderPassInfo.renderPass = gbufferRenderPass;
    renderPassInfo.framebuffer = gbuffer.framebuffer;
    renderPassInfo.renderArea.offset = { 0, 0 };
    renderPassInfo.renderArea.extent = swapChainExtent;

    std::array<VkClearValue, 4> clearValues{};
    clearValues[0].color = { {0.0f, 0.0f, 0.0f, 1.0f} };
    clearValues[1].color = { {0.0f, 0.0f, 0.0f, 1.0f} };
    clearValues[2].color = { {0.0f, 0.0f, 0.0f, 1.0f} };
    clearValues[3].depthStencil = { 1.0f, 0 };

    renderPassInfo.clearValueCount = static_cast<uint32_t>(clearValues.size());
    renderPassInfo.pClearValues = clearValues.data();

    vkCmdBeginRenderPass(commandBuffer, &renderPassInfo, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, gbufferPipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, gbufferPipelineLayout, 0, 1, &perFrame[currentFrame].descriptorSet, 0, nullptr);

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = static_cast<float>(swapChainExtent.width);
    viewport.height = static_cast<float>(swapChainExtent.height);
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;
    vkCmdSetViewport(commandBuffer, 0, 1, &viewport);

    VkRect2D scissor{};
    scissor.offset = { 0, 0 };
    scissor.extent = swapChainExtent;
    vkCmdSetScissor(commandBuffer, 0, 1, &scissor);

    for (const auto& rc : chunks) {
        if (!rc.visible) continue;

        ChunkMeshKey key{ rc.chunk->position, static_cast<int>(rc.lod) };
        auto it = chunkMeshes.find(key);
        if (it == chunkMeshes.end() || !it->second.uploaded || it->second.indexCount == 0) continue;

        const auto& mesh = it->second;

        PushConstants pc{};
        pc.model = Mat4::identity();
        pc.baseColor = Vec3(1.0f);
        pc.lodLevel = static_cast<float>(rc.lod);

        vkCmdPushConstants(commandBuffer, gbufferPipelineLayout,
            VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT,
            0, sizeof(PushConstants), &pc);

        VkBuffer vertexBuffers[] = { mesh.vertexBuffer };
        VkDeviceSize offsets[] = { 0 };
        vkCmdBindVertexBuffers(commandBuffer, 0, 1, vertexBuffers, offsets);
        vkCmdBindIndexBuffer(commandBuffer, mesh.indexBuffer, 0, VK_INDEX_TYPE_UINT32);
        vkCmdDrawIndexed(commandBuffer, mesh.indexCount, 1, 0, 0, 0);
    }

    vkCmdEndRenderPass(commandBuffer);

    if (vkEndCommandBuffer(commandBuffer) != VK_SUCCESS) {
        return;
    }
}

void VulkanRenderer::recordSSAOCommandBuffer(VkCommandBuffer commandBuffer) {
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;

    if (vkBeginCommandBuffer(commandBuffer, &beginInfo) != VK_SUCCESS) {
        return;
    }

    VkRenderPassBeginInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
    renderPassInfo.renderPass = ssaoRenderPass;
    renderPassInfo.framebuffer = ssao.ssaoFramebuffer;
    renderPassInfo.renderArea.offset = { 0, 0 };
    renderPassInfo.renderArea.extent = swapChainExtent;

    VkClearValue clearValue;
    clearValue.color = { {1.0f, 1.0f, 1.0f, 1.0f} };
    renderPassInfo.clearValueCount = 1;
    renderPassInfo.pClearValues = &clearValue;

    vkCmdBeginRenderPass(commandBuffer, &renderPassInfo, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, ssaoPipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, ssaoPipelineLayout, 0, 1, &perFrameDescriptors[currentFrame].ssaoDescriptorSet, 0, nullptr);

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = static_cast<float>(swapChainExtent.width);
    viewport.height = static_cast<float>(swapChainExtent.height);
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;
    vkCmdSetViewport(commandBuffer, 0, 1, &viewport);

    VkRect2D scissor{};
    scissor.offset = { 0, 0 };
    scissor.extent = swapChainExtent;
    vkCmdSetScissor(commandBuffer, 0, 1, &scissor);

    SSAOPushConstants ssaoPc = ssaoParams;
    vkCmdPushConstants(commandBuffer, ssaoPipelineLayout, VK_SHADER_STAGE_FRAGMENT_BIT, 0, sizeof(SSAOPushConstants), &ssaoPc);

    vkCmdDraw(commandBuffer, 6, 1, 0, 0);

    vkCmdEndRenderPass(commandBuffer);

    if (vkEndCommandBuffer(commandBuffer) != VK_SUCCESS) {
        return;
    }
}

void VulkanRenderer::recordBlurCommandBuffer(VkCommandBuffer commandBuffer) {
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;

    if (vkBeginCommandBuffer(commandBuffer, &beginInfo) != VK_SUCCESS) {
        return;
    }

    VkRenderPassBeginInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
    renderPassInfo.renderPass = blurRenderPass;
    renderPassInfo.framebuffer = ssao.blurFramebuffer;
    renderPassInfo.renderArea.offset = { 0, 0 };
    renderPassInfo.renderArea.extent = swapChainExtent;

    VkClearValue clearValue;
    clearValue.color = { {1.0f, 1.0f, 1.0f, 1.0f} };
    renderPassInfo.clearValueCount = 1;
    renderPassInfo.pClearValues = &clearValue;

    vkCmdBeginRenderPass(commandBuffer, &renderPassInfo, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, blurPipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, blurPipelineLayout, 0, 1, &perFrameDescriptors[currentFrame].blurDescriptorSet, 0, nullptr);

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = static_cast<float>(swapChainExtent.width);
    viewport.height = static_cast<float>(swapChainExtent.height);
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;
    vkCmdSetViewport(commandBuffer, 0, 1, &viewport);

    VkRect2D scissor{};
    scissor.offset = { 0, 0 };
    scissor.extent = swapChainExtent;
    vkCmdSetScissor(commandBuffer, 0, 1, &scissor);

    struct BlurPushConstants {
        Vec2 screenSize;
        float blurRadius;
        float edgeSharpness;
    };

    BlurPushConstants blurPc{};
    blurPc.screenSize = Vec2(static_cast<float>(swapChainExtent.width), static_cast<float>(swapChainExtent.height));
    blurPc.blurRadius = 2.0f;
    blurPc.edgeSharpness = 2.0f;
    vkCmdPushConstants(commandBuffer, blurPipelineLayout, VK_SHADER_STAGE_FRAGMENT_BIT, 0, sizeof(BlurPushConstants), &blurPc);

    vkCmdDraw(commandBuffer, 6, 1, 0, 0);

    vkCmdEndRenderPass(commandBuffer);

    if (vkEndCommandBuffer(commandBuffer) != VK_SUCCESS) {
        return;
    }
}

void VulkanRenderer::recordReflectionCommandBuffer(VkCommandBuffer commandBuffer, const std::vector<RenderChunk>& chunks) {
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;

    if (vkBeginCommandBuffer(commandBuffer, &beginInfo) != VK_SUCCESS) {
        return;
    }

    VkRenderPassBeginInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
    renderPassInfo.renderPass = reflectionRenderPass;
    renderPassInfo.framebuffer = reflection.framebuffer;
    renderPassInfo.renderArea.offset = { 0, 0 };
    renderPassInfo.renderArea.extent = swapChainExtent;

    std::array<VkClearValue, 2> clearValues{};
    clearValues[0].color = { {clearColor.x, clearColor.y, clearColor.z, 1.0f} };
    clearValues[1].depthStencil = { 1.0f, 0 };

    renderPassInfo.clearValueCount = static_cast<uint32_t>(clearValues.size());
    renderPassInfo.pClearValues = clearValues.data();

    vkCmdBeginRenderPass(commandBuffer, &renderPassInfo, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, reflectionPipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, pipelineLayout, 0, 1, &perFrame[currentFrame].descriptorSet, 0, nullptr);

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = static_cast<float>(swapChainExtent.height);
    viewport.width = static_cast<float>(swapChainExtent.width);
    viewport.height = -static_cast<float>(swapChainExtent.height);
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;
    vkCmdSetViewport(commandBuffer, 0, 1, &viewport);

    VkRect2D scissor{};
    scissor.offset = { 0, 0 };
    scissor.extent = swapChainExtent;
    vkCmdSetScissor(commandBuffer, 0, 1, &scissor);

    struct ReflectionPushConstants {
        Mat4 model;
        Vec4 clipPlane;
        float lodLevel;
        Vec3 pad;
    };

    for (const auto& rc : chunks) {
        if (!rc.visible) continue;

        float chunkWorldY = static_cast<float>(rc.chunk->position.y * CHUNK_HEIGHT);
        if (chunkWorldY + CHUNK_HEIGHT < postprocessParams.waterLevel) continue;

        ChunkMeshKey key{ rc.chunk->position, static_cast<int>(rc.lod) };
        auto it = chunkMeshes.find(key);
        if (it == chunkMeshes.end() || !it->second.uploaded || it->second.indexCount == 0) continue;

        const auto& mesh = it->second;

        ReflectionPushConstants rpc{};
        rpc.model = Mat4::identity();
        rpc.clipPlane = Vec4(0.0f, -1.0f, 0.0f, postprocessParams.waterLevel);
        rpc.lodLevel = static_cast<float>(rc.lod);

        vkCmdPushConstants(commandBuffer, pipelineLayout,
            VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT,
            0, sizeof(ReflectionPushConstants), &rpc);

        VkBuffer vertexBuffers[] = { mesh.vertexBuffer };
        VkDeviceSize offsets[] = { 0 };
        vkCmdBindVertexBuffers(commandBuffer, 0, 1, vertexBuffers, offsets);
        vkCmdBindIndexBuffer(commandBuffer, mesh.indexBuffer, 0, VK_INDEX_TYPE_UINT32);
        vkCmdDrawIndexed(commandBuffer, mesh.indexCount, 1, 0, 0, 0);
    }

    vkCmdEndRenderPass(commandBuffer);

    if (vkEndCommandBuffer(commandBuffer) != VK_SUCCESS) {
        return;
    }
}

void VulkanRenderer::recordPostprocessCommandBuffer(VkCommandBuffer commandBuffer, uint32_t imageIndex) {
    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;

    if (vkBeginCommandBuffer(commandBuffer, &beginInfo) != VK_SUCCESS) {
        return;
    }

    VkRenderPassBeginInfo renderPassInfo{};
    renderPassInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
    renderPassInfo.renderPass = postprocessRenderPass;
    renderPassInfo.framebuffer = postprocess.framebuffers[imageIndex];
    renderPassInfo.renderArea.offset = { 0, 0 };
    renderPassInfo.renderArea.extent = swapChainExtent;

    VkClearValue clearValue;
    clearValue.color = { {clearColor.x, clearColor.y, clearColor.z, 1.0f} };
    renderPassInfo.clearValueCount = 1;
    renderPassInfo.pClearValues = &clearValue;

    vkCmdBeginRenderPass(commandBuffer, &renderPassInfo, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, postprocessPipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, postprocessPipelineLayout, 0, 1, &perFrameDescriptors[currentFrame].postprocessDescriptorSet, 0, nullptr);

    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = static_cast<float>(swapChainExtent.width);
    viewport.height = static_cast<float>(swapChainExtent.height);
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;
    vkCmdSetViewport(commandBuffer, 0, 1, &viewport);

    VkRect2D scissor{};
    scissor.offset = { 0, 0 };
    scissor.extent = swapChainExtent;
    vkCmdSetScissor(commandBuffer, 0, 1, &scissor);

    PostprocessPushConstants ppPc = postprocessParams;
    vkCmdPushConstants(commandBuffer, postprocessPipelineLayout, VK_SHADER_STAGE_FRAGMENT_BIT, 0, sizeof(PostprocessPushConstants), &ppPc);

    vkCmdDraw(commandBuffer, 6, 1, 0, 0);

    vkCmdEndRenderPass(commandBuffer);

    if (vkEndCommandBuffer(commandBuffer) != VK_SUCCESS) {
        return;
    }
}
