#pragma once

#include <vulkan/vulkan.h>
#include <vector>
#include <string>
#include "vulkan_context.h"
#include "vulkan_utils.h"

namespace vk浮雕 {

class ComputePipeline {
public:
    struct DescriptorBinding {
        uint32_t binding;
        VkDescriptorType type;
        VkShaderStageFlags stageFlags;
        uint32_t count = 1;
    };

    ComputePipeline() = default;
    ~ComputePipeline();
    
    bool init(VulkanContext* context, const std::string& shaderPath,
              const std::vector<DescriptorBinding>& bindings,
              size_t pushConstantSize = 0);
    void cleanup();
    
    void updateDescriptorSet(uint32_t binding, const vulkan_utils::Buffer& buffer);
    void updateDescriptorSet(uint32_t binding, const vulkan_utils::Image& image, VkSampler sampler);
    
    void dispatch(VkCommandBuffer commandBuffer, uint32_t groupCountX,
                  uint32_t groupCountY, uint32_t groupCountZ);
    
    template<typename T>
    void pushConstants(VkCommandBuffer commandBuffer, const T& data) {
        vkCmdPushConstants(commandBuffer, m_pipelineLayout,
                          VK_SHADER_STAGE_COMPUTE_BIT, 0, sizeof(T), &data);
    }
    
    VkPipeline getPipeline() const { return m_pipeline; }
    VkPipelineLayout getPipelineLayout() const { return m_pipelineLayout; }
    VkDescriptorSet getDescriptorSet() const { return m_descriptorSet; }
    
private:
    bool createDescriptorSetLayout(const std::vector<DescriptorBinding>& bindings);
    bool createDescriptorPool(const std::vector<DescriptorBinding>& bindings);
    bool createDescriptorSet();
    bool createPipeline(const std::string& shaderPath);
    
    VulkanContext* m_context = nullptr;
    size_t m_pushConstantSize = 0;
    
    VkDescriptorSetLayout m_descriptorSetLayout = VK_NULL_HANDLE;
    VkDescriptorPool m_descriptorPool = VK_NULL_HANDLE;
    VkDescriptorSet m_descriptorSet = VK_NULL_HANDLE;
    VkPipelineLayout m_pipelineLayout = VK_NULL_HANDLE;
    VkPipeline m_pipeline = VK_NULL_HANDLE;
    
    std::vector<DescriptorBinding> m_bindings;
};

}
