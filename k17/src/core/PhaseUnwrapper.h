#ifndef PHASEUNWRAPPER_H
#define PHASEUNWRAPPER_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>

class PhaseUnwrapper : public QObject {
    Q_OBJECT

public:
    enum Method {
        SimpleRowColumn,
        LeastSquares,
        BranchCut,
        QualityGuided
    };

    struct Result {
        cv::Mat unwrapped;
        bool valid;
        QString errorMessage;
    };

    explicit PhaseUnwrapper(QObject* parent = nullptr);

    void setMethod(Method method);
    Method method() const;

    void setMaxIterations(int iterations);
    int maxIterations() const;

    Result unwrap(const cv::Mat& wrapped);

    cv::Mat unwrapSimple(const cv::Mat& wrapped);
    cv::Mat unwrapLeastSquares(const cv::Mat& wrapped);
    cv::Mat unwrapBranchCut(const cv::Mat& wrapped);
    cv::Mat unwrapQualityGuided(const cv::Mat& wrapped);

    static cv::Mat computeQualityMap(const cv::Mat& wrapped);

signals:
    void progress(int percent);
    void finished(const PhaseUnwrapper::Result& result);

private:
    Method m_method;
    int m_maxIterations;

    static double wrapToPi(double value);
};

#endif
