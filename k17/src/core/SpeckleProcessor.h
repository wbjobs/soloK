#ifndef SPECKLEPROCESSOR_H
#define SPECKLEPROCESSOR_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>
#include <complex>

class SpeckleProcessor : public QObject {
    Q_OBJECT

public:
    enum Method {
        FFT_Phase,
        Correlation
    };

    struct Result {
        cv::Mat phaseMap;
        cv::Mat unwrappedPhase;
        cv::Mat displacementX;
        cv::Mat displacementY;
        cv::Mat magnitude;
        bool valid;
        QString errorMessage;
    };

    explicit SpeckleProcessor(QObject* parent = nullptr);
    ~SpeckleProcessor();

    void setMethod(Method method);
    Method method() const;

    void setWindowSize(int size);
    int windowSize() const;

    void setSearchRange(int range);
    int searchRange() const;

    void setSubpixelEnabled(bool enabled);
    bool isSubpixelEnabled() const;

    void setFFTHighPass(bool enabled);
    bool isFFTHighPass() const;

    void setFFTLowPass(bool enabled);
    bool isFFTLowPass() const;

    Result process(const cv::Mat& reference, const cv::Mat& deformed);

    cv::Mat computePhaseMapFFT(const cv::Mat& reference, const cv::Mat& deformed);
    cv::Mat computeDisplacementCorrelation(const cv::Mat& reference, const cv::Mat& deformed);

    static cv::Mat preprocessImage(const cv::Mat& image);

signals:
    void progress(int percent);
    void finished(const SpeckleProcessor::Result& result);

private:
    Method m_method;
    int m_windowSize;
    int m_searchRange;
    bool m_subpixelEnabled;
    bool m_fftHighPass;
    bool m_fftLowPass;
};

#endif
