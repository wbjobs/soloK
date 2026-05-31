#ifndef DICPROCESSOR_H
#define DICPROCESSOR_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>
#include <vector>

class DICProcessor : public QObject {
    Q_OBJECT

public:
    struct SubsetResult {
        double u;
        double v;
        double correlation;
        bool converged;
    };

    struct DICResult {
        cv::Mat displacementX;
        cv::Mat displacementY;
        cv::Mat correlationMap;
        cv::Mat convergenceMap;
        std::vector<std::vector<SubsetResult>> subsets;
        int stepX;
        int stepY;
        int subsetSize;
        bool valid;
        QString errorMessage;
    };

    enum CorrelationCriterion {
        ZeroMeanNormalizedCrossCorrelation,
        SumSquaredDifference,
        CrossCorrelation
    };

    enum SubpixelMethod {
        PolynomialFit,
        GaussianFit,
        NewtonRaphson
    };

    explicit DICProcessor(QObject* parent = nullptr);

    void setSubsetSize(int size);
    int subsetSize() const;

    void setStepSize(int stepX, int stepY);
    int stepX() const;
    int stepY() const;

    void setSearchRange(int range);
    int searchRange() const;

    void setCorrelationCriterion(CorrelationCriterion type);
    CorrelationCriterion correlationCriterion() const;

    void setSubpixelMethod(SubpixelMethod method);
    SubpixelMethod subpixelMethod() const;

    void setMaxIterations(int iter);
    int maxIterations() const;

    void setConvergenceThreshold(double threshold);
    double convergenceThreshold() const;

    DICResult compute(const cv::Mat& reference, const cv::Mat& deformed);

    SubsetResult computeSubset(const cv::Mat& refPatch, const cv::Mat& defSearch,
                               const cv::Point2i& refCenter,
                               const cv::Point2i& initialGuess = cv::Point2i(0, 0));

    static cv::Mat interpolateSubset(const cv::Mat& image, const cv::Point2d& center,
                                      int halfSize, const cv::Mat& deltaP = cv::Mat());

    static double computeZNCC(const cv::Mat& img1, const cv::Mat& img2);
    static double computeSSD(const cv::Mat& img1, const cv::Mat& img2);

signals:
    void progress(int percent);
    void finished(const DICProcessor::DICResult& result);

private:
    cv::Point2d subpixelPolynomial(const cv::Mat& correlationSurface, const cv::Point& peak);
    cv::Point2d subpixelGaussian(const cv::Mat& correlationSurface, const cv::Point& peak);

    int m_subsetSize;
    int m_stepX;
    int m_stepY;
    int m_searchRange;
    CorrelationCriterion m_correlationCriterion;
    SubpixelMethod m_subpixelMethod;
    int m_maxIterations;
    double m_convergenceThreshold;
};

#endif
