#pragma once

#include <string>
#include <vector>
#include "common.h"
#include "relief_pipeline.h"

namespace vk浮雕 {

class CLIParser {
public:
    struct Options {
        std::string input;
        std::string output;
        bool useCamera = false;
        int cameraIndex = 0;
        uint32_t cameraWidth = 1280;
        uint32_t cameraHeight = 720;
        double cameraFps = 30.0;
        
        uint32_t outputWidth = 1920;
        uint32_t outputHeight = 1080;
        double outputFps = 30.0;
        int bitrate = 4000000;
        
        std::string edgeDetector = "sobel";
        float normalStrength = 1.0f;
        float sobelThreshold = 30.0f;
        float sobelStrength = 1.0f;
        
        LightParams lightParams;
        
        bool enableTracking = false;
        std::string yoloModelPath;
        std::vector<int> targetClasses = {0, 2};
        float trackingUpdateInterval = 5.0f;
        float trackingConfidence = 0.25f;
        int trackingGpuId = -1;
        
        int maxFrames = -1;
        bool verbose = false;
        bool showHelp = false;
    };

    CLIParser() = default;
    
    bool parse(int argc, char* argv[], Options& options);
    void printHelp();
    
private:
    bool validateOptions(const Options& options);
};

}
