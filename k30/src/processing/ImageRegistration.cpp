#include "ImageRegistration.h"
#include <opencv2/imgproc.hpp>
#include <opencv2/video/tracking.hpp>
#include <QDebug>

ImageRegistration::ImageRegistration()
    : m_motionThreshold(5.0)
    , m_maxPyramidLevels(3)
{
}

std::vector<TemperatureFrame> ImageRegistration::registerFrames(const std::vector<TemperatureFrame>& frames)
{
    std::vector<TemperatureFrame> registeredFrames;

    if (frames.empty()) {
        return registeredFrames;
    }

    registeredFrames.push_back(frames[0]);

    cv::Mat referenceGray;
    frames[0].thermalData().convertTo(referenceGray, CV_8U, 10, 0);

    for (size_t i = 1; i < frames.size(); ++i) {
        cv::Mat currentGray;
        frames[i].thermalData().convertTo(currentGray, CV_8U, 10, 0);

        cv::Mat transform = estimateTransform(currentGray, referenceGray);

        cv::Mat registeredThermal = applyTransform(frames[i].thermalData(), transform);

        TemperatureFrame registeredFrame = frames[i];
        registeredFrame.setThermalData(registeredThermal);

        if (!frames[i].pseudoColorMap().empty()) {
            cv::Mat registeredColor = applyTransform(frames[i].pseudoColorMap(), transform);
            registeredFrame.setPseudoColorMap(registeredColor);
        }

        registeredFrames.push_back(registeredFrame);
    }

    return registeredFrames;
}

double ImageRegistration::motionThreshold() const
{
    return m_motionThreshold;
}

void ImageRegistration::setMotionThreshold(double threshold)
{
    m_motionThreshold = threshold;
}

int ImageRegistration::maxPyramidLevels() const
{
    return m_maxPyramidLevels;
}

void ImageRegistration::setMaxPyramidLevels(int levels)
{
    m_maxPyramidLevels = levels;
}

cv::Mat ImageRegistration::estimateTransform(const cv::Mat& source, const cv::Mat& target)
{
    cv::Mat warpMatrix = cv::Mat::eye(2, 3, CV_64F);

    std::vector<cv::Point2f> prevPoints, nextPoints;

    cv::goodFeaturesToTrack(target, prevPoints, 500, 0.01, 10);

    if (prevPoints.empty()) {
        return warpMatrix;
    }

    std::vector<uchar> status;
    std::vector<float> err;
    cv::calcOpticalFlowPyrLK(target, source, prevPoints, nextPoints, status, err,
                             cv::Size(21, 21), m_maxPyramidLevels);

    std::vector<cv::Point2f> goodPrev, goodNext;
    for (size_t j = 0; j < status.size(); ++j) {
        if (status[j]) {
            double dx = nextPoints[j].x - prevPoints[j].x;
            double dy = nextPoints[j].y - prevPoints[j].y;
            double dist = sqrt(dx * dx + dy * dy);
            if (dist < m_motionThreshold * 10) {
                goodPrev.push_back(prevPoints[j]);
                goodNext.push_back(nextPoints[j]);
            }
        }
    }

    if (goodPrev.size() >= 3) {
        cv::Mat affine = cv::estimateAffinePartial2D(goodNext, goodPrev);
        if (!affine.empty()) {
            warpMatrix = affine;
        }
    }

    return warpMatrix;
}

cv::Mat ImageRegistration::applyTransform(const cv::Mat& image, const cv::Mat& transform)
{
    cv::Mat registered;
    cv::warpAffine(image, registered, transform, image.size(),
                   cv::INTER_LINEAR | cv::WARP_INVERSE_MAP, cv::BORDER_REPLICATE);
    return registered;
}
