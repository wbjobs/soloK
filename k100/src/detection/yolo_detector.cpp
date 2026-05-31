#include "vk浮雕/yolo_detector.h"
#include "vk浮雕/logger.h"
#include <algorithm>
#include <numeric>
#include <cmath>
#include <cstring>
#include <chrono>

#ifdef USE_ONNXRUNTIME
#include <onnxruntime_cxx_api.h>
#endif

namespace vk浮雕 {

struct YOLODetector::Impl {
#ifdef USE_ONNXRUNTIME
    Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "vk浮雕"};
    Ort::SessionOptions sessionOptions;
    std::unique_ptr<Ort::Session> session;
    Ort::AllocatorWithDefaultOptions allocator;

    std::vector<const char*> inputNames;
    std::vector<const char*> outputNames;
    std::vector<std::string> inputNameStrings;
    std::vector<std::string> outputNameStrings;
#endif
};

YOLODetector::~YOLODetector() {
    cleanup();
}

void YOLODetector::loadClassNames() {
    m_classNames = {
        "person", "bicycle", "car", "motorcycle", "airplane",
        "bus", "train", "truck", "boat", "traffic light",
        "fire hydrant", "stop sign", "parking meter", "bench", "bird",
        "cat", "dog", "horse", "sheep", "cow",
        "elephant", "bear", "zebra", "giraffe", "backpack",
        "umbrella", "handbag", "tie", "suitcase", "frisbee",
        "skis", "snowboard", "sports ball", "kite", "baseball bat",
        "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
        "wine glass", "cup", "fork", "knife", "spoon",
        "bowl", "banana", "apple", "sandwich", "orange",
        "broccoli", "carrot", "hot dog", "pizza", "donut",
        "cake", "chair", "couch", "potted plant", "bed",
        "dining table", "toilet", "tv", "laptop", "mouse",
        "remote", "keyboard", "cell phone", "microwave", "oven",
        "toaster", "sink", "refrigerator", "book", "clock",
        "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
    };
}

bool YOLODetector::init(const std::string& modelPath, int gpuId) {
#ifdef USE_ONNXRUNTIME
    try {
        m_impl = new Impl();

        m_impl->sessionOptions.SetIntraOpNumThreads(4);
        m_impl->sessionOptions.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);

        if (gpuId >= 0) {
            OrtCUDAProviderOptions cudaOptions;
            cudaOptions.device_id = gpuId;
            m_impl->sessionOptions.AppendExecutionProvider_CUDA(cudaOptions);
            LOG_INFO() << "YOLO using CUDA device: " << gpuId;
        }

        m_impl->session = std::make_unique<Ort::Session>(
            m_impl->env, modelPath.c_str(), m_impl->sessionOptions);

        auto inputName = m_impl->session->GetInputNameAllocated(0, m_impl->allocator);
        m_impl->inputNameStrings.push_back(inputName.get());
        m_impl->inputNames.push_back(m_impl->inputNameStrings.back().c_str());

        size_t numOutputs = m_impl->session->GetOutputCount();
        for (size_t i = 0; i < numOutputs; i++) {
            auto outputName = m_impl->session->GetOutputNameAllocated(i, m_impl->allocator);
            m_impl->outputNameStrings.push_back(outputName.get());
            m_impl->outputNames.push_back(m_impl->outputNameStrings.back().c_str());
        }

        auto inputTypeInfo = m_impl->session->GetInputTypeInfo(0);
        auto inputTensorInfo = inputTypeInfo.GetTensorTypeAndShapeInfo();
        auto inputShape = inputTensorInfo.GetShape();

        if (inputShape.size() >= 4) {
            m_modelHeight = static_cast<int>(inputShape[2]);
            m_modelWidth = static_cast<int>(inputShape[3]);
        }

        loadClassNames();
        m_initialized = true;

        LOG_INFO() << "YOLO detector initialized: " << modelPath
                   << " (input: " << m_modelWidth << "x" << m_modelHeight << ")";
        return true;
    } catch (const Ort::Exception& e) {
        LOG_ERROR() << "ONNX Runtime error: " << e.what();
        return false;
    } catch (const std::exception& e) {
        LOG_ERROR() << "YOLO init error: " << e.what();
        return false;
    }
#else
    LOG_ERROR() << "ONNX Runtime not available. Rebuild with -DUSE_ONNXRUNTIME=ON";
    return false;
#endif
}

void YOLODetector::cleanup() {
#ifdef USE_ONNXRUNTIME
    if (m_impl) {
        m_impl->session.reset();
        delete m_impl;
        m_impl = nullptr;
    }
#endif
    m_initialized = false;
}

std::vector<uint8_t> YOLODetector::preprocess(const uint8_t* imageData,
    uint32_t width, uint32_t height, uint32_t channels) {
    std::vector<uint8_t> rgbData(width * height * 3);

    if (channels == 4) {
        for (uint32_t i = 0; i < width * height; i++) {
            rgbData[i * 3 + 0] = imageData[i * 4 + 0];
            rgbData[i * 3 + 1] = imageData[i * 4 + 1];
            rgbData[i * 3 + 2] = imageData[i * 4 + 2];
        }
    } else if (channels == 3) {
        std::memcpy(rgbData.data(), imageData, width * height * 3);
    }

    std::vector<uint8_t> resized(m_modelWidth * m_modelHeight * 3);

    float scaleX = static_cast<float>(width) / m_modelWidth;
    float scaleY = static_cast<float>(height) / m_modelHeight;

    for (int y = 0; y < m_modelHeight; y++) {
        for (int x = 0; x < m_modelWidth; x++) {
            int srcX = std::min(static_cast<int>(x * scaleX), static_cast<int>(width) - 1);
            int srcY = std::min(static_cast<int>(y * scaleY), static_cast<int>(height) - 1);

            resized[(y * m_modelWidth + x) * 3 + 0] = rgbData[(srcY * width + srcX) * 3 + 0];
            resized[(y * m_modelWidth + x) * 3 + 1] = rgbData[(srcY * width + srcX) * 3 + 1];
            resized[(y * m_modelWidth + x) * 3 + 2] = rgbData[(srcY * width + srcX) * 3 + 2];
        }
    }

    return resized;
}

DetectionResult YOLODetector::detect(const uint8_t* imageData, uint32_t width,
    uint32_t height, uint32_t channels) {
#ifdef USE_ONNXRUNTIME
    if (!m_initialized || !m_impl || !m_impl->session) {
        return {};
    }

    auto startTime = std::chrono::high_resolution_clock::now();

    auto resized = preprocess(imageData, width, height, channels);

    std::vector<float> inputData(m_modelWidth * m_modelHeight * 3);
    for (size_t i = 0; i < inputData.size(); i++) {
        inputData[i] = static_cast<float>(resized[i]) / 255.0f;
    }

    std::vector<float> chwData(m_modelWidth * m_modelHeight * 3);
    int planeSize = m_modelWidth * m_modelHeight;
    for (int y = 0; y < m_modelHeight; y++) {
        for (int x = 0; x < m_modelWidth; x++) {
            int srcIdx = (y * m_modelWidth + x) * 3;
            int dstIdx = y * m_modelWidth + x;
            chwData[dstIdx] = inputData[srcIdx];
            chwData[dstIdx + planeSize] = inputData[srcIdx + 1];
            chwData[dstIdx + planeSize * 2] = inputData[srcIdx + 2];
        }
    }

    std::array<int64_t, 4> inputShape = {1, 3, m_modelHeight, m_modelWidth};
    auto memoryInfo = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    Ort::Value inputTensor = Ort::Value::CreateTensor<float>(
        memoryInfo, chwData.data(), chwData.size(), inputShape.data(), inputShape.size());

    try {
        auto outputTensors = m_impl->session->Run(
            Ort::RunOptions{nullptr},
            m_impl->inputNames.data(), &inputTensor, 1,
            m_impl->outputNames.data(), m_impl->outputNames.size());

        auto& outputTensor = outputTensors[0];
        auto outputTypeInfo = outputTensor.GetTensorTypeAndShapeInfo();
        auto outputShape = outputTypeInfo.GetShape();

        uint32_t numDetections = static_cast<uint32_t>(outputShape[1]);
        uint32_t numValues = static_cast<uint32_t>(outputShape[2]);
        const float* outputData = outputTensor.GetTensorData<float>();

        auto detections = postprocess(outputData, numValues, 1, numDetections, width, height);

        auto endTime = std::chrono::high_resolution_clock::now();
        double inferenceMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();

        DetectionResult result;
        result.detections = detections;
        result.imageWidth = width;
        result.imageHeight = height;
        result.inferenceTimeMs = inferenceMs;
        return result;

    } catch (const Ort::Exception& e) {
        LOG_ERROR() << "YOLO inference error: " << e.what();
        return {};
    }
#else
    return {};
#endif
}

std::vector<Detection> YOLODetector::postprocess(const float* output,
    uint32_t outputWidth, uint32_t outputHeight,
    uint32_t numDetections, uint32_t imageWidth, uint32_t imageHeight) {
    std::vector<Detection> candidates;
    int numClasses = static_cast<int>(outputWidth) - 4;

    for (uint32_t d = 0; d < numDetections; d++) {
        const float* row = output + d * outputWidth;

        float cx = row[0];
        float cy = row[1];
        float w = row[2];
        float h = row[3];

        int bestClass = 0;
        float bestScore = 0.0f;
        for (int c = 0; c < numClasses; c++) {
            float score = row[4 + c];
            if (score > bestScore) {
                bestScore = score;
                bestClass = c;
            }
        }

        if (bestScore < m_confThreshold) continue;

        if (!m_targetClasses.empty()) {
            bool found = false;
            for (int tc : m_targetClasses) {
                if (tc == bestClass) { found = true; break; }
            }
            if (!found) continue;
        }

        float scaleX = static_cast<float>(imageWidth) / m_modelWidth;
        float scaleY = static_cast<float>(imageHeight) / m_modelHeight;

        Detection det;
        det.x1 = (cx - w * 0.5f) * scaleX;
        det.y1 = (cy - h * 0.5f) * scaleY;
        det.x2 = (cx + w * 0.5f) * scaleX;
        det.y2 = (cy + h * 0.5f) * scaleY;
        det.confidence = bestScore;
        det.classId = bestClass;
        if (bestClass < static_cast<int>(m_classNames.size())) {
            det.className = m_classNames[bestClass];
        }

        det.x1 = std::clamp(det.x1, 0.0f, static_cast<float>(imageWidth));
        det.y1 = std::clamp(det.y1, 0.0f, static_cast<float>(imageHeight));
        det.x2 = std::clamp(det.x2, 0.0f, static_cast<float>(imageWidth));
        det.y2 = std::clamp(det.y2, 0.0f, static_cast<float>(imageHeight));

        candidates.push_back(det);
    }

    return nms(candidates, m_nmsThreshold);
}

float YOLODetector::iou(const Detection& a, const Detection& b) {
    float ix1 = std::max(a.x1, b.x1);
    float iy1 = std::max(a.y1, b.y1);
    float ix2 = std::min(a.x2, b.x2);
    float iy2 = std::min(a.y2, b.y2);

    float iWidth = std::max(0.0f, ix2 - ix1);
    float iHeight = std::max(0.0f, iy2 - iy1);
    float intersection = iWidth * iHeight;

    float areaA = a.area();
    float areaB = b.area();
    float union_ = areaA + areaB - intersection;

    return union_ > 0.0f ? intersection / union_ : 0.0f;
}

std::vector<Detection> YOLODetector::nms(std::vector<Detection>& detections, float iouThreshold) {
    std::sort(detections.begin(), detections.end(),
        [](const Detection& a, const Detection& b) {
            return a.confidence > b.confidence;
        });

    std::vector<bool> suppressed(detections.size(), false);
    std::vector<Detection> result;

    for (size_t i = 0; i < detections.size(); i++) {
        if (suppressed[i]) continue;
        result.push_back(detections[i]);

        for (size_t j = i + 1; j < detections.size(); j++) {
            if (suppressed[j]) continue;
            if (detections[i].classId == detections[j].classId) {
                if (iou(detections[i], detections[j]) > iouThreshold) {
                    suppressed[j] = true;
                }
            }
        }
    }

    return result;
}

}
