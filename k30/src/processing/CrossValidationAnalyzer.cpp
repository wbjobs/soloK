#include "CrossValidationAnalyzer.h"
#include <opencv2/imgproc.hpp>
#include <cmath>

CrossValidationAnalyzer::CrossValidationAnalyzer()
{
}

FusionResult CrossValidationAnalyzer::analyze(const std::vector<TemperatureFrame>& irFrames,
                                               const TEMProfile& temProfile,
                                               const std::vector<AnomalyRegion>& irAnomalies)
{
    FusionResult result;
    result.overallConfidence = 0.0;

    if (irFrames.empty() || !temProfile.isValid()) {
        return result;
    }

    const TemperatureFrame& frame = irFrames[0];
    int width = frame.width();
    int height = frame.height();

    cv::Mat tempNorm = normalizeTemperature(frame);

    cv::Mat resistivityNorm = normalizeResistivity(temProfile, width, height);

    cv::Mat tempGradMag = cv::Mat::zeros(height, width, CV_64F);
    if (!frame.gradientX().empty() && !frame.gradientY().empty()) {
        cv::magnitude(frame.gradientX(), frame.gradientY(), tempGradMag);
        cv::normalize(tempGradMag, tempGradMag, 0, 1, cv::NORM_MINMAX);
    }

    cv::Mat resistivityGradX, resistivityGradY;
    cv::Sobel(resistivityNorm, resistivityGradX, CV_64F, 1, 0, 3);
    cv::Sobel(resistivityNorm, resistivityGradY, CV_64F, 0, 1, 3);
    cv::Mat resistivityGradMag;
    cv::magnitude(resistivityGradX, resistivityGradY, resistivityGradMag);
    cv::normalize(resistivityGradMag, resistivityGradMag, 0, 1, cv::NORM_MINMAX);

    result.confidenceMap = computeConfidenceMap(tempNorm, resistivityNorm,
                                                 tempGradMag, resistivityGradMag);

    result.colorConfidenceMap = generateColorConfidenceMap(result.confidenceMap);

    result.fusedAnomalies = detectFusedAnomalies(result.confidenceMap,
                                                  m_params.confidenceThreshold);

    cv::Scalar meanConf = cv::mean(result.confidenceMap);
    result.overallConfidence = meanConf[0];

    return result;
}

void CrossValidationAnalyzer::setParameters(const ValidationParams& params)
{
    m_params = params;
}

ValidationParams CrossValidationAnalyzer::parameters() const
{
    return m_params;
}

cv::Mat CrossValidationAnalyzer::normalizeTemperature(const TemperatureFrame& frame)
{
    cv::Mat thermal = frame.thermalData();
    double minTemp = frame.minTemperature();
    double maxTemp = frame.maxTemperature();

    cv::Mat normalized;
    if (maxTemp > minTemp) {
        thermal.convertTo(normalized, CV_64F, -1.0 / (maxTemp - minTemp),
                          maxTemp / (maxTemp - minTemp));
    } else {
        normalized = cv::Mat::ones(thermal.size(), CV_64F) * 0.5;
    }

    return normalized;
}

cv::Mat CrossValidationAnalyzer::normalizeResistivity(const TEMProfile& profile,
                                                       int targetWidth, int targetHeight)
{
    cv::Mat resistivity = profile.resistivityMatrix();

    cv::Mat logResistivity;
    cv::log(resistivity + 1.0, logResistivity);

    double minLog, maxLog;
    cv::minMaxLoc(logResistivity, &minLog, &maxLog);

    cv::Mat normalized;
    if (maxLog > minLog) {
        logResistivity.convertTo(normalized, CV_64F, -1.0 / (maxLog - minLog),
                                  maxLog / (maxLog - minLog));
    } else {
        normalized = cv::Mat::ones(logResistivity.size(), CV_64F) * 0.5;
    }

    cv::Mat resized;
    cv::resize(normalized, resized, cv::Size(targetWidth, targetHeight),
               0, 0, cv::INTER_LINEAR);

    return resized;
}

cv::Mat CrossValidationAnalyzer::computeConfidenceMap(const cv::Mat& tempNorm,
                                                      const cv::Mat& resistivityNorm,
                                                      const cv::Mat& tempGrad,
                                                      const cv::Mat& resistivityGrad)
{
    cv::Mat confidence = cv::Mat::zeros(tempNorm.size(), CV_64F);

    for (int y = 0; y < tempNorm.rows; ++y) {
        for (int x = 0; x < tempNorm.cols; ++x) {
            double t = tempNorm.at<double>(y, x);
            double r = resistivityNorm.at<double>(y, x);
            double tg = tempGrad.at<double>(y, x);
            double rg = resistivityGrad.at<double>(y, x);

            double tempScore = std::max(0.0, t) * m_params.lowTempWeight;
            double resScore = std::max(0.0, r) * m_params.lowResistivityWeight;
            double tgScore = tg * m_params.tempGradientWeight;
            double rgScore = rg * m_params.resistivityGradientWeight;

            double combined = tempScore + resScore + tgScore + rgScore;
            double confidenceVal = std::min(1.0, std::max(0.0, combined));

            if (t > 0.3 && r > 0.3) {
                confidenceVal *= 1.3;
                confidenceVal = std::min(1.0, confidenceVal);
            }

            confidence.at<double>(y, x) = confidenceVal;
        }
    }

    cv::GaussianBlur(confidence, confidence, cv::Size(5, 5), 0);

    return confidence;
}

cv::Mat CrossValidationAnalyzer::generateColorConfidenceMap(const cv::Mat& confidenceMap)
{
    cv::Mat normalized;
    confidenceMap.convertTo(normalized, CV_8U, 255.0);

    cv::Mat colorMap;
    cv::applyColorMap(normalized, colorMap, cv::COLORMAP_JET);

    return colorMap;
}

std::vector<AnomalyRegion> CrossValidationAnalyzer::detectFusedAnomalies(
    const cv::Mat& confidenceMap, double threshold)
{
    std::vector<AnomalyRegion> anomalies;

    cv::Mat binaryMask;
    confidenceMap.convertTo(binaryMask, CV_8U, 255.0);
    cv::threshold(binaryMask, binaryMask, threshold * 255, 255, cv::THRESH_BINARY);

    cv::Mat kernel = cv::getStructuringElement(cv::MORPH_ELLIPSE, cv::Size(7, 7));
    cv::morphologyEx(binaryMask, binaryMask, cv::MORPH_OPEN, kernel);
    cv::morphologyEx(binaryMask, binaryMask, cv::MORPH_CLOSE, kernel);

    std::vector<std::vector<cv::Point>> contours;
    std::vector<cv::Vec4i> hierarchy;
    cv::findContours(binaryMask, contours, hierarchy, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    for (size_t i = 0; i < contours.size(); ++i) {
        double area = cv::contourArea(contours[i]);
        if (area < 100) continue;

        cv::Rect boundingRect = cv::boundingRect(contours[i]);

        cv::Mat regionMask = cv::Mat::zeros(confidenceMap.size(), CV_8U);
        cv::drawContours(regionMask, contours, static_cast<int>(i), cv::Scalar(255), -1);

        cv::Scalar meanConf = cv::mean(confidenceMap, regionMask);

        AnomalyRegion anomaly;
        anomaly.setBoundingRect(QRect(boundingRect.x, boundingRect.y,
                                       boundingRect.width, boundingRect.height));
        anomaly.setAverageTemperature(meanConf[0] * 100);
        anomaly.setTemperatureDifference(meanConf[0] * 100);

        WaterProbability prob = WaterProbability::None;
        if (meanConf[0] > 0.8) prob = WaterProbability::High;
        else if (meanConf[0] > 0.6) prob = WaterProbability::Medium;
        else if (meanConf[0] > threshold) prob = WaterProbability::Low;
        anomaly.setWaterProbability(prob);

        for (const auto& pt : contours[i]) {
            anomaly.addContourPoint(QPoint(pt.x, pt.y));
        }

        anomalies.push_back(anomaly);
    }

    std::sort(anomalies.begin(), anomalies.end(),
              [](const AnomalyRegion& a, const AnomalyRegion& b) {
                  return a.temperatureDifference() > b.temperatureDifference();
              });

    return anomalies;
}
