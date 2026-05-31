#ifndef CROSSVALIDATIONANALYZER_H
#define CROSSVALIDATIONANALYZER_H

#include "../data/TemperatureFrame.h"
#include "../data/TEMData.h"
#include "../data/AnomalyRegion.h"
#include <opencv2/core.hpp>
#include <vector>

struct FusionResult {
    cv::Mat confidenceMap;
    cv::Mat colorConfidenceMap;
    std::vector<AnomalyRegion> fusedAnomalies;
    double overallConfidence;
};

struct ValidationParams {
    double lowTempWeight;
    double lowResistivityWeight;
    double tempGradientWeight;
    double resistivityGradientWeight;
    double confidenceThreshold;

    ValidationParams()
        : lowTempWeight(0.4)
        , lowResistivityWeight(0.4)
        , tempGradientWeight(0.1)
        , resistivityGradientWeight(0.1)
        , confidenceThreshold(0.5)
    {}
};

class CrossValidationAnalyzer {
public:
    CrossValidationAnalyzer();

    FusionResult analyze(const std::vector<TemperatureFrame>& irFrames,
                         const TEMProfile& temProfile,
                         const std::vector<AnomalyRegion>& irAnomalies);

    void setParameters(const ValidationParams& params);
    ValidationParams parameters() const;

private:
    cv::Mat normalizeTemperature(const TemperatureFrame& frame);
    cv::Mat normalizeResistivity(const TEMProfile& profile, int targetWidth, int targetHeight);
    cv::Mat computeConfidenceMap(const cv::Mat& tempNorm,
                                  const cv::Mat& resistivityNorm,
                                  const cv::Mat& tempGrad,
                                  const cv::Mat& resistivityGrad);
    cv::Mat generateColorConfidenceMap(const cv::Mat& confidenceMap);
    std::vector<AnomalyRegion> detectFusedAnomalies(const cv::Mat& confidenceMap,
                                                      double threshold);

    ValidationParams m_params;
};

#endif
