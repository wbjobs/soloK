#pragma once

#include <vulkan/vulkan.h>
#include <cstdint>
#include <vector>
#include <string>
#include <memory>
#include <stdexcept>

namespace vk浮雕 {

struct ImageSize {
    uint32_t width;
    uint32_t height;
};

struct RGBA {
    uint8_t r, g, b, a;
};

struct LightParams {
    float ambientIntensity = 0.3f;
    float directionalIntensity = 1.2f;
    float lightDirX = -0.5f;
    float lightDirY = -0.5f;
    float lightDirZ = 0.7f;
    float heightScale = 0.1f;
};

class Frame {
public:
    Frame() = default;
    Frame(uint32_t w, uint32_t h);
    
    uint32_t width = 0;
    uint32_t height = 0;
    std::vector<uint8_t> data;
    
    size_t size() const { return data.size(); }
    uint8_t* ptr() { return data.data(); }
    const uint8_t* ptr() const { return data.data(); }
    
    void allocate(uint32_t w, uint32_t h);
};

class FrameFloat {
public:
    FrameFloat() = default;
    FrameFloat(uint32_t w, uint32_t h);
    
    uint32_t width = 0;
    uint32_t height = 0;
    std::vector<float> data;
    
    size_t size() const { return data.size(); }
    float* ptr() { return data.data(); }
    const float* ptr() const { return data.data(); }
    
    void allocate(uint32_t w, uint32_t h);
};

}
