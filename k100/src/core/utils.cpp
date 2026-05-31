#include "vk浮雕/utils.h"
#include "vk浮雕/logger.h"
#include <fstream>
#include <algorithm>
#include <cstring>

namespace vk浮雕::utils {

std::vector<uint8_t> readFile(const std::string& filename) {
    std::ifstream file(filename, std::ios::ate | std::ios::binary);
    if (!file.is_open()) {
        LOG_ERROR() << "Failed to open file: " << filename;
        return {};
    }
    
    size_t fileSize = (size_t)file.tellg();
    std::vector<uint8_t> buffer(fileSize);
    file.seekg(0);
    file.read(reinterpret_cast<char*>(buffer.data()), fileSize);
    file.close();
    
    return buffer;
}

std::vector<uint8_t> frameToGrayscale(const Frame& frame) {
    std::vector<uint8_t> gray(frame.width * frame.height);
    const uint8_t* src = frame.ptr();
    
    for (size_t i = 0; i < gray.size(); i++) {
        size_t srcIdx = i * 4;
        uint8_t r = src[srcIdx];
        uint8_t g = src[srcIdx + 1];
        uint8_t b = src[srcIdx + 2];
        gray[i] = static_cast<uint8_t>(0.299f * r + 0.587f * g + 0.114f * b);
    }
    
    return gray;
}

Frame grayscaleToFrame(const std::vector<uint8_t>& gray, uint32_t width, uint32_t height) {
    Frame frame(width, height);
    uint8_t* dst = frame.ptr();
    
    for (size_t i = 0; i < gray.size(); i++) {
        size_t dstIdx = i * 4;
        uint8_t v = gray[i];
        dst[dstIdx] = v;
        dst[dstIdx + 1] = v;
        dst[dstIdx + 2] = v;
        dst[dstIdx + 3] = 255;
    }
    
    return frame;
}

Frame floatToFrame(const FrameFloat& frameFloat, float scale) {
    Frame frame(frameFloat.width, frameFloat.height);
    uint8_t* dst = frame.ptr();
    const float* src = frameFloat.ptr();
    
    for (size_t i = 0; i < frameFloat.size(); i++) {
        size_t dstIdx = i * 4;
        float v = std::clamp(src[i] * scale, 0.0f, 1.0f);
        uint8_t val = static_cast<uint8_t>(v * 255.0f);
        dst[dstIdx] = val;
        dst[dstIdx + 1] = val;
        dst[dstIdx + 2] = val;
        dst[dstIdx + 3] = 255;
    }
    
    return frame;
}

void savePPM(const std::string& filename, const Frame& frame) {
    std::ofstream file(filename, std::ios::binary);
    if (!file.is_open()) {
        LOG_ERROR() << "Failed to save PPM: " << filename;
        return;
    }
    
    file << "P6\n" << frame.width << " " << frame.height << "\n255\n";
    
    std::vector<uint8_t> rgb(frame.width * frame.height * 3);
    const uint8_t* src = frame.ptr();
    
    for (size_t i = 0; i < frame.width * frame.height; i++) {
        size_t srcIdx = i * 4;
        size_t dstIdx = i * 3;
        rgb[dstIdx] = src[srcIdx];
        rgb[dstIdx + 1] = src[srcIdx + 1];
        rgb[dstIdx + 2] = src[srcIdx + 2];
    }
    
    file.write(reinterpret_cast<char*>(rgb.data()), rgb.size());
    file.close();
}

Frame loadPPM(const std::string& filename) {
    std::ifstream file(filename, std::ios::binary);
    if (!file.is_open()) {
        LOG_ERROR() << "Failed to load PPM: " << filename;
        return {};
    }
    
    std::string header;
    file >> header;
    
    if (header != "P6") {
        LOG_ERROR() << "Invalid PPM format";
        return {};
    }
    
    uint32_t width, height, maxVal;
    file >> width >> height >> maxVal;
    file.ignore();
    
    Frame frame(width, height);
    std::vector<uint8_t> rgb(width * height * 3);
    file.read(reinterpret_cast<char*>(rgb.data()), rgb.size());
    
    uint8_t* dst = frame.ptr();
    for (size_t i = 0; i < width * height; i++) {
        size_t srcIdx = i * 3;
        size_t dstIdx = i * 4;
        dst[dstIdx] = rgb[srcIdx];
        dst[dstIdx + 1] = rgb[srcIdx + 1];
        dst[dstIdx + 2] = rgb[srcIdx + 2];
        dst[dstIdx + 3] = 255;
    }
    
    file.close();
    return frame;
}

bool fileExists(const std::string& filename) {
    std::ifstream f(filename);
    return f.good();
}

std::string getFileExtension(const std::string& filename) {
    size_t dotPos = filename.find_last_of('.');
    if (dotPos == std::string::npos) return "";
    return filename.substr(dotPos + 1);
}

bool isRtmpUrl(const std::string& url) {
    return url.rfind("rtmp://", 0) == 0 || url.rfind("rtmps://", 0) == 0;
}

}
