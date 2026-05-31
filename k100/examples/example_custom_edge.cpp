#include "vk浮雕/relief_pipeline.h"
#include "vk浮雕/edge_detector.h"
#include "vk浮雕/video_reader.h"
#include "vk浮雕/video_writer.h"
#include "vk浮雕/logger.h"
#include <cmath>
#include <vector>

using namespace vk浮雕;

class CustomEdgeDetector : public IEdgeDetector {
public:
    CustomEdgeDetector() = default;
    ~CustomEdgeDetector() override = default;
    
    bool init(VulkanContext* context, uint32_t width, uint32_t height) override {
        m_width = width;
        m_height = height;
        m_context = context;
        return true;
    }
    
    void cleanup() override {
        m_context = nullptr;
        m_width = 0;
        m_height = 0;
    }
    
    void process(const Frame& inputFrame, Frame& outputEdge, FrameFloat& outputHeight) override {
        outputEdge.allocate(m_width, m_height);
        outputHeight.allocate(m_width, m_height);
        
        const uint8_t* src = inputFrame.ptr();
        uint8_t* edgeDst = outputEdge.ptr();
        float* heightDst = outputHeight.ptr();
        
        for (int y = 0; y < m_height; y++) {
            for (int x = 0; x < m_width; x++) {
                int idx = (y * m_width + x) * 4;
                
                float gray = 0.299f * src[idx] + 0.587f * src[idx + 1] + 0.114f * src[idx + 2];
                
                float gx = 0, gy = 0;
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        int nx = std::clamp(x + dx, 0, (int)m_width - 1);
                        int ny = std::clamp(y + dy, 0, (int)m_height - 1);
                        int nidx = (ny * m_width + nx) * 4;
                        float ngray = 0.299f * src[nidx] + 0.587f * src[nidx + 1] + 0.114f * src[nidx + 2];
                        
                        float sx = dx * (dx == 0 ? 2 : 1);
                        float sy = dy * (dy == 0 ? 2 : 1);
                        gx += ngray * sx;
                        gy += ngray * sy;
                    }
                }
                
                float magnitude = std::sqrt(gx * gx + gy * gy);
                float edge = magnitude > 30.0f ? magnitude : 0.0f;
                edge = std::clamp(edge, 0.0f, 255.0f);
                
                edgeDst[idx] = (uint8_t)edge;
                edgeDst[idx + 1] = (uint8_t)edge;
                edgeDst[idx + 2] = (uint8_t)edge;
                edgeDst[idx + 3] = 255;
                
                float normalizedEdge = edge / 255.0f;
                heightDst[y * m_width + x] = normalizedEdge * 0.5f + 0.5f;
            }
        }
    }
    
    std::string getName() const override { return "CustomCPU"; }
    
private:
    VulkanContext* m_context = nullptr;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
};

int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cout << "Usage: example_custom_edge <input_video> <output_video>\n";
        return 1;
    }
    
    Logger::instance().setLevel(LogLevel::INFO);
    LOG_INFO() << "Custom edge detector example";
    
    VideoReader reader;
    if (!reader.open(argv[1])) {
        LOG_ERROR() << "Failed to open input";
        return 1;
    }
    
    uint32_t width = reader.getWidth();
    uint32_t height = reader.getHeight();
    double fps = reader.getFPS();
    
    ReliefPipeline::Config pipelineConfig;
    pipelineConfig.width = width;
    pipelineConfig.height = height;
    pipelineConfig.edgeDetectorType = "sobel";
    
    ReliefPipeline pipeline;
    if (!pipeline.init(pipelineConfig)) {
        LOG_ERROR() << "Failed to initialize pipeline";
        return 1;
    }
    
    auto customDetector = std::make_unique<CustomEdgeDetector>();
    pipeline.setEdgeDetector(std::move(customDetector));
    
    VideoWriter::Config writerConfig;
    writerConfig.width = width;
    writerConfig.height = height;
    writerConfig.fps = fps;
    writerConfig.bitrate = 4000000;
    writerConfig.output = argv[2];
    
    VideoWriter writer;
    if (!writer.open(writerConfig)) {
        LOG_ERROR() << "Failed to open output";
        return 1;
    }
    
    Frame inputFrame, outputFrame;
    int frameCount = 0;
    
    while (reader.readFrame(inputFrame) && frameCount < 100) {
        pipeline.processFrame(inputFrame, outputFrame);
        writer.writeFrame(outputFrame);
        frameCount++;
        if (frameCount % 10 == 0) {
            LOG_INFO() << "Processed " << frameCount << " frames";
        }
    }
    
    LOG_INFO() << "Done! Total frames: " << frameCount;
    
    writer.close();
    pipeline.cleanup();
    reader.close();
    
    return 0;
}
