#include "TemperatureFieldAnalyzer.h"
#include <opencv2/imgproc.hpp>
#include <QDebug>

TemperatureFieldAnalyzer::TemperatureFieldAnalyzer()
    : m_temperatureDifferenceThreshold(2.0)
    , m_minAnomalySize(50)
{
}

TemperatureFrame TemperatureFieldAnalyzer::analyzeFrame(const TemperatureFrame& frame)
{
    if (frame.thermalData().empty()) {
        return frame;
    }

    TemperatureFrame analyzedFrame = frame;

    cv::Mat pseudoColor = generatePseudoColorMap(frame.thermalData());
    analyzedFrame.setPseudoColorMap(pseudoColor);

    computeGradients(analyzedFrame);

    return analyzedFrame;
}

std::vector<AnomalyRegion> TemperatureFieldAnalyzer::detectAnomalies(const TemperatureFrame& frame)
{
    std::vector<AnomalyRegion> anomalies;

    if (frame.thermalData().empty()) {
        return anomalies;
    }

    cv::Mat thermalData = frame.thermalData();
    double meanTemp = frame.meanTemperature();

    cv::Mat anomalyMask = cv::Mat::zeros(thermalData.size(), CV_8U);

    for (int y = 0; y < thermalData.rows; ++y) {
        for (int x = 0; x < thermalData.cols; ++x) {
            double temp = thermalData.at<double>(y, x);
            if (meanTemp - temp >= m_temperatureDifferenceThreshold) {
                anomalyMask.at<uchar>(y, x) = 255;
            }
        }
    }

    cv::Mat kernel = cv::getStructuringElement(cv::MORPH_ELLIPSE, cv::Size(5, 5));
    cv::morphologyEx(anomalyMask, anomalyMask, cv::MORPH_OPEN, kernel);
    cv::morphologyEx(anomalyMask, anomalyMask, cv::MORPH_CLOSE, kernel);

    std::vector<std::vector<cv::Point>> contours;
    std::vector<cv::Vec4i> hierarchy;
    cv::findContours(anomalyMask, contours, hierarchy, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    for (size_t i = 0; i < contours.size(); ++i) {
        double area = cv::contourArea(contours[i]);
        if (area < m_minAnomalySize) {
            continue;
        }

        cv::Rect boundingRect = cv::boundingRect(contours[i]);

        cv::Mat regionMask = cv::Mat::zeros(thermalData.size(), CV_8U);
        cv::drawContours(regionMask, contours, static_cast<int>(i), cv::Scalar(255), -1);

        cv::Scalar meanRegion = cv::mean(thermalData, regionMask);
        double avgTemp = meanRegion[0];

        double maxGrad = 0;
        if (!frame.gradientX().empty() && !frame.gradientY().empty()) {
            for (int y = boundingRect.y; y < boundingRect.y + boundingRect.height; ++y) {
                for (int x = boundingRect.x; x < boundingRect.x + boundingRect.width; ++x) {
                    if (regionMask.at<uchar>(y, x)) {
                        double gx = frame.gradientX().at<double>(y, x);
                        double gy = frame.gradientY().at<double>(y, x);
                        double gradMag = sqrt(gx * gx + gy * gy);
                        maxGrad = std::max(maxGrad, gradMag);
                    }
                }
            }
        }

        AnomalyRegion anomaly;
        anomaly.setBoundingRect(QRect(boundingRect.x, boundingRect.y,
                                       boundingRect.width, boundingRect.height));
        anomaly.setAverageTemperature(avgTemp);
        anomaly.setTemperatureDifference(meanTemp - avgTemp);
        anomaly.setMaxGradient(maxGrad);

        WaterProbability prob = WaterProbability::Low;
        if (meanTemp - avgTemp > 5.0 && maxGrad > 0.5) {
            prob = WaterProbability::High;
        } else if (meanTemp - avgTemp > 3.0 && maxGrad > 0.3) {
            prob = WaterProbability::Medium;
        } else if (meanTemp - avgTemp > m_temperatureDifferenceThreshold) {
            prob = WaterProbability::Low;
        } else {
            prob = WaterProbability::None;
        }
        anomaly.setWaterProbability(prob);

        for (const auto& pt : contours[i]) {
            anomaly.addContourPoint(QPoint(pt.x, pt.y));
        }

        anomalies.push_back(anomaly);
    }

    return anomalies;
}

double TemperatureFieldAnalyzer::temperatureDifferenceThreshold() const
{
    return m_temperatureDifferenceThreshold;
}

void TemperatureFieldAnalyzer::setTemperatureDifferenceThreshold(double threshold)
{
    m_temperatureDifferenceThreshold = threshold;
}

int TemperatureFieldAnalyzer::minAnomalySize() const
{
    return m_minAnomalySize;
}

void TemperatureFieldAnalyzer::setMinAnomalySize(int size)
{
    m_minAnomalySize = size;
}

cv::Mat TemperatureFieldAnalyzer::generatePseudoColorMap(const cv::Mat& thermalData)
{
    if (thermalData.empty()) {
        return cv::Mat();
    }

    double minVal, maxVal;
    cv::minMaxLoc(thermalData, &minVal, &maxVal);

    cv::Mat normalized;
    if (maxVal > minVal) {
        thermalData.convertTo(normalized, CV_8U, 255.0 / (maxVal - minVal),
                              -255.0 * minVal / (maxVal - minVal));
    } else {
        normalized = cv::Mat::zeros(thermalData.size(), CV_8U);
    }

    return applyColorMap(normalized);
}

void TemperatureFieldAnalyzer::computeGradients(TemperatureFrame& frame)
{
    if (frame.thermalData().empty()) {
        return;
    }

    cv::Mat thermalData = frame.thermalData();
    cv::Mat gradX, gradY;

    cv::Sobel(thermalData, gradX, CV_64F, 1, 0, 3);
    cv::Sobel(thermalData, gradY, CV_64F, 0, 1, 3);

    frame.setGradients(gradX, gradY);
}

cv::Mat TemperatureFieldAnalyzer::applyColorMap(const cv::Mat& normalized)
{
    cv::Mat colorMap;
    cv::applyColorMap(normalized, colorMap, cv::COLORMAP_JET);
    return colorMap;
}
