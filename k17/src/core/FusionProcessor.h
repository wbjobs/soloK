#ifndef FUSIONPROCESSOR_H
#define FUSIONPROCESSOR_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>
#include "core/DICProcessor.h"
#include "core/SpeckleProcessor.h"

class FusionProcessor : public QObject {
    Q_OBJECT

public:
    enum FusionStrategy {
        WeightedAverage,
        FrequencyDomain,
        MultiScalePyramid,
        VarianceWeighted,
        ConfidenceWeighted
    };

    struct FusionResult {
        cv::Mat fusedDisplacementX;
        cv::Mat fusedDisplacementY;
        cv::Mat fusedMagnitude;
        cv::Mat interferometryWeight;
        cv::Mat DICWeight;
        double fusionQuality;
        bool valid;
        QString errorMessage;
    };

    explicit FusionProcessor(QObject* parent = nullptr);

    void setFusionStrategy(FusionStrategy strategy);
    FusionStrategy fusionStrategy() const;

    void setInterferometrySensitivity(double sensitivity);
    double interferometrySensitivity() const;

    void setDICRange(double range);
    double dicRange() const;

    void setCrossoverFrequency(double freq);
    double crossoverFrequency() const;

    void setAlpha(double alpha);
    double alpha() const;

    FusionResult fuse(const SpeckleProcessor::Result& interferometryResult,
                      const DICProcessor::DICResult& dicResult,
                      const cv::Mat& reference = cv::Mat());

    cv::Mat confidenceMapFromInterferometry(const cv::Mat& magnitude,
                                            const cv::Mat& correlation = cv::Mat());
    cv::Mat confidenceMapFromDIC(const cv::Mat& correlation);

    static cv::Mat fuseWeighted(const cv::Mat& field1, const cv::Mat& field2,
                                const cv::Mat& weight1, const cv::Mat& weight2);

signals:
    void progress(int percent);
    void finished(const FusionProcessor::FusionResult& result);

private:
    FusionResult fuseFrequencyDomain(const cv::Mat& dispXInt, const cv::Mat& dispYInt,
                                     const cv::Mat& dispXDIC, const cv::Mat& dispYDIC,
                                     const cv::Mat& weightInt, const cv::Mat& weightDIC);

    FusionResult fuseMultiScale(const cv::Mat& dispXInt, const cv::Mat& dispYInt,
                                const cv::Mat& dispXDIC, const cv::Mat& dispYDIC,
                                const cv::Mat& weightInt, const cv::Mat& weightDIC);

    FusionResult fuseVarianceWeighted(const cv::Mat& dispXInt, const cv::Mat& dispYInt,
                                      const cv::Mat& dispXDIC, const cv::Mat& dispYDIC);

    FusionResult fuseConfidenceWeighted(const cv::Mat& dispXInt, const cv::Mat& dispYInt,
                                        const cv::Mat& dispXDIC, const cv::Mat& dispYDIC,
                                        const cv::Mat& confInt, const cv::Mat& confDIC);

    cv::Mat gaussianDecompose(const cv::Mat& src, int levels, std::vector<cv::Mat>& gaussian,
                              std::vector<cv::Mat>& laplacian);
    cv::Mat gaussianReconstruct(const std::vector<cv::Mat>& laplacian);

    FusionStrategy m_strategy;
    double m_interferometrySensitivity;
    double m_dicRange;
    double m_crossoverFrequency;
    double m_alpha;
};

#endif
