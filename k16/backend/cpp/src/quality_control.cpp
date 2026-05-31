#include "quality_control.h"

QualityControl::QualityControl(size_t window_size, float sigma_threshold)
    : window_size_(window_size)
    , sigma_threshold_(sigma_threshold)
    , history_(PRESSURE_CHANNELS)
    , means_(PRESSURE_CHANNELS, 0.0f)
    , variances_(PRESSURE_CHANNELS, 0.0f)
    , counts_(PRESSURE_CHANNELS, 0) {}

QualityMetrics QualityControl::processPressureData(const PressureData& data) {
    QualityMetrics metrics;
    metrics.channel_valid.resize(PRESSURE_CHANNELS, true);
    metrics.outliers.resize(PRESSURE_CHANNELS, 0.0f);

    for (size_t i = 0; i < PRESSURE_CHANNELS; ++i) {
        updateStatistics(i, data.values[i]);
        if (counts_[i] >= 10) {
            float stddev = std::sqrt(variances_[i]);
            bool is_outlier = detectOutlier(data.values[i], means_[i], stddev, sigma_threshold_);
            if (is_outlier) {
                metrics.channel_valid[i] = false;
                metrics.outliers[i] = data.values[i];
            }
        }
    }

    return metrics;
}

QualityMetrics QualityControl::processBalanceData(const BalanceData& data) {
    QualityMetrics metrics;
    metrics.channel_valid.resize(BALANCE_CHANNELS, true);
    metrics.outliers.resize(BALANCE_CHANNELS, 0.0f);
    return metrics;
}

void QualityControl::setSigmaThreshold(float threshold) {
    sigma_threshold_ = threshold;
}

void QualityControl::setWindowSize(size_t size) {
    window_size_ = size;
}

float QualityControl::getMean(size_t channel) const {
    return (channel < means_.size()) ? means_[channel] : 0.0f;
}

float QualityControl::getStdDev(size_t channel) const {
    return (channel < variances_.size()) ? std::sqrt(variances_[channel]) : 0.0f;
}

bool QualityControl::detectOutlier(float value, float mean, float stddev, float threshold) const {
    if (stddev < 1e-6f) return false;
    return std::abs(value - mean) > threshold * stddev;
}

void QualityControl::updateStatistics(size_t channel, float value) {
    if (channel >= history_.size()) return;

    auto& history = history_[channel];
    history.push_back(value);

    if (history.size() > window_size_) {
        float old = history.front();
        history.pop_front();

        size_t n = counts_[channel];
        float delta = old - means_[channel];
        means_[channel] -= delta / n;
        float delta2 = old - means_[channel];
        variances_[channel] = (variances_[channel] * (n - 1) - delta * delta2) / (n - 1);
        counts_[channel]--;
    }

    size_t n = counts_[channel] + 1;
    float delta = value - means_[channel];
    means_[channel] += delta / n;
    float delta2 = value - means_[channel];
    variances_[channel] = counts_[channel] > 0 
        ? (variances_[channel] * (counts_[channel]) + delta * delta2) / n
        : 0.0f;
    counts_[channel]++;
}
