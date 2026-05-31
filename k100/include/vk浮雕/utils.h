#pragma once

#include <string>
#include <vector>
#include "common.h"

namespace vk浮雕::utils {

std::vector<uint8_t> readFile(const std::string& filename);

std::vector<uint8_t> frameToGrayscale(const Frame& frame);

Frame grayscaleToFrame(const std::vector<uint8_t>& gray, uint32_t width, uint32_t height);

Frame floatToFrame(const FrameFloat& frameFloat, float scale = 1.0f);

void savePPM(const std::string& filename, const Frame& frame);

Frame loadPPM(const std::string& filename);

bool fileExists(const std::string& filename);

std::string getFileExtension(const std::string& filename);

bool isRtmpUrl(const std::string& url);

}
