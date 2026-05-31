#include "vk浮雕/relief_pipeline.h"
#include "vk浮雕/video_reader.h"
#include "vk浮雕/video_writer.h"
#include "vk浮雕/logger.h"
#include <iostream>

using namespace vk浮雕;

int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cout << "Usage: example_basic <input_video> <output_video>\n";
        return 1;
    }
    
    std::string inputPath = argv[1];
    std::string outputPath = argv[2];
    
    Logger::instance().setLevel(LogLevel::INFO);
    LOG_INFO() << "Basic vk浮雕 example";
    
    VideoReader reader;
    if (!reader.open(inputPath)) {
        LOG_ERROR() << "Failed to open input: " << inputPath;
        return 1;
    }
    
    uint32_t width = reader.getWidth();
    uint32_t height = reader.getHeight();
    double fps = reader.getFPS();
    
    ReliefPipeline::Config pipelineConfig;
    pipelineConfig.width = width;
    pipelineConfig.height = height;
    pipelineConfig.edgeDetectorType = "sobel";
    pipelineConfig.normalStrength = 1.0f;
    pipelineConfig.sobelThreshold = 30.0f;
    pipelineConfig.sobelStrength = 1.0f;
    pipelineConfig.lightParams.ambientIntensity = 0.3f;
    pipelineConfig.lightParams.directionalIntensity = 1.2f;
    pipelineConfig.lightParams.lightDirX = -0.5f;
    pipelineConfig.lightParams.lightDirY = -0.5f;
    pipelineConfig.lightParams.lightDirZ = 0.7f;
    
    ReliefPipeline pipeline;
    if (!pipeline.init(pipelineConfig)) {
        LOG_ERROR() << "Failed to initialize pipeline";
        return 1;
    }
    
    VideoWriter::Config writerConfig;
    writerConfig.width = width;
    writerConfig.height = height;
    writerConfig.fps = fps;
    writerConfig.bitrate = 4000000;
    writerConfig.output = outputPath;
    
    VideoWriter writer;
    if (!writer.open(writerConfig)) {
        LOG_ERROR() << "Failed to open output: " << outputPath;
        return 1;
    }
    
    Frame inputFrame, outputFrame;
    int frameCount = 0;
    
    LOG_INFO() << "Processing...";
    
    while (reader.readFrame(inputFrame)) {
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
            LOG_INFO() << "Processed " << frameCount << " frames";
        }
    }
    
    LOG_INFO() << "Done! Total frames: " << frameCount;
    
    writer.close();
    pipeline.cleanup();
    reader.close();
    
    return 0;
}
