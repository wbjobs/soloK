#ifndef IMAGEREGISTRATION_H
#define IMAGEREGISTRATION_H

#include "../data/TemperatureFrame.h"
#include <vector>
#include <opencv2/core.hpp>

class ImageRegistration {
public:
    ImageRegistration();

    std::vector<TemperatureFrame> registerFrames(const std::vector<TemperatureFrame>& frames);

    double motionThreshold() const;
    void setMotionThreshold(double threshold);

    int maxPyramidLevels() const;
    void setMaxPyramidLevels(int levels);

private:
    cv::Mat estimateTransform(const cv::Mat& source, const cv::Mat& target);
    cv::Mat applyTransform(const cv::Mat& image, const cv::Mat& transform);

    double m_motionThreshold;
    int m_maxPyramidLevels;
};

#endif
