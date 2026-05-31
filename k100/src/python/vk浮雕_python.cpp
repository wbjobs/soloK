#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/numpy.h>
#include <pybind11/functional.h>

#include "vk浮雕/relief_pipeline.h"
#include "vk浮雕/edge_detector.h"
#include "vk浮雕/sobel_detector.h"
#include "vk浮雕/video_reader.h"
#include "vk浮雕/video_writer.h"
#include "vk浮雕/camera_reader.h"
#include "vk浮雕/object_detector.h"
#include "vk浮雕/yolo_detector.h"
#include "vk浮雕/light_tracker.h"
#include "vk浮雕/logger.h"
#include "vk浮雕/utils.h"

namespace py = pybind11;
using namespace vk浮雕;

PYBIND11_MODULE(vk浮雕, m) {
    m.doc() = "vk浮雕 - GPU Accelerated Relief Video Processing with Vulkan";

    py::class_<Frame>(m, "Frame")
        .def(py::init<>())
        .def(py::init<uint32_t, uint32_t>())
        .def_readonly("width", &Frame::width)
        .def_readonly("height", &Frame::height)
        .def("size", &Frame::size)
        .def("to_numpy", [](const Frame& self) {
            py::array_t<uint8_t> arr({self.height, self.width, 4},
                                   {self.width * 4, 4, 1},
                                   self.ptr());
            return arr;
        })
        .def_static("from_numpy", [](py::array_t<uint8_t> arr) {
            if (arr.ndim() != 3 || arr.shape(2) != 4) {
                throw std::runtime_error("Expected HxWx4 uint8 array");
            }
            Frame frame(arr.shape(1), arr.shape(0));
            std::memcpy(frame.ptr(), arr.data(), frame.size());
            return frame;
        });

    py::class_<FrameFloat>(m, "FrameFloat")
        .def(py::init<>())
        .def(py::init<uint32_t, uint32_t>())
        .def_readonly("width", &FrameFloat::width)
        .def_readonly("height", &FrameFloat::height)
        .def("size", &FrameFloat::size)
        .def("to_numpy", [](const FrameFloat& self) {
            py::array_t<float> arr({self.height, self.width},
                                  {self.width * sizeof(float), sizeof(float)},
                                  self.ptr());
            return arr;
        });

    py::class_<LightParams>(m, "LightParams")
        .def(py::init<>())
        .def_readwrite("ambient_intensity", &LightParams::ambientIntensity)
        .def_readwrite("directional_intensity", &LightParams::directionalIntensity)
        .def_readwrite("light_dir_x", &LightParams::lightDirX)
        .def_readwrite("light_dir_y", &LightParams::lightDirY)
        .def_readwrite("light_dir_z", &LightParams::lightDirZ)
        .def_readwrite("height_scale", &LightParams::heightScale);

    py::class_<ReliefPipeline::Config>(m, "ReliefConfig")
        .def(py::init<>())
        .def_readwrite("width", &ReliefPipeline::Config::width)
        .def_readwrite("height", &ReliefPipeline::Config::height)
        .def_readwrite("edge_detector_type", &ReliefPipeline::Config::edgeDetectorType)
        .def_readwrite("light_params", &ReliefPipeline::Config::lightParams)
        .def_readwrite("normal_strength", &ReliefPipeline::Config::normalStrength)
        .def_readwrite("sobel_threshold", &ReliefPipeline::Config::sobelThreshold)
        .def_readwrite("sobel_strength", &ReliefPipeline::Config::sobelStrength)
        .def_readwrite("enable_object_tracking", &ReliefPipeline::Config::enableObjectTracking)
        .def_readwrite("yolo_model_path", &ReliefPipeline::Config::yoloModelPath)
        .def_readwrite("target_classes", &ReliefPipeline::Config::targetClasses)
        .def_readwrite("tracking_update_interval", &ReliefPipeline::Config::trackingUpdateInterval)
        .def_readwrite("tracking_confidence", &ReliefPipeline::Config::trackingConfidence)
        .def_readwrite("tracking_gpu_id", &ReliefPipeline::Config::trackingGpuId);

    py::class_<ReliefPipeline>(m, "ReliefPipeline")
        .def(py::init<>())
        .def("init", &ReliefPipeline::init)
        .def("cleanup", &ReliefPipeline::cleanup)
        .def("process_frame", &ReliefPipeline::processFrame)
        .def("set_light_params", &ReliefPipeline::setLightParams)
        .def("set_normal_strength", &ReliefPipeline::setNormalStrength)
        .def("get_width", &ReliefPipeline::getWidth)
        .def("get_height", &ReliefPipeline::getHeight)
        .def("get_light_tracker", &ReliefPipeline::getLightTracker,
             py::return_value_policy::reference_internal);

    py::class_<Detection>(m, "Detection")
        .def(py::init<>())
        .def_readwrite("x1", &Detection::x1)
        .def_readwrite("y1", &Detection::y1)
        .def_readwrite("x2", &Detection::x2)
        .def_readwrite("y2", &Detection::y2)
        .def_readwrite("confidence", &Detection::confidence)
        .def_readwrite("class_id", &Detection::classId)
        .def_readwrite("class_name", &Detection::className)
        .def("center_x", &Detection::centerX)
        .def("center_y", &Detection::centerY)
        .def("area", &Detection::area);

    py::class_<DetectionResult>(m, "DetectionResult")
        .def(py::init<>())
        .def_readonly("detections", &DetectionResult::detections)
        .def_readonly("image_width", &DetectionResult::imageWidth)
        .def_readonly("image_height", &DetectionResult::imageHeight)
        .def_readonly("inference_time_ms", &DetectionResult::inferenceTimeMs);

    py::class_<IObjectDetector, std::shared_ptr<IObjectDetector>>(m, "IObjectDetector")
        .def("detect", (DetectionResult (IObjectDetector::*)(const Frame&)) &IObjectDetector::detect)
        .def("set_confidence_threshold", &IObjectDetector::setConfidenceThreshold)
        .def("set_nms_threshold", &IObjectDetector::setNMSThreshold)
        .def("set_target_classes", &IObjectDetector::setTargetClasses)
        .def("clear_target_classes", &IObjectDetector::clearTargetClasses)
        .def("get_name", &IObjectDetector::getName)
        .def("get_class_names", &IObjectDetector::getClassNames);

    py::class_<YOLODetector, IObjectDetector, std::shared_ptr<YOLODetector>>(m, "YOLODetector")
        .def(py::init<>())
        .def("init", &YOLODetector::init)
        .def("cleanup", &YOLODetector::cleanup)
        .def("detect", (DetectionResult (YOLODetector::*)(const uint8_t*, uint32_t, uint32_t, uint32_t)) &YOLODetector::detect)
        .def("set_confidence_threshold", &YOLODetector::setConfidenceThreshold)
        .def("set_nms_threshold", &YOLODetector::setNMSThreshold)
        .def("set_target_classes", &YOLODetector::setTargetClasses)
        .def("clear_target_classes", &YOLODetector::clearTargetClasses)
        .def("get_name", &YOLODetector::getName)
        .def("get_class_names", &YOLODetector::getClassNames);

    py::class_<ObjectDetectorFactory>(m, "ObjectDetectorFactory")
        .def_static("create", &ObjectDetectorFactory::create);

    py::class_<Vec3>(m, "Vec3")
        .def(py::init<>())
        .def(py::init<float, float, float>())
        .def_readwrite("x", &Vec3::x)
        .def_readwrite("y", &Vec3::y)
        .def_readwrite("z", &Vec3::z)
        .def("length", &Vec3::length)
        .def("normalized", &Vec3::normalized)
        .def_static("dot", &Vec3::dot)
        .def_static("slerp", &Vec3::slerp);

    py::class_<LightTracker::Config>(m, "LightTrackerConfig")
        .def(py::init<>())
        .def_readwrite("update_interval_sec", &LightTracker::Config::updateIntervalSec)
        .def_readwrite("interpolation_speed", &LightTracker::Config::interpolationSpeed)
        .def_readwrite("min_object_area", &LightTracker::Config::minObjectArea)
        .def_readwrite("max_object_area", &LightTracker::Config::maxObjectArea)
        .def_readwrite("enable_tracking", &LightTracker::Config::enableTracking)
        .def_readwrite("model_path", &LightTracker::Config::modelPath)
        .def_readwrite("target_classes", &LightTracker::Config::targetClasses)
        .def_readwrite("confidence_threshold", &LightTracker::Config::confidenceThreshold)
        .def_readwrite("nms_threshold", &LightTracker::Config::nmsThreshold)
        .def_readwrite("gpu_id", &LightTracker::Config::gpuId);

    py::class_<LightTracker>(m, "LightTracker")
        .def(py::init<>())
        .def("init", &LightTracker::init)
        .def("cleanup", &LightTracker::cleanup)
        .def("update_detections", &LightTracker::updateDetections)
        .def("update_frame", (void (LightTracker::*)(const Frame&)) &LightTracker::updateFrame)
        .def("get_light_params", &LightTracker::getLightParams)
        .def("get_current_light_dir", &LightTracker::getCurrentLightDir)
        .def("get_target_light_dir", &LightTracker::getTargetLightDir)
        .def("set_target_classes", &LightTracker::setTargetClasses)
        .def("set_update_interval", &LightTracker::setUpdateInterval)
        .def("set_interpolation_speed", &LightTracker::setInterpolationSpeed)
        .def("set_default_light_dir", &LightTracker::setDefaultLightDir)
        .def("set_light_params", &LightTracker::setLightParams)
        .def("get_last_detections", &LightTracker::getLastDetections,
             py::return_value_policy::reference_internal)
        .def("is_tracking", &LightTracker::isTracking)
        .def("step", &LightTracker::step);

    py::class_<IEdgeDetector, std::shared_ptr<IEdgeDetector>>(m, "IEdgeDetector")
        .def("process", &IEdgeDetector::process)
        .def("get_name", &IEdgeDetector::getName);

    py::class_<EdgeDetectorFactory>(m, "EdgeDetectorFactory")
        .def_static("create", &EdgeDetectorFactory::create);

    py::class_<SobelDetector, IEdgeDetector, std::shared_ptr<SobelDetector>>(m, "SobelDetector")
        .def(py::init<>())
        .def("set_threshold", &SobelDetector::setThreshold)
        .def("set_edge_strength", &SobelDetector::setEdgeStrength);

    py::class_<VideoReader>(m, "VideoReader")
        .def(py::init<>())
        .def("open", &VideoReader::open)
        .def("close", &VideoReader::close)
        .def("read_frame", &VideoReader::readFrame)
        .def("is_opened", &VideoReader::isOpened)
        .def("get_width", &VideoReader::getWidth)
        .def("get_height", &VideoReader::getHeight)
        .def("get_fps", &VideoReader::getFPS)
        .def("get_total_frames", &VideoReader::getTotalFrames);

    py::class_<VideoWriter::Config>(m, "VideoWriterConfig")
        .def(py::init<>())
        .def_readwrite("width", &VideoWriter::Config::width)
        .def_readwrite("height", &VideoWriter::Config::height)
        .def_readwrite("fps", &VideoWriter::Config::fps)
        .def_readwrite("bitrate", &VideoWriter::Config::bitrate)
        .def_readwrite("codec", &VideoWriter::Config::codec)
        .def_readwrite("output", &VideoWriter::Config::output);

    py::class_<VideoWriter>(m, "VideoWriter")
        .def(py::init<>())
        .def("open", &VideoWriter::open)
        .def("close", &VideoWriter::close)
        .def("write_frame", &VideoWriter::writeFrame)
        .def("is_opened", &VideoWriter::isOpened);

    py::class_<CameraReader::Config>(m, "CameraConfig")
        .def(py::init<>())
        .def_readwrite("camera_index", &CameraReader::Config::cameraIndex)
        .def_readwrite("width", &CameraReader::Config::width)
        .def_readwrite("height", &CameraReader::Config::height)
        .def_readwrite("fps", &CameraReader::Config::fps)
        .def_readwrite("format", &CameraReader::Config::format);

    py::class_<CameraReader>(m, "CameraReader")
        .def(py::init<>())
        .def("open", &CameraReader::open)
        .def("close", &CameraReader::close)
        .def("read_frame", &CameraReader::readFrame)
        .def("is_opened", &CameraReader::isOpened)
        .def("get_width", &CameraReader::getWidth)
        .def("get_height", &CameraReader::getHeight)
        .def("get_fps", &CameraReader::getFPS);

    py::enum_<LogLevel>(m, "LogLevel")
        .value("DEBUG", LogLevel::DEBUG)
        .value("INFO", LogLevel::INFO)
        .value("WARNING", LogLevel::WARNING)
        .value("ERROR", LogLevel::ERROR)
        .value("FATAL", LogLevel::FATAL);

    py::class_<Logger>(m, "Logger")
        .def_static("instance", &Logger::instance, py::return_value_policy::reference)
        .def("set_level", &Logger::setLevel)
        .def("get_level", &Logger::getLevel);

    m.def("set_log_level", [](LogLevel level) {
        Logger::instance().setLevel(level);
    });

    m.def("save_ppm", &utils::savePPM);
    m.def("load_ppm", &utils::loadPPM);

    m.def("process_image", [](const Frame& input, const LightParams& params,
                              float normalStrength, float sobelThreshold, float sobelStrength) {
        ReliefPipeline::Config config;
        config.width = input.width;
        config.height = input.height;
        config.lightParams = params;
        config.normalStrength = normalStrength;
        config.sobelThreshold = sobelThreshold;
        config.sobelStrength = sobelStrength;

        ReliefPipeline pipeline;
        if (!pipeline.init(config)) {
            throw std::runtime_error("Failed to initialize pipeline");
        }

        Frame output;
        if (!pipeline.processFrame(input, output)) {
            throw std::runtime_error("Failed to process frame");
        }

        pipeline.cleanup();
        return output;
    }, py::arg("input"), py::arg("params") = LightParams(),
       py::arg("normal_strength") = 1.0f,
       py::arg("sobel_threshold") = 30.0f,
       py::arg("sobel_strength") = 1.0f);

    m.def("process_image_with_tracking",
        [](const Frame& input, const std::string& modelPath,
           const std::vector<int>& targetClasses,
           const LightParams& params,
           float normalStrength, float sobelThreshold, float sobelStrength) {
        ReliefPipeline::Config config;
        config.width = input.width;
        config.height = input.height;
        config.lightParams = params;
        config.normalStrength = normalStrength;
        config.sobelThreshold = sobelThreshold;
        config.sobelStrength = sobelStrength;
        config.enableObjectTracking = true;
        config.yoloModelPath = modelPath;
        config.targetClasses = targetClasses;

        ReliefPipeline pipeline;
        if (!pipeline.init(config)) {
            throw std::runtime_error("Failed to initialize pipeline");
        }

        Frame output;
        if (!pipeline.processFrame(input, output)) {
            throw std::runtime_error("Failed to process frame");
        }

        auto tracker = pipeline.getLightTracker();
        auto detections = tracker->getLastDetections();

        pipeline.cleanup();

        return py::make_tuple(output, detections);
    }, py::arg("input"), py::arg("model_path"),
       py::arg("target_classes") = std::vector<int>{0, 2},
       py::arg("params") = LightParams(),
       py::arg("normal_strength") = 1.0f,
       py::arg("sobel_threshold") = 30.0f,
       py::arg("sobel_strength") = 1.0f);

    m.attr("COCO_CLASS_PERSON") = 0;
    m.attr("COCO_CLASS_BICYCLE") = 1;
    m.attr("COCO_CLASS_CAR") = 2;
    m.attr("COCO_CLASS_MOTORCYCLE") = 3;
    m.attr("COCO_CLASS_BUS") = 5;
    m.attr("COCO_CLASS_TRUCK") = 7;
}
