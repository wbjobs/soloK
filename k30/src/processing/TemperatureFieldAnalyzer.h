#ifndef TEMPERATUREFIELDANALYZER_H
#define TEMPERATUREFIELDANALYZER_H

#include "../data/TemperatureFrame.h"
#include "../data/AnomalyRegion.h"
#include <vector>
#include <opencv2/core.hpp>

class TemperatureFieldAnalyzer {
public:
    TemperatureFieldAnalyzer();

    TemperatureFrame analyzeFrame(const TemperatureFrame& frame);
    std::vector<AnomalyRegion> detectAnomalies(const TemperatureFrame& frame);

    double temperatureDifferenceThreshold() const;
    void setTemperatureDifferenceThreshold(double threshold);

    int minAnomalySize() const;
    void setMinAnomalySize(int size);

    cv::Mat generatePseudoColorMap(const cv::Mat& thermalData);
    void computeGradients(TemperatureFrame& frame);

private:
    cv::Mat applyColorMap(const cv::Mat& normalized);

    double m_temperatureDifferenceThreshold;
    int m_minAnomalySize;
};

#endif
