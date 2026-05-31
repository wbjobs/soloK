#include "vk浮雕/object_detector.h"
#include "vk浮雕/yolo_detector.h"
#include "vk浮雕/logger.h"

namespace vk浮雕 {

std::unique_ptr<IObjectDetector> ObjectDetectorFactory::create(const std::string& type) {
    if (type == "yolov8n" || type == "yolo" || type == "yolov8") {
        LOG_INFO() << "Creating YOLOv8n object detector";
        return std::make_unique<YOLODetector>();
    }

    LOG_ERROR() << "Unknown object detector type: " << type;
    return nullptr;
}

}
