#include "vk浮雕/cli_parser.h"
#include "vk浮雕/logger.h"
#include "vk浮雕/utils.h"
#include <iostream>
#include <cstring>
#include <cstdlib>
#include <sstream>

namespace vk浮雕 {

static std::vector<int> parseIntList(const std::string& str) {
    std::vector<int> result;
    std::stringstream ss(str);
    std::string token;
    while (std::getline(ss, token, ',')) {
        try {
            result.push_back(std::stoi(token));
        } catch (...) {}
    }
    return result;
}

bool CLIParser::parse(int argc, char* argv[], Options& options) {
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        
        if (arg == "-h" || arg == "--help") {
            options.showHelp = true;
            return true;
        } else if (arg == "-i" || arg == "--input") {
            if (i + 1 >= argc) {
                LOG_ERROR() << "Missing input value";
                return false;
            }
            options.input = argv[++i];
        } else if (arg == "-o" || arg == "--output") {
            if (i + 1 >= argc) {
                LOG_ERROR() << "Missing output value";
                return false;
            }
            options.output = argv[++i];
        } else if (arg == "--camera") {
            options.useCamera = true;
            if (i + 1 < argc && argv[i + 1][0] != '-') {
                options.cameraIndex = std::atoi(argv[++i]);
            }
        } else if (arg == "--camera-width") {
            if (i + 1 >= argc) return false;
            options.cameraWidth = std::stoul(argv[++i]);
        } else if (arg == "--camera-height") {
            if (i + 1 >= argc) return false;
            options.cameraHeight = std::stoul(argv[++i]);
        } else if (arg == "--camera-fps") {
            if (i + 1 >= argc) return false;
            options.cameraFps = std::atof(argv[++i]);
        } else if (arg == "--output-width") {
            if (i + 1 >= argc) return false;
            options.outputWidth = std::stoul(argv[++i]);
        } else if (arg == "--output-height") {
            if (i + 1 >= argc) return false;
            options.outputHeight = std::stoul(argv[++i]);
        } else if (arg == "--fps") {
            if (i + 1 >= argc) return false;
            options.outputFps = std::atof(argv[++i]);
        } else if (arg == "--bitrate") {
            if (i + 1 >= argc) return false;
            options.bitrate = std::atoi(argv[++i]);
        } else if (arg == "--edge-detector") {
            if (i + 1 >= argc) return false;
            options.edgeDetector = argv[++i];
        } else if (arg == "--normal-strength") {
            if (i + 1 >= argc) return false;
            options.normalStrength = std::atof(argv[++i]);
        } else if (arg == "--sobel-threshold") {
            if (i + 1 >= argc) return false;
            options.sobelThreshold = std::atof(argv[++i]);
        } else if (arg == "--sobel-strength") {
            if (i + 1 >= argc) return false;
            options.sobelStrength = std::atof(argv[++i]);
        } else if (arg == "--ambient") {
            if (i + 1 >= argc) return false;
            options.lightParams.ambientIntensity = std::atof(argv[++i]);
        } else if (arg == "--directional") {
            if (i + 1 >= argc) return false;
            options.lightParams.directionalIntensity = std::atof(argv[++i]);
        } else if (arg == "--light-dir") {
            if (i + 3 >= argc) return false;
            options.lightParams.lightDirX = std::atof(argv[++i]);
            options.lightParams.lightDirY = std::atof(argv[++i]);
            options.lightParams.lightDirZ = std::atof(argv[++i]);
        } else if (arg == "--height-scale") {
            if (i + 1 >= argc) return false;
            options.lightParams.heightScale = std::atof(argv[++i]);
        } else if (arg == "--track") {
            options.enableTracking = true;
        } else if (arg == "--yolo-model") {
            if (i + 1 >= argc) return false;
            options.yoloModelPath = argv[++i];
            options.enableTracking = true;
        } else if (arg == "--target-classes") {
            if (i + 1 >= argc) return false;
            options.targetClasses = parseIntList(argv[++i]);
        } else if (arg == "--track-interval") {
            if (i + 1 >= argc) return false;
            options.trackingUpdateInterval = std::atof(argv[++i]);
        } else if (arg == "--track-confidence") {
            if (i + 1 >= argc) return false;
            options.trackingConfidence = std::atof(argv[++i]);
        } else if (arg == "--track-gpu") {
            if (i + 1 >= argc) return false;
            options.trackingGpuId = std::atoi(argv[++i]);
        } else if (arg == "--max-frames") {
            if (i + 1 >= argc) return false;
            options.maxFrames = std::atoi(argv[++i]);
        } else if (arg == "-v" || arg == "--verbose") {
            options.verbose = true;
        } else {
            LOG_WARNING() << "Unknown argument: " << arg;
        }
    }
    
    return validateOptions(options);
}

bool CLIParser::validateOptions(const Options& options) {
    if (options.showHelp) return true;
    
    if (!options.useCamera && options.input.empty()) {
        LOG_ERROR() << "Input source required (use -i or --camera)";
        return false;
    }
    
    if (options.output.empty()) {
        LOG_ERROR() << "Output destination required (use -o)";
        return false;
    }
    
    if (!options.useCamera && !utils::fileExists(options.input) && !utils::isRtmpUrl(options.input)) {
        LOG_ERROR() << "Input file does not exist: " << options.input;
        return false;
    }

    if (options.enableTracking && options.yoloModelPath.empty()) {
        LOG_ERROR() << "Tracking enabled but no YOLO model specified (use --yolo-model)";
        return false;
    }
    
    return true;
}

void CLIParser::printHelp() {
    std::cout << "\n=== vk浮雕 - GPU Accelerated Relief Video Processor ===\n\n";
    std::cout << "Usage: vk浮雕 [options]\n\n";
    std::cout << "Input/Output:\n";
    std::cout << "  -i, --input <path>        Input video file or RTSP URL\n";
    std::cout << "  -o, --output <path>       Output file or RTMP URL\n";
    std::cout << "      --camera [idx]        Use camera instead of file\n";
    std::cout << "      --camera-width <w>    Camera capture width (default: 1280)\n";
    std::cout << "      --camera-height <h>   Camera capture height (default: 720)\n";
    std::cout << "      --camera-fps <fps>    Camera capture FPS (default: 30)\n\n";
    std::cout << "Output Settings:\n";
    std::cout << "      --output-width <w>    Output width (default: 1920)\n";
    std::cout << "      --output-height <h>   Output height (default: 1080)\n";
    std::cout << "      --fps <fps>           Output FPS (default: 30)\n";
    std::cout << "      --bitrate <bps>       Output bitrate (default: 4000000)\n\n";
    std::cout << "Processing Settings:\n";
    std::cout << "      --edge-detector <t>   Edge detector: sobel (default)\n";
    std::cout << "      --normal-strength <s> Normal map strength (default: 1.0)\n";
    std::cout << "      --sobel-threshold <t> Sobel edge threshold (default: 30.0)\n";
    std::cout << "      --sobel-strength <s>  Sobel edge strength (default: 1.0)\n\n";
    std::cout << "Lighting Settings:\n";
    std::cout << "      --ambient <a>         Ambient light intensity (default: 0.3)\n";
    std::cout << "      --directional <i>     Directional light intensity (default: 1.2)\n";
    std::cout << "      --light-dir <x y z>   Light direction (default: -0.5 -0.5 0.7)\n";
    std::cout << "      --height-scale <s>    Height scale for relief (default: 0.1)\n\n";
    std::cout << "Object Tracking (YOLO):\n";
    std::cout << "      --track               Enable object tracking\n";
    std::cout << "      --yolo-model <path>   Path to YOLOv8n ONNX model\n";
    std::cout << "      --target-classes <ids> Target class IDs, comma-separated (default: 0,2)\n";
    std::cout << "                             0=person, 2=car, 5=bus, 7=truck, etc.\n";
    std::cout << "      --track-interval <s>  Tracking update interval in seconds (default: 5.0)\n";
    std::cout << "      --track-confidence <f> Detection confidence threshold (default: 0.25)\n";
    std::cout << "      --track-gpu <id>      GPU device for YOLO inference (-1=CPU)\n\n";
    std::cout << "Other:\n";
    std::cout << "      --max-frames <n>      Process only N frames\n";
    std::cout << "  -v, --verbose              Enable verbose logging\n";
    std::cout << "  -h, --help                 Show this help\n\n";
    std::cout << "Examples:\n";
    std::cout << "  # Video file to file\n";
    std::cout << "  vk浮雕 -i input.mp4 -o output.mp4\n\n";
    std::cout << "  # Camera to RTMP stream\n";
    std::cout << "  vk浮雕 --camera 0 -o rtmp://server/live/stream\n\n";
    std::cout << "  # Custom lighting\n";
    std::cout << "  vk浮雕 -i input.mp4 -o output.mp4 --ambient 0.2 --directional 1.5 --light-dir -0.3 -0.4 0.9\n\n";
    std::cout << "  # Object tracking with YOLO\n";
    std::cout << "  vk浮雕 -i input.mp4 -o output.mp4 --yolo-model yolov8n.onnx --target-classes 0,2\n\n";
    std::cout << "  # Track only people, update every 3 seconds\n";
    std::cout << "  vk浮雕 --camera 0 -o rtmp://server/live/stream --yolo-model yolov8n.onnx --target-classes 0 --track-interval 3.0\n\n";
}

}
