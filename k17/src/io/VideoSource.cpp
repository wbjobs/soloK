#include "io/VideoSource.h"
#include <QDir>
#include <QDirIterator>
#include <QDebug>

VideoSource::VideoSource(QObject* parent)
    : QObject(parent)
    , m_timer(new QTimer(this))
    , m_frameIndex(0)
    , m_totalFrames(0)
    , m_fps(30)
    , m_sourceType(Camera)
    , m_isCapturing(false)
{
    connect(m_timer, &QTimer::timeout, this, &VideoSource::onTimer);
}

VideoSource::~VideoSource() {
    stopCapture();
    close();
}

bool VideoSource::openCamera(int cameraIndex) {
    close();
    m_capture = std::make_unique<cv::VideoCapture>(cameraIndex);
    if (!m_capture->isOpened()) {
        emit error("Failed to open camera");
        return false;
    }
    m_sourceType = Camera;
    m_totalFrames = -1;
    m_frameIndex = 0;
    double fps = m_capture->get(cv::CAP_PROP_FPS);
    if (fps > 0) m_fps = static_cast<int>(fps);
    return true;
}

bool VideoSource::openVideo(const QString& filePath) {
    close();
    m_capture = std::make_unique<cv::VideoCapture>(filePath.toStdString());
    if (!m_capture->isOpened()) {
        emit error("Failed to open video file: " + filePath);
        return false;
    }
    m_sourceType = VideoFile;
    m_totalFrames = static_cast<int>(m_capture->get(cv::CAP_PROP_FRAME_COUNT));
    m_frameIndex = 0;
    double fps = m_capture->get(cv::CAP_PROP_FPS);
    if (fps > 0) m_fps = static_cast<int>(fps);
    return true;
}

bool VideoSource::openImageSequence(const QString& directory, const QString& pattern) {
    Q_UNUSED(pattern);
    close();
    m_imageSequenceDir = directory;
    QDir dir(directory);
    QStringList filters;
    filters << "*.png" << "*.jpg" << "*.bmp" << "*.tif" << "*.tiff";
    m_imageFiles = dir.entryList(filters, QDir::Files, QDir::Name);

    if (m_imageFiles.isEmpty()) {
        emit error("No image files found in directory");
        return false;
    }

    m_sourceType = ImageSequence;
    m_totalFrames = m_imageFiles.size();
    m_frameIndex = 0;
    return true;
}

void VideoSource::close() {
    stopCapture();
    if (m_capture && m_capture->isOpened()) {
        m_capture->release();
    }
    m_capture.reset();
    m_imageFiles.clear();
    m_currentFrame.release();
}

void VideoSource::setFps(int fps) {
    m_fps = fps;
    if (m_isCapturing) {
        m_timer->start(1000 / m_fps);
    }
}

int VideoSource::fps() const { return m_fps; }

void VideoSource::startCapture() {
    if (m_isCapturing) return;
    m_isCapturing = true;
    m_timer->start(1000 / m_fps);
    emit captureStarted();
}

void VideoSource::stopCapture() {
    if (!m_isCapturing) return;
    m_isCapturing = false;
    m_timer->stop();
    emit captureStopped();
}

bool VideoSource::isOpened() const {
    if (m_sourceType == ImageSequence) {
        return !m_imageFiles.isEmpty();
    }
    return m_capture && m_capture->isOpened();
}

bool VideoSource::isCapturing() const { return m_isCapturing; }

cv::Mat VideoSource::currentFrame() const { return m_currentFrame; }
int VideoSource::currentFrameIndex() const { return m_frameIndex; }
int VideoSource::totalFrameCount() const { return m_totalFrames; }
VideoSource::SourceType VideoSource::sourceType() const { return m_sourceType; }

void VideoSource::onTimer() {
    cv::Mat frame;
    if (m_sourceType == Camera || m_sourceType == VideoFile) {
        if (!m_capture || !m_capture->isOpened()) return;
        if (!m_capture->read(frame)) {
            if (m_sourceType == VideoFile) {
                stopCapture();
            }
            return;
        }
    } else if (m_sourceType == ImageSequence) {
        if (m_frameIndex >= m_imageFiles.size()) {
            stopCapture();
            return;
        }
        QString filePath = m_imageSequenceDir + "/" + m_imageFiles[m_frameIndex];
        frame = cv::imread(filePath.toStdString());
        if (frame.empty()) return;
    }

    m_currentFrame = frame;
    emit frameReceived(m_currentFrame, m_frameIndex);
    m_frameIndex++;
}
