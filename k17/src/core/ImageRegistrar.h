#ifndef IMAGEREGISTRAR_H
#define IMAGEREGISTRAR_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>

class ImageRegistrar : public QObject {
    Q_OBJECT

public:
    enum Method {
        PhaseCorrelation,
        FeatureBased,
        ECC,
        OpticalFlow
    };

    struct RegistrationResult {
        cv::Mat warped;
        cv::Mat transformMatrix;
        double dx;
        double dy;
        double rotationAngle;
        double scaleX;
        double scaleY;
        bool success;
        QString errorMessage;
    };

    explicit ImageRegistrar(QObject* parent = nullptr);

    void setMethod(Method method);
    Method method() const;

    void setMaxIterations(int iterations);
    int maxIterations() const;

    RegistrationResult registerImages(const cv::Mat& reference, const cv::Mat& moving);

    cv::Mat removeRigidMotion(const cv::Mat& displacementX, const cv::Mat& displacementY,
                               const cv::Mat& transform);

    static cv::Mat applyTransform(const cv::Mat& image, const cv::Mat& transform);

signals:
    void progress(int percent);
    void finished(const ImageRegistrar::RegistrationResult& result);

private:
    Method m_method;
    int m_maxIterations;

    RegistrationResult registerPhaseCorrelation(const cv::Mat& reference, const cv::Mat& moving);
    RegistrationResult registerECC(const cv::Mat& reference, const cv::Mat& moving);
    RegistrationResult registerFeature(const cv::Mat& reference, const cv::Mat& moving);
    RegistrationResult registerOpticalFlow(const cv::Mat& reference, const cv::Mat& moving);
};

#endif
