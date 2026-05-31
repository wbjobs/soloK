#include "vk浮雕/edge_detector.h"
#include "vk浮雕/sobel_detector.h"
#include "vk浮雕/logger.h"

namespace vk浮雕 {

std::unique_ptr<IEdgeDetector> EdgeDetectorFactory::create(const std::string& type) {
    std::string lowerType;
    lowerType.resize(type.size());
    for (size_t i = 0; i < type.size(); i++) {
        lowerType[i] = std::tolower(static_cast<unsigned char>(type[i]));
    }
    
    if (lowerType == "sobel" || lowerType.empty()) {
        return std::make_unique<SobelDetector>();
    }
    
    LOG_WARNING() << "Unknown edge detector type: " << type << ", using Sobel";
    return std::make_unique<SobelDetector>();
}

}
