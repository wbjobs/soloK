#ifndef VIDEOSOURCE_H
#define VIDEOSOURCE_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>
#include <QStringList>
#include <QTimer>
#include <memory>

class VideoSource : public QObject {
    Q_OBJECT

public:
    enum SourceType {
        Camera,
        VideoFile,
        ImageSequence
    };

    explicit VideoSource(QObject* parent = nullptr);
    ~VideoSource();

    bool openCamera(int cameraIndex = 0);
    bool openVideo(const QString& filePath);
    bool openImageSequence(const QString& directory, const QString& pattern = "*.png");

    void close();

    void setFps(int fps);
    int fps() const;

    void startCapture();
    void stopCapture();

    bool isOpened() const;
    bool isCapturing() const;

    cv::Mat currentFrame() const;
    int currentFrameIndex() const;
    int totalFrameCount() const;

    SourceType sourceType() const;

signals:
    void frameReceived(const cv::Mat& frame, int frameIndex);
    void captureStarted();
    void captureStopped();
    void error(const QString& message);

private slots:
    void onTimer();

private:
    std::unique_ptr<cv::VideoCapture> m_capture;
    QTimer* m_timer;
    cv::Mat m_currentFrame;
    int m_frameIndex;
    int m_totalFrames;
    int m_fps;
    SourceType m_sourceType;
    bool m_isCapturing;
    QStringList m_imageFiles;
    QString m_imageSequenceDir;
};

#endif
