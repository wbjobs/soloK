#pragma once

#include <memory>
#include <string>
#include "common.h"
#include "vulkan_context.h"

namespace vk浮雕 {

class IEdgeDetector {
public:
    virtual ~IEdgeDetector() = default;
    
    virtual bool init(VulkanContext* context, uint32_t width, uint32_t height) = 0;
    virtual void cleanup() = 0;
    
    virtual void process(const Frame& inputFrame, Frame& outputEdge, FrameFloat& outputHeight) = 0;
    
    virtual std::string getName() const = 0;
};

class EdgeDetectorFactory {
public:
    static std::unique_ptr<IEdgeDetector> create(const std::string& type);
};

}
