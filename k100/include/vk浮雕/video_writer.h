#pragma once

#include <string>
#include <vector>
#include "common.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswscale/swscale.h>
#include <libavutil/imgutils.h>
}

namespace vk浮雕 {

class VideoWriter {
public:
    struct Config {
        uint32_t width = 1920;
        uint32_t height = 1080;
        double fps = 30.0;
        int bitrate = 4000000;
        std::string codec = "libx264";
        std::string output;
    };

    VideoWriter() = default;
    ~VideoWriter();
    
    bool open(const Config& config);
    void close();
    
    bool writeFrame(const Frame& frame);
    
    bool isOpened() const { return m_opened; }
    
private:
    bool convertFrame(const Frame& srcFrame, AVFrame* dstFrame);
    bool encodeAndWrite(AVFrame* frame);
    
    AVFormatContext* m_formatContext = nullptr;
    AVCodecContext* m_codecContext = nullptr;
    SwsContext* m_swsContext = nullptr;
    AVStream* m_stream = nullptr;
    AVPacket* m_packet = nullptr;
    AVFrame* m_frame = nullptr;
    AVFrame* m_rgbaFrame = nullptr;
    
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    double m_fps = 0.0;
    int64_t m_pts = 0;
    bool m_opened = false;
    bool m_isRtmp = false;
};

}
