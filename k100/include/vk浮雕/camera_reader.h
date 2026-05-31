#pragma once

#include <string>
#include <memory>
#include "common.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswscale/swscale.h>
#include <libavutil/imgutils.h>
#include <libavdevice/avdevice.h>
}

namespace vk浮雕 {

class CameraReader {
public:
    struct Config {
        int cameraIndex = 0;
        uint32_t width = 1280;
        uint32_t height = 720;
        double fps = 30.0;
        std::string format = "dshow";
    };

    CameraReader() = default;
    ~CameraReader();
    
    bool open(const Config& config);
    void close();
    
    bool readFrame(Frame& frame);
    
    bool isOpened() const { return m_opened; }
    uint32_t getWidth() const { return m_width; }
    uint32_t getHeight() const { return m_height; }
    double getFPS() const { return m_fps; }
    
private:
    bool decodePacket(AVPacket* packet, AVFrame* frame, bool& gotFrame);
    bool convertFrame(AVFrame* srcFrame, Frame& dstFrame);
    std::string buildCameraUrl(const Config& config);
    
    AVFormatContext* m_formatContext = nullptr;
    AVCodecContext* m_codecContext = nullptr;
    SwsContext* m_swsContext = nullptr;
    AVPacket* m_packet = nullptr;
    AVFrame* m_frame = nullptr;
    
    int m_videoStreamIndex = -1;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    double m_fps = 0.0;
    bool m_opened = false;
};

}
