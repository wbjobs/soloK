#include "vk浮雕/camera_reader.h"
#include "vk浮雕/logger.h"
#include <sstream>

namespace vk浮雕 {

CameraReader::~CameraReader() {
    close();
}

bool CameraReader::open(const Config& config) {
    avdevice_register_all();
    avformat_network_init();
    
    std::string inputUrl = buildCameraUrl(config);
    
    const AVInputFormat* inputFormat = av_find_input_format(config.format.c_str());
    if (!inputFormat) {
        LOG_ERROR() << "Input format not found: " << config.format;
        return false;
    }
    
    m_formatContext = avformat_alloc_context();
    if (!m_formatContext) {
        LOG_ERROR() << "Failed to allocate format context";
        return false;
    }
    
    AVDictionary* options = nullptr;
    av_dict_set(&options, "framerate", std::to_string(config.fps).c_str(), 0);
    av_dict_set(&options, "video_size", (std::to_string(config.width) + "x" + std::to_string(config.height)).c_str(), 0);
    av_dict_set(&options, "rtbufsize", "30412800", 0);
    
    if (avformat_open_input(&m_formatContext, inputUrl.c_str(), inputFormat, &options) != 0) {
        LOG_ERROR() << "Failed to open camera: " << inputUrl;
        av_dict_free(&options);
        return false;
    }
    av_dict_free(&options);
    
    if (avformat_find_stream_info(m_formatContext, nullptr) < 0) {
        LOG_ERROR() << "Failed to find stream info";
        return false;
    }
    
    m_videoStreamIndex = -1;
    for (unsigned int i = 0; i < m_formatContext->nb_streams; i++) {
        if (m_formatContext->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
            m_videoStreamIndex = i;
            break;
        }
    }
    
    if (m_videoStreamIndex == -1) {
        LOG_ERROR() << "No video stream found";
        return false;
    }
    
    AVCodecParameters* codecPar = m_formatContext->streams[m_videoStreamIndex]->codecpar;
    const AVCodec* codec = avcodec_find_decoder(codecPar->codec_id);
    if (!codec) {
        LOG_ERROR() << "Codec not found";
        return false;
    }
    
    m_codecContext = avcodec_alloc_context3(codec);
    if (!m_codecContext) {
        LOG_ERROR() << "Failed to allocate codec context";
        return false;
    }
    
    avcodec_parameters_to_context(m_codecContext, codecPar);
    
    if (avcodec_open2(m_codecContext, codec, nullptr) < 0) {
        LOG_ERROR() << "Failed to open codec";
        return false;
    }
    
    m_width = m_codecContext->width;
    m_height = m_codecContext->height;
    m_fps = config.fps;
    
    m_swsContext = sws_getContext(
        m_width, m_height, m_codecContext->pix_fmt,
        m_width, m_height, AV_PIX_FMT_RGBA,
        SWS_BILINEAR, nullptr, nullptr, nullptr
    );
    
    if (!m_swsContext) {
        LOG_ERROR() << "Failed to create sws context";
        return false;
    }
    
    m_packet = av_packet_alloc();
    m_frame = av_frame_alloc();
    
    m_opened = true;
    LOG_INFO() << "Camera opened: " << m_width << "x" << m_height << " @ " << m_fps << "fps";
    return true;
}

void CameraReader::close() {
    if (m_swsContext) {
        sws_freeContext(m_swsContext);
        m_swsContext = nullptr;
    }
    
    if (m_frame) {
        av_frame_free(&m_frame);
        m_frame = nullptr;
    }
    
    if (m_packet) {
        av_packet_free(&m_packet);
        m_packet = nullptr;
    }
    
    if (m_codecContext) {
        avcodec_close(m_codecContext);
        avcodec_free_context(&m_codecContext);
        m_codecContext = nullptr;
    }
    
    if (m_formatContext) {
        avformat_close_input(&m_formatContext);
        m_formatContext = nullptr;
    }
    
    m_opened = false;
    m_videoStreamIndex = -1;
    m_width = 0;
    m_height = 0;
    m_fps = 0.0;
}

bool CameraReader::readFrame(Frame& frame) {
    if (!m_opened) return false;
    
    bool gotFrame = false;
    int maxAttempts = 10;
    
    for (int attempt = 0; attempt < maxAttempts && !gotFrame; attempt++) {
        int ret = av_read_frame(m_formatContext, m_packet);
        if (ret < 0) {
            LOG_ERROR() << "Error reading camera frame: " << ret;
            return false;
        }
        
        if (m_packet->stream_index == m_videoStreamIndex) {
            if (decodePacket(m_packet, m_frame, gotFrame) && gotFrame) {
                convertFrame(m_frame, frame);
            }
        }
        
        av_packet_unref(m_packet);
    }
    
    return gotFrame;
}

bool CameraReader::decodePacket(AVPacket* packet, AVFrame* frame, bool& gotFrame) {
    int ret = avcodec_send_packet(m_codecContext, packet);
    if (ret < 0) {
        return false;
    }
    
    ret = avcodec_receive_frame(m_codecContext, frame);
    if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
        gotFrame = false;
        return true;
    } else if (ret < 0) {
        return false;
    }
    
    gotFrame = true;
    return true;
}

bool CameraReader::convertFrame(AVFrame* srcFrame, Frame& dstFrame) {
    dstFrame.allocate(m_width, m_height);
    
    uint8_t* dstData[4] = { dstFrame.ptr(), nullptr, nullptr, nullptr };
    int dstLinesize[4] = { static_cast<int>(m_width * 4), 0, 0, 0 };
    
    sws_scale(m_swsContext,
              srcFrame->data, srcFrame->linesize, 0, m_height,
              dstData, dstLinesize);
    
    return true;
}

std::string CameraReader::buildCameraUrl(const Config& config) {
    std::ostringstream oss;
    
#ifdef _WIN32
    if (config.format == "dshow") {
        oss << "video=" << config.cameraIndex;
    } else
#endif
    {
        oss << "/dev/video" << config.cameraIndex;
    }
    
    return oss.str();
}

}
