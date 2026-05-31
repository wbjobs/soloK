#include "vk浮雕/cli_parser.h"
#include "vk浮雕/relief_pipeline.h"
#include "vk浮雕/video_reader.h"
#include "vk浮雕/video_writer.h"
#include "vk浮雕/camera_reader.h"
#include "vk浮雕/logger.h"
#include <chrono>
#include <csignal>

using namespace vk浮雕;

static volatile bool g_running = true;

void signalHandler(int signal) {
    if (signal == SIGINT || signal == SIGTERM) {
        g_running = false;
        LOG_INFO() << "Received shutdown signal...";
    }
}

int main(int argc, char* argv[]) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    CLIParser parser;
    CLIParser::Options options;
    
    if (!parser.parse(argc, argv, options)) {
        return 1;
    }
    
    if (options.showHelp) {
        parser.printHelp();
        return 0;
    }
    
    if (options.verbose) {
        Logger::instance().setLevel(LogLevel::DEBUG);
    }
    
    LOG_INFO() << "Starting vk浮雕...";
    
    ReliefPipeline::Config pipelineConfig;
    pipelineConfig.width = options.outputWidth;
    pipelineConfig.height = options.outputHeight;
    pipelineConfig.edgeDetectorType = options.edgeDetector;
    pipelineConfig.lightParams = options.lightParams;
    pipelineConfig.normalStrength = options.normalStrength;
    pipelineConfig.sobelThreshold = options.sobelThreshold;
    pipelineConfig.sobelStrength = options.sobelStrength;
    pipelineConfig.enableObjectTracking = options.enableTracking;
    pipelineConfig.yoloModelPath = options.yoloModelPath;
    pipelineConfig.targetClasses = options.targetClasses;
    pipelineConfig.trackingUpdateInterval = options.trackingUpdateInterval;
    pipelineConfig.trackingConfidence = options.trackingConfidence;
    pipelineConfig.trackingGpuId = options.trackingGpuId;
    
    ReliefPipeline pipeline;
    if (!pipeline.init(pipelineConfig)) {
        LOG_ERROR() << "Failed to initialize relief pipeline";
        return 1;
    }
    
    std::unique_ptr<VideoReader> videoReader;
    std::unique_ptr<CameraReader> cameraReader;
    Frame inputFrame;
    double inputFps = options.outputFps;
    uint32_t inputWidth = options.outputWidth;
    uint32_t inputHeight = options.outputHeight;
    
    if (options.useCamera) {
        cameraReader = std::make_unique<CameraReader>();
        CameraReader::Config cameraConfig;
        cameraConfig.cameraIndex = options.cameraIndex;
        cameraConfig.width = options.cameraWidth;
        cameraConfig.height = options.cameraHeight;
        cameraConfig.fps = options.cameraFps;
        
        if (!cameraReader->open(cameraConfig)) {
            LOG_ERROR() << "Failed to open camera";
            return 1;
        }
        
        inputFps = cameraReader->getFPS();
        inputWidth = cameraReader->getWidth();
        inputHeight = cameraReader->getHeight();
    } else {
        videoReader = std::make_unique<VideoReader>();
        if (!videoReader->open(options.input)) {
            LOG_ERROR() << "Failed to open input: " << options.input;
            return 1;
        }
        
        inputFps = videoReader->getFPS();
        inputWidth = videoReader->getWidth();
        inputHeight = videoReader->getHeight();
        LOG_INFO() << "Total frames: " << videoReader->getTotalFrames();
    }
    
    VideoWriter::Config writerConfig;
    writerConfig.width = options.outputWidth;
    writerConfig.height = options.outputHeight;
    writerConfig.fps = options.outputFps > 0 ? options.outputFps : inputFps;
    writerConfig.bitrate = options.bitrate;
    writerConfig.output = options.output;
    
    VideoWriter writer;
    if (!writer.open(writerConfig)) {
        LOG_ERROR() << "Failed to open output: " << options.output;
        return 1;
    }
    
    Frame outputFrame;
    int64_t frameCount = 0;
    auto startTime = std::chrono::high_resolution_clock::now();
    
    LOG_INFO() << "Processing started...";
    
    while (g_running) {
        if (options.maxFrames > 0 && frameCount >= options.maxFrames) {
            break;
        }
        
        bool readSuccess = false;
        if (options.useCamera) {
            readSuccess = cameraReader->readFrame(inputFrame);
        } else {
            readSuccess = videoReader->readFrame(inputFrame);
        }
        
        if (!readSuccess) {
            if (!options.useCamera) {
                LOG_INFO() << "End of video stream";
            } else {
                LOG_WARNING() << "Failed to read frame";
            }
            break;
        }
        
        if (!pipeline.processFrame(inputFrame, outputFrame)) {
            LOG_ERROR() << "Failed to process frame " << frameCount;
            break;
        }
        
        if (!writer.writeFrame(outputFrame)) {
            LOG_ERROR() << "Failed to write frame " << frameCount;
            break;
        }
        
        frameCount++;
        
        if (frameCount % 30 == 0) {
            auto currentTime = std::chrono::high_resolution_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                currentTime - startTime).count() / 1000.0;
            double fps = frameCount / elapsed;
            LOG_INFO() << "Processed " << frameCount << " frames, " 
                      << fps << " fps";
        }
    }
    
    auto endTime = std::chrono::high_resolution_clock::now();
    auto totalTime = std::chrono::duration_cast<std::chrono::milliseconds>(
        endTime - startTime).count() / 1000.0;
    
    LOG_INFO() << "Processing complete:";
    LOG_INFO() << "  Total frames: " << frameCount;
    LOG_INFO() << "  Total time: " << totalTime << "s";
    LOG_INFO() << "  Average FPS: " << (frameCount / totalTime);
    
    writer.close();
    pipeline.cleanup();
    
    if (videoReader) videoReader->close();
    if (cameraReader) cameraReader->close();
    
    LOG_INFO() << "vk浮雕 shutdown complete";
    return 0;
}
