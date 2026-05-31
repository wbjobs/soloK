#include "vk浮雕/video_writer.h"
#include "vk浮雕/logger.h"
#include "vk浮雕/utils.h"

namespace vk浮雕 {

VideoWriter::~VideoWriter() {
    close();
}

bool VideoWriter::open(const Config& config) {
    m_width = config.width;
    m_height = config.height;
    m_fps = config.fps;
    m_isRtmp = utils::isRtmpUrl(config.output);
    
    avformat_network_init();
    
    const AVCodec* codec = avcodec_find_encoder_by_name(config.codec.c_str());
    if (!codec) {
        codec = avcodec_find_encoder(AV_CODEC_ID_H264);
    }
    
    if (!codec) {
        LOG_ERROR() << "Codec not found: " << config.codec;
        return false;
    }
    
    m_codecContext = avcodec_alloc_context3(codec);
    if (!m_codecContext) {
        LOG_ERROR() << "Failed to allocate codec context";
        return false;
    }
    
    m_codecContext->height = m_height;
    m_codecContext->width = m_width;
    m_codecContext->sample_aspect_ratio = AVRational{1, 1};
    m_codecContext->pix_fmt = AV_PIX_FMT_YUV420P;
    m_codecContext->time_base = AVRational{1, static_cast<int>(m_fps)};
    m_codecContext->framerate = AVRational{static_cast<int>(m_fps), 1};
    m_codecContext->max_b_frames = 2;
    m_codecContext->gop_size = 30;
    m_codecContext->bit_rate = config.bitrate;
    
    if (m_isRtmp) {
        m_codecContext->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
    }
    
    AVDictionary* codecOptions = nullptr;
    av_dict_set(&codecOptions, "preset", "veryfast", 0);
    av_dict_set(&codecOptions, "tune", "zerolatency", 0);
    
    if (avcodec_open2(m_codecContext, codec, &codecOptions) < 0) {
        LOG_ERROR() << "Failed to open codec";
        av_dict_free(&codecOptions);
        return false;
    }
    av_dict_free(&codecOptions);
    
    if (avformat_alloc_output_context2(&m_formatContext, nullptr, nullptr, config.output.c_str()) < 0) {
        LOG_ERROR() << "Failed to allocate output context";
        return false;
    }
    
    m_stream = avformat_new_stream(m_formatContext, nullptr);
    if (!m_stream) {
        LOG_ERROR() << "Failed to create stream";
        return false;
    }
    
    avcodec_parameters_from_context(m_stream->codecpar, m_codecContext);
    m_stream->time_base = m_codecContext->time_base;
    m_stream->avg_frame_rate = m_codecContext->framerate;
    
    if (!(m_formatContext->oformat->flags & AVFMT_NOFILE)) {
        if (avio_open(&m_formatContext->pb, config.output.c_str(), AVIO_FLAG_WRITE) < 0) {
            LOG_ERROR() << "Failed to open output: " << config.output;
            return false;
        }
    }
    
    AVDictionary* formatOptions = nullptr;
    if (m_isRtmp) {
        av_dict_set(&formatOptions, "flvflags", "no_duration_filesize", 0);
    }
    
    if (avformat_write_header(m_formatContext, &formatOptions) < 0) {
        LOG_ERROR() << "Failed to write header";
        av_dict_free(&formatOptions);
        return false;
    }
    av_dict_free(&formatOptions);
    
    m_swsContext = sws_getContext(
        m_width, m_height, AV_PIX_FMT_RGBA,
        m_width, m_height, AV_PIX_FMT_YUV420P,
        SWS_BILINEAR, nullptr, nullptr, nullptr
    );
    
    if (!m_swsContext) {
        LOG_ERROR() << "Failed to create sws context";
        return false;
    }
    
    m_frame = av_frame_alloc();
    m_frame->format = AV_PIX_FMT_YUV420P;
    m_frame->width = m_width;
    m_frame->height = m_height;
    av_frame_get_buffer(m_frame, 32);
    
    m_rgbaFrame = av_frame_alloc();
    m_rgbaFrame->format = AV_PIX_FMT_RGBA;
    m_rgbaFrame->width = m_width;
    m_rgbaFrame->height = m_height;
    
    m_packet = av_packet_alloc();
    m_pts = 0;
    
    m_opened = true;
    LOG_INFO() << "Video writer opened: " << m_width << "x" << m_height << " @ " << m_fps << "fps";
    return true;
}

void VideoWriter::close() {
    if (!m_opened) return;
    
    if (m_formatContext) {
        av_write_trailer(m_formatContext);
    }
    
    if (m_swsContext) {
        sws_freeContext(m_swsContext);
        m_swsContext = nullptr;
    }
    
    if (m_rgbaFrame) {
        av_frame_free(&m_rgbaFrame);
        m_rgbaFrame = nullptr;
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
        if (m_formatContext->pb && !(m_formatContext->oformat->flags & AVFMT_NOFILE)) {
            avio_closep(&m_formatContext->pb);
        }
        avformat_free_context(m_formatContext);
        m_formatContext = nullptr;
    }
    
    m_stream = nullptr;
    m_opened = false;
    m_isRtmp = false;
    m_pts = 0;
    LOG_INFO() << "Video writer closed";
}

bool VideoWriter::writeFrame(const Frame& frame) {
    if (!m_opened) return false;
    
    if (frame.width != m_width || frame.height != m_height) {
        LOG_ERROR() << "Frame size mismatch";
        return false;
    }
    
    if (!convertFrame(frame, m_frame)) {
        return false;
    }
    
    m_frame->pts = m_pts++;
    
    return encodeAndWrite(m_frame);
}

bool VideoWriter::convertFrame(const Frame& srcFrame, AVFrame* dstFrame) {
    uint8_t* srcData[4] = { const_cast<uint8_t*>(srcFrame.ptr()), nullptr, nullptr, nullptr };
    int srcLinesize[4] = { static_cast<int>(m_width * 4), 0, 0, 0 };
    
    sws_scale(m_swsContext,
              srcData, srcLinesize, 0, m_height,
              dstFrame->data, dstFrame->linesize);
    
    return true;
}

bool VideoWriter::encodeAndWrite(AVFrame* frame) {
    int ret = avcodec_send_frame(m_codecContext, frame);
    if (ret < 0) {
        LOG_ERROR() << "Error sending frame: " << ret;
        return false;
    }
    
    while (true) {
        ret = avcodec_receive_packet(m_codecContext, m_packet);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            break;
        } else if (ret < 0) {
            LOG_ERROR() << "Error receiving packet: " << ret;
            return false;
        }
        
        av_packet_rescale_ts(m_packet, m_codecContext->time_base, m_stream->time_base);
        m_packet->stream_index = m_stream->index;
        
        ret = av_interleaved_write_frame(m_formatContext, m_packet);
        if (ret < 0) {
            LOG_ERROR() << "Error writing packet: " << ret;
            av_packet_unref(m_packet);
            return false;
        }
        
        av_packet_unref(m_packet);
    }
    
    return true;
}

}
