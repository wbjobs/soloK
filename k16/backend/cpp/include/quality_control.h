#pragma once

#include "common.h"
#include <vector>
#include <deque>
#include <array>
#include <cmath>

class QualityControl {
public:
    QualityControl(size_t window_size = 100, float sigma_threshold = 3.0f);

    QualityMetrics processPressureData(const PressureData& data);
    QualityMetrics processBalanceData(const BalanceData& data);

    void setSigmaThreshold(float threshold);
    void setWindowSize(size_t size);

    float getMean(size_t channel) const;
    float getStdDev(size_t channel) const;

private:
    bool detectOutlier(float value, float mean, float stddev, float threshold) const;
    void updateStatistics(size_t channel, float value);

    size_t window_size_;
    float sigma_threshold_;
    std::vector<std::deque<float>> history_;
    std::vector<float> means_;
    std::vector<float> variances_;
    std::vector<size_t> counts_;
};
