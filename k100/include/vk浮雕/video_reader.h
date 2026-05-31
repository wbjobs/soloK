#pragma once

#include <string>
#include <memory>
#include <vector>
#include "common.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswscale/swscale.h>
#include <libavutil/imgutils.h>
}

namespace vk浮雕 {

class VideoReader {
public:
    VideoReader() = default;
    ~VideoReader();
    
    bool open(const std::string& source);
    void close();
    
    bool readFrame(Frame& frame);
    
    bool isOpened() const { return m_opened; }
    uint32_t getWidth() const { return m_width; }
    uint32_t getHeight() const { return m_height; }
    double getFPS() const { return m_fps; }
    int64_t getTotalFrames() const { return m_totalFrames; }
    
private:
    bool decodePacket(AVPacket* packet, AVFrame* frame, bool& gotFrame);
    bool convertFrame(AVFrame* srcFrame, Frame& dstFrame);
    
    AVFormatContext* m_formatContext = nullptr;
    AVCodecContext* m_codecContext = nullptr;
    SwsContext* m_swsContext = nullptr;
    AVPacket* m_packet = nullptr;
    AVFrame* m_frame = nullptr;
    
    int m_videoStreamIndex = -1;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    double m_fps = 0.0;
    int64_t m_totalFrames = 0;
    bool m_opened = false;
};

}
