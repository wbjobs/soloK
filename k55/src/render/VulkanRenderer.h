#pragma once
#include <vulkan/vulkan.h>
#include "../math/Vec3.h"
#include "../math/Mat4.h"
#include "../voxel/Chunk.h"
#include "Lighting.h"
#include <vector>
#include <string>
#include <memory>
#include <unordered_map>
#include <optional>
#include <array>

#ifdef VK_USE_PLATFORM_WIN32_KHR
#include <windows.h>
#endif

struct QueueFamilyIndices {
    std::optional<uint32_t> graphicsFamily;
    std::optional<uint32_t> presentFamily;
    std::optional<uint32_t> transferFamily;

    bool isComplete() const {
        return graphicsFamily.has_value() && presentFamily.has_value();
    }
};

struct SwapChainSupportDetails {
    VkSurfaceCapabilitiesKHR capabilities;
    std::vector<VkSurfaceFormatKHR> formats;
    std::vector<VkPresentModeKHR> presentModes;
};

class VulkanRenderer {
public:
    VulkanRenderer() = default;
    ~VulkanRenderer();

    void init(void* windowHandle, uint32_t width, uint32_t height);
    void cleanup();
    void resize(uint32_t width, uint32_t height);
    void beginFrame();
    void endFrame();
    void renderChunks(const std::vector<RenderChunk>& chunks);
    void updateCameraUniforms(const CameraUniforms& uniforms);
    void updateLightUniforms(const LightUniforms& uniforms);

    void setClearColor(const Vec3& color) { clearColor = color; }
    uint32_t getFrameIndex() const { return currentFrame; }
    bool isInitialized() const { return initialized; }
    VkDevice getDevice() const { return device; }

    void setSSAOParams(float radius = 0.5f, float bias = 0.025f, float power = 1.5f, int kernelSize = 64) {
        ssaoParams.radius = radius;
        ssaoParams.bias = bias;
        ssaoParams.power = power;
        ssaoParams.kernelSize = kernelSize;
    }

    void setPostprocessParams(float ssaoStrength = 1.0f, float reflectionStrength = 0.6f, float waterLevel = 0.0f) {
        postprocessParams.ssaoStrength = ssaoStrength;
        postprocessParams.reflectionStrength = reflectionStrength;
        postprocessParams.waterLevel = waterLevel;
    }

    void clearChunkMeshes();

private:
    bool initialized = false;
    uint32_t width = 0;
    uint32_t height = 0;
    uint32_t currentFrame = 0;
    uint32_t currentImageIndex = 0;
    const int MAX_FRAMES_IN_FLIGHT = 2;

    Vec3 clearColor = Vec3(0.5f, 0.7f, 0.9f);

    VkInstance instance = VK_NULL_HANDLE;
    VkDebugUtilsMessengerEXT debugMessenger = VK_NULL_HANDLE;
    VkSurfaceKHR surface = VK_NULL_HANDLE;
    VkPhysicalDevice physicalDevice = VK_NULL_HANDLE;
    VkDevice device = VK_NULL_HANDLE;
    VkQueue graphicsQueue = VK_NULL_HANDLE;
    VkQueue presentQueue = VK_NULL_HANDLE;
    VkSwapchainKHR swapChain = VK_NULL_HANDLE;
    VkFormat swapChainImageFormat;
    VkExtent2D swapChainExtent;
    std::vector<VkImage> swapChainImages;
    std::vector<VkImageView> swapChainImageViews;
    std::vector<VkFramebuffer> swapChainFramebuffers;
    VkRenderPass renderPass = VK_NULL_HANDLE;
    VkRenderPass shadowRenderPass = VK_NULL_HANDLE;
    VkRenderPass gbufferRenderPass = VK_NULL_HANDLE;
    VkRenderPass ssaoRenderPass = VK_NULL_HANDLE;
    VkRenderPass blurRenderPass = VK_NULL_HANDLE;
    VkRenderPass reflectionRenderPass = VK_NULL_HANDLE;
    VkRenderPass postprocessRenderPass = VK_NULL_HANDLE;

    VkDescriptorSetLayout descriptorSetLayout = VK_NULL_HANDLE;
    VkDescriptorSetLayout gbufferDescriptorSetLayout = VK_NULL_HANDLE;
    VkDescriptorSetLayout ssaoDescriptorSetLayout = VK_NULL_HANDLE;
    VkDescriptorSetLayout blurDescriptorSetLayout = VK_NULL_HANDLE;
    VkDescriptorSetLayout postprocessDescriptorSetLayout = VK_NULL_HANDLE;

    VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
    VkPipelineLayout gbufferPipelineLayout = VK_NULL_HANDLE;
    VkPipelineLayout ssaoPipelineLayout = VK_NULL_HANDLE;
    VkPipelineLayout blurPipelineLayout = VK_NULL_HANDLE;
    VkPipelineLayout postprocessPipelineLayout = VK_NULL_HANDLE;

    VkPipeline graphicsPipeline = VK_NULL_HANDLE;
    VkPipeline shadowPipeline = VK_NULL_HANDLE;
    VkPipeline gbufferPipeline = VK_NULL_HANDLE;
    VkPipeline ssaoPipeline = VK_NULL_HANDLE;
    VkPipeline blurPipeline = VK_NULL_HANDLE;
    VkPipeline reflectionPipeline = VK_NULL_HANDLE;
    VkPipeline postprocessPipeline = VK_NULL_HANDLE;

    VkCommandPool commandPool = VK_NULL_HANDLE;
    std::vector<VkCommandBuffer> commandBuffers;
    VkCommandBuffer shadowCommandBuffer = VK_NULL_HANDLE;
    VkCommandBuffer gbufferCommandBuffer = VK_NULL_HANDLE;
    VkCommandBuffer ssaoCommandBuffer = VK_NULL_HANDLE;
    VkCommandBuffer blurCommandBuffer = VK_NULL_HANDLE;
    VkCommandBuffer reflectionCommandBuffer = VK_NULL_HANDLE;
    VkCommandBuffer postprocessCommandBuffer = VK_NULL_HANDLE;

    std::vector<VkSemaphore> imageAvailableSemaphores;
    std::vector<VkSemaphore> shadowFinishedSemaphores;
    std::vector<VkSemaphore> gbufferFinishedSemaphores;
    std::vector<VkSemaphore> ssaoFinishedSemaphores;
    std::vector<VkSemaphore> blurFinishedSemaphores;
    std::vector<VkSemaphore> reflectionFinishedSemaphores;
    std::vector<VkSemaphore> postprocessFinishedSemaphores;
    std::vector<VkSemaphore> renderFinishedSemaphores;
    std::vector<VkFence> inFlightFences;

    struct PerFrameData {
        VkBuffer cameraUniformBuffer = VK_NULL_HANDLE;
        VkDeviceMemory cameraUniformMemory = VK_NULL_HANDLE;
        VkBuffer lightUniformBuffer = VK_NULL_HANDLE;
        VkDeviceMemory lightUniformMemory = VK_NULL_HANDLE;
        VkDescriptorSet descriptorSet = VK_NULL_HANDLE;
    };
    std::array<PerFrameData, 2> perFrame;

    VkDescriptorPool descriptorPool = VK_NULL_HANDLE;

    VkImage depthImage = VK_NULL_HANDLE;
    VkDeviceMemory depthImageMemory = VK_NULL_HANDLE;
    VkImageView depthImageView = VK_NULL_HANDLE;

    const uint32_t SHADOW_MAP_SIZE = 2048;
    VkImage shadowImage = VK_NULL_HANDLE;
    VkDeviceMemory shadowImageMemory = VK_NULL_HANDLE;
    VkImageView shadowImageView = VK_NULL_HANDLE;
    VkFramebuffer shadowFramebuffer = VK_NULL_HANDLE;

    struct GBufferResources {
        VkImage positionImage = VK_NULL_HANDLE;
        VkDeviceMemory positionMemory = VK_NULL_HANDLE;
        VkImageView positionView = VK_NULL_HANDLE;

        VkImage normalImage = VK_NULL_HANDLE;
        VkDeviceMemory normalMemory = VK_NULL_HANDLE;
        VkImageView normalView = VK_NULL_HANDLE;

        VkImage albedoImage = VK_NULL_HANDLE;
        VkDeviceMemory albedoMemory = VK_NULL_HANDLE;
        VkImageView albedoView = VK_NULL_HANDLE;

        VkImage depthImage = VK_NULL_HANDLE;
        VkDeviceMemory depthMemory = VK_NULL_HANDLE;
        VkImageView depthView = VK_NULL_HANDLE;

        VkFramebuffer framebuffer = VK_NULL_HANDLE;
    };
    GBufferResources gbuffer;

    struct SSAOResources {
        VkImage ssaoImage = VK_NULL_HANDLE;
        VkDeviceMemory ssaoMemory = VK_NULL_HANDLE;
        VkImageView ssaoView = VK_NULL_HANDLE;
        VkFramebuffer ssaoFramebuffer = VK_NULL_HANDLE;

        VkImage blurImage = VK_NULL_HANDLE;
        VkDeviceMemory blurMemory = VK_NULL_HANDLE;
        VkImageView blurView = VK_NULL_HANDLE;
        VkFramebuffer blurFramebuffer = VK_NULL_HANDLE;

        VkImage noiseImage = VK_NULL_HANDLE;
        VkDeviceMemory noiseMemory = VK_NULL_HANDLE;
        VkImageView noiseView = VK_NULL_HANDLE;

        VkBuffer kernelBuffer = VK_NULL_HANDLE;
        VkDeviceMemory kernelMemory = VK_NULL_HANDLE;

        std::vector<Vec3> ssaoKernel;
    };
    SSAOResources ssao;

    struct ReflectionResources {
        VkImage reflectionImage = VK_NULL_HANDLE;
        VkDeviceMemory reflectionMemory = VK_NULL_HANDLE;
        VkImageView reflectionView = VK_NULL_HANDLE;

        VkImage depthImage = VK_NULL_HANDLE;
        VkDeviceMemory depthMemory = VK_NULL_HANDLE;
        VkImageView depthView = VK_NULL_HANDLE;

        VkFramebuffer framebuffer = VK_NULL_HANDLE;
    };
    ReflectionResources reflection;

    struct PostprocessResources {
        std::vector<VkFramebuffer> framebuffers;
    };
    PostprocessResources postprocess;

    struct SSAOPushConstants {
        Vec2 screenSize;
        float bias;
        float radius;
        float power;
        int kernelSize;
    } ssaoParams;

    struct PostprocessPushConstants {
        Vec2 screenSize;
        float ssaoStrength;
        float reflectionStrength;
        float waterLevel;
    } postprocessParams;

    struct PerFrameDescriptorSets {
        VkDescriptorSet ssaoDescriptorSet = VK_NULL_HANDLE;
        VkDescriptorSet blurDescriptorSet = VK_NULL_HANDLE;
        VkDescriptorSet postprocessDescriptorSet = VK_NULL_HANDLE;
    };
    std::array<PerFrameDescriptorSets, 2> perFrameDescriptors;

    struct ChunkMesh {
        VkBuffer vertexBuffer = VK_NULL_HANDLE;
        VkDeviceMemory vertexMemory = VK_NULL_HANDLE;
        VkBuffer indexBuffer = VK_NULL_HANDLE;
        VkDeviceMemory indexMemory = VK_NULL_HANDLE;
        uint32_t indexCount = 0;
        bool uploaded = false;
        uint64_t meshVersion = 0;
    };

    struct ChunkMeshKey {
        IVec3 chunkPos;
        int lod;
        bool operator==(const ChunkMeshKey& other) const {
            return chunkPos == other.chunkPos && lod == other.lod;
        }
    };

    struct ChunkMeshKeyHash {
        size_t operator()(const ChunkMeshKey& k) const noexcept {
            size_t h1 = std::hash<IVec3>{}(k.chunkPos);
            size_t h2 = std::hash<int>{}(k.lod);
            return h1 ^ (h2 << 1);
        }
    };

    std::unordered_map<ChunkMeshKey, ChunkMesh, ChunkMeshKeyHash> chunkMeshes;
    std::mutex meshMutex;

    void createInstance();
    void setupDebugMessenger();
    void createSurface(void* windowHandle);
    void pickPhysicalDevice();
    void createLogicalDevice();
    void createSwapChain();
    void createImageViews();
    void createRenderPass();
    void createShadowRenderPass();
    void createGBufferRenderPass();
    void createSSAORenderPass();
    void createBlurRenderPass();
    void createReflectionRenderPass();
    void createPostprocessRenderPass();
    void createDescriptorSetLayout();
    void createGraphicsPipeline();
    void createShadowPipeline();
    void createGBufferPipeline();
    void createSSAOPipeline();
    void createBlurPipeline();
    void createReflectionPipeline();
    void createPostprocessPipeline();
    void createFramebuffers();
    void createShadowFramebuffer();
    void createGBufferResources();
    void createSSAOResources();
    void createReflectionResources();
    void createPostprocessFramebuffer();
    void createCommandPool();
    void createDepthResources();
    void createShadowResources();
    void createUniformBuffers();
    void createDescriptorPool();
    void createDescriptorSets();
    void createCommandBuffers();
    void createSyncObjects();
    void generateSSAOKernel();
    void generateSSAONoiseTexture();
    void uploadSSAOKernel();

    void recreateSwapChain();
    void cleanupSwapChain();
    void cleanupGBuffer();
    void cleanupSSAO();
    void cleanupReflection();
    void cleanupPostprocess();

    void uploadChunkMesh(Chunk* chunk, LODLevel lod);
    void recordCommandBuffer(VkCommandBuffer commandBuffer, uint32_t imageIndex);
    void recordShadowCommandBuffer(VkCommandBuffer commandBuffer);
    void recordGBufferCommandBuffer(VkCommandBuffer commandBuffer, const std::vector<RenderChunk>& chunks);
    void recordSSAOCommandBuffer(VkCommandBuffer commandBuffer);
    void recordBlurCommandBuffer(VkCommandBuffer commandBuffer);
    void recordReflectionCommandBuffer(VkCommandBuffer commandBuffer, const std::vector<RenderChunk>& chunks);
    void recordPostprocessCommandBuffer(VkCommandBuffer commandBuffer, uint32_t imageIndex);

    QueueFamilyIndices findQueueFamilies(VkPhysicalDevice device);
    SwapChainSupportDetails querySwapChainSupport(VkPhysicalDevice device);
    bool checkDeviceExtensionSupport(VkPhysicalDevice device);
    bool isDeviceSuitable(VkPhysicalDevice device);
    VkSurfaceFormatKHR chooseSwapSurfaceFormat(const std::vector<VkSurfaceFormatKHR>& availableFormats);
    VkPresentModeKHR chooseSwapPresentMode(const std::vector<VkPresentModeKHR>& availablePresentModes);
    VkExtent2D chooseSwapExtent(const VkSurfaceCapabilitiesKHR& capabilities);
    uint32_t findMemoryType(uint32_t typeFilter, VkMemoryPropertyFlags properties);
    VkFormat findDepthFormat();
    VkFormat findSupportedFormat(const std::vector<VkFormat>& candidates, VkImageTiling tiling, VkFormatFeatureFlags features);
    bool hasStencilComponent(VkFormat format);
    void createImage(uint32_t width, uint32_t height, VkFormat format, VkImageTiling tiling,
                     VkImageUsageFlags usage, VkMemoryPropertyFlags properties, VkImage& image, VkDeviceMemory& imageMemory);
    VkImageView createImageView(VkImage image, VkFormat format, VkImageAspectFlags aspectFlags);
    void createBuffer(VkDeviceSize size, VkBufferUsageFlags usage, VkMemoryPropertyFlags properties,
                      VkBuffer& buffer, VkDeviceMemory& bufferMemory);
    void copyBuffer(VkBuffer srcBuffer, VkBuffer dstBuffer, VkDeviceSize size);
    void transitionImageLayout(VkImage image, VkFormat format, VkImageLayout oldLayout, VkImageLayout newLayout);
    void copyBufferToImage(VkBuffer buffer, VkImage image, uint32_t width, uint32_t height);

    VkShaderModule createShaderModule(const std::vector<char>& code);
    static std::vector<char> readFile(const std::string& filename);

    void populateDebugMessengerCreateInfo(VkDebugUtilsMessengerCreateInfoEXT& createInfo);
    void checkVulkanError(VkResult result, const char* operation);

    std::vector<const char*> getRequiredExtensions();
    bool checkValidationLayerSupport();
};
