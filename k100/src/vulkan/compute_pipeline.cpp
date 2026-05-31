#include "vk浮雕/compute_pipeline.h"
#include "vk浮雕/logger.h"
#include "vk浮雕/utils.h"

namespace vk浮雕 {

ComputePipeline::~ComputePipeline() {
    cleanup();
}

bool ComputePipeline::init(VulkanContext* context, const std::string& shaderPath,
                           const std::vector<DescriptorBinding>& bindings,
                           size_t pushConstantSize) {
    m_context = context;
    m_bindings = bindings;
    m_pushConstantSize = pushConstantSize;
    
    if (!createDescriptorSetLayout(bindings)) {
        LOG_ERROR() << "Failed to create descriptor set layout";
        return false;
    }
    
    if (!createDescriptorPool(bindings)) {
        LOG_ERROR() << "Failed to create descriptor pool";
        return false;
    }
    
    if (!createDescriptorSet()) {
        LOG_ERROR() << "Failed to create descriptor set";
        return false;
    }
    
    if (!createPipeline(shaderPath)) {
        LOG_ERROR() << "Failed to create compute pipeline";
        return false;
    }
    
    return true;
}

void ComputePipeline::cleanup() {
    if (m_context == nullptr) return;
    
    VkDevice device = m_context->getDevice();
    
    if (m_pipeline != VK_NULL_HANDLE) {
        vkDestroyPipeline(device, m_pipeline, nullptr);
        m_pipeline = VK_NULL_HANDLE;
    }
    
    if (m_pipelineLayout != VK_NULL_HANDLE) {
        vkDestroyPipelineLayout(device, m_pipelineLayout, nullptr);
        m_pipelineLayout = VK_NULL_HANDLE;
    }
    
    if (m_descriptorSet != VK_NULL_HANDLE) {
        vkFreeDescriptorSets(device, m_descriptorPool, 1, &m_descriptorSet);
        m_descriptorSet = VK_NULL_HANDLE;
    }
    
    if (m_descriptorPool != VK_NULL_HANDLE) {
        vkDestroyDescriptorPool(device, m_descriptorPool, nullptr);
        m_descriptorPool = VK_NULL_HANDLE;
    }
    
    if (m_descriptorSetLayout != VK_NULL_HANDLE) {
        vkDestroyDescriptorSetLayout(device, m_descriptorSetLayout, nullptr);
        m_descriptorSetLayout = VK_NULL_HANDLE;
    }
    
    m_context = nullptr;
    m_bindings.clear();
    m_pushConstantSize = 0;
}

bool ComputePipeline::createDescriptorSetLayout(const std::vector<DescriptorBinding>& bindings) {
    std::vector<VkDescriptorSetLayoutBinding> layoutBindings;
    
    for (const auto& binding : bindings) {
        VkDescriptorSetLayoutBinding layoutBinding{};
        layoutBinding.binding = binding.binding;
        layoutBinding.descriptorType = binding.type;
        layoutBinding.descriptorCount = binding.count;
        layoutBinding.stageFlags = binding.stageFlags;
        layoutBindings.push_back(layoutBinding);
    }
    
    VkDescriptorSetLayoutCreateInfo layoutInfo{};
    layoutInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
    layoutInfo.bindingCount = static_cast<uint32_t>(layoutBindings.size());
    layoutInfo.pBindings = layoutBindings.data();
    
    VkResult result = vkCreateDescriptorSetLayout(m_context->getDevice(), &layoutInfo, nullptr, &m_descriptorSetLayout);
    return result == VK_SUCCESS;
}

bool ComputePipeline::createDescriptorPool(const std::vector<DescriptorBinding>& bindings) {
    std::vector<VkDescriptorPoolSize> poolSizes;
    
    for (const auto& binding : bindings) {
        VkDescriptorPoolSize poolSize{};
        poolSize.type = binding.type;
        poolSize.descriptorCount = binding.count;
        poolSizes.push_back(poolSize);
    }
    
    VkDescriptorPoolCreateInfo poolInfo{};
    poolInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;
    poolInfo.poolSizeCount = static_cast<uint32_t>(poolSizes.size());
    poolInfo.pPoolSizes = poolSizes.data();
    poolInfo.maxSets = 1;
    
    VkResult result = vkCreateDescriptorPool(m_context->getDevice(), &poolInfo, nullptr, &m_descriptorPool);
    return result == VK_SUCCESS;
}

bool ComputePipeline::createDescriptorSet() {
    VkDescriptorSetAllocateInfo allocInfo{};
    allocInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
    allocInfo.descriptorPool = m_descriptorPool;
    allocInfo.descriptorSetCount = 1;
    allocInfo.pSetLayouts = &m_descriptorSetLayout;
    
    VkResult result = vkAllocateDescriptorSets(m_context->getDevice(), &allocInfo, &m_descriptorSet);
    return result == VK_SUCCESS;
}

bool ComputePipeline::createPipeline(const std::string& shaderPath) {
    auto shaderCode = utils::readFile(shaderPath);
    if (shaderCode.empty()) {
        LOG_ERROR() << "Failed to read shader: " << shaderPath;
        return false;
    }
    
    VkShaderModule shaderModule = vulkan_utils::createShaderModule(m_context->getDevice(), shaderCode);
    if (shaderModule == VK_NULL_HANDLE) {
        return false;
    }
    
    VkPipelineShaderStageCreateInfo shaderStageInfo{};
    shaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    shaderStageInfo.stage = VK_SHADER_STAGE_COMPUTE_BIT;
    shaderStageInfo.module = shaderModule;
    shaderStageInfo.pName = "main";
    
    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &m_descriptorSetLayout;
    
    if (m_pushConstantSize > 0) {
        VkPushConstantRange pushConstantRange{};
        pushConstantRange.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
        pushConstantRange.offset = 0;
        pushConstantRange.size = m_pushConstantSize;
        
        pipelineLayoutInfo.pushConstantRangeCount = 1;
        pipelineLayoutInfo.pPushConstantRanges = &pushConstantRange;
    }
    
    VkResult result = vkCreatePipelineLayout(m_context->getDevice(), &pipelineLayoutInfo, nullptr, &m_pipelineLayout);
    if (result != VK_SUCCESS) {
        vkDestroyShaderModule(m_context->getDevice(), shaderModule, nullptr);
        return false;
    }
    
    VkComputePipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO;
    pipelineInfo.stage = shaderStageInfo;
    pipelineInfo.layout = m_pipelineLayout;
    
    result = vkCreateComputePipelines(m_context->getDevice(), VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &m_pipeline);
    
    vkDestroyShaderModule(m_context->getDevice(), shaderModule, nullptr);
    
    return result == VK_SUCCESS;
}

void ComputePipeline::updateDescriptorSet(uint32_t binding, const vulkan_utils::Buffer& buffer) {
    VkDescriptorBufferInfo bufferInfo{};
    bufferInfo.buffer = buffer.buffer;
    bufferInfo.offset = 0;
    bufferInfo.range = buffer.size;
    
    VkWriteDescriptorSet descriptorWrite{};
    descriptorWrite.sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
    descriptorWrite.dstSet = m_descriptorSet;
    descriptorWrite.dstBinding = binding;
    descriptorWrite.dstArrayElement = 0;
    descriptorWrite.descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
    descriptorWrite.descriptorCount = 1;
    descriptorWrite.pBufferInfo = &bufferInfo;
    
    vkUpdateDescriptorSets(m_context->getDevice(), 1, &descriptorWrite, 0, nullptr);
}

void ComputePipeline::updateDescriptorSet(uint32_t binding, const vulkan_utils::Image& image, VkSampler sampler) {
    VkDescriptorImageInfo imageInfo{};
    imageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
    imageInfo.imageView = image.view;
    imageInfo.sampler = sampler;
    
    VkWriteDescriptorSet descriptorWrite{};
    descriptorWrite.sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
    descriptorWrite.dstSet = m_descriptorSet;
    descriptorWrite.dstBinding = binding;
    descriptorWrite.dstArrayElement = 0;
    descriptorWrite.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
    descriptorWrite.descriptorCount = 1;
    descriptorWrite.pImageInfo = &imageInfo;
    
    vkUpdateDescriptorSets(m_context->getDevice(), 1, &descriptorWrite, 0, nullptr);
}

void ComputePipeline::dispatch(VkCommandBuffer commandBuffer, uint32_t groupCountX,
                               uint32_t groupCountY, uint32_t groupCountZ) {
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_COMPUTE, m_pipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_COMPUTE,
                           m_pipelineLayout, 0, 1, &m_descriptorSet, 0, nullptr);
    vkCmdDispatch(commandBuffer, groupCountX, groupCountY, groupCountZ);
}

}
