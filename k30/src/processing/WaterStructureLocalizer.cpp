#include "WaterStructureLocalizer.h"
#include <cmath>
#include <QDebug>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

WaterStructureLocalizer::WaterStructureLocalizer()
{
}

std::vector<AnomalyRegion> WaterStructureLocalizer::localizeStructures(
    const std::vector<TemperatureFrame>& frames,
    const std::vector<std::vector<AnomalyRegion>>& frameAnomalies)
{
    std::vector<AnomalyRegion> localizedAnomalies;

    if (frames.empty() || frameAnomalies.empty()) {
        return localizedAnomalies;
    }

    for (size_t frameIdx = 0; frameIdx < frameAnomalies.size(); ++frameIdx) {
        if (frameIdx >= frames.size()) break;

        const TemperatureFrame& frame = frames[frameIdx];
        const auto& anomalies = frameAnomalies[frameIdx];

        for (const auto& anomaly : anomalies) {
            AnomalyRegion localized = anomaly;
            localized.setFrameIndex(static_cast<int>(frameIdx));

            GradientInfo gradInfo = analyzeGradientDirection(frame, anomaly.boundingRect());

            double estimatedDepth = estimateWaterDepth(
                anomaly.temperatureDifference(),
                anomaly.maxGradient(),
                gradInfo);

            ThreeDPosition pos = calculate3DPosition(
                anomaly.boundingRect(),
                frame.width(),
                frame.height(),
                estimatedDepth,
                gradInfo);

            localized.setThreeDPosition(pos);
            localizedAnomalies.push_back(localized);
        }
    }

    return localizedAnomalies;
}

std::vector<DrillingSuggestion> WaterStructureLocalizer::suggestDrillingPositions(
    const std::vector<AnomalyRegion>& anomalies)
{
    std::vector<DrillingSuggestion> suggestions;

    for (const auto& anomaly : anomalies) {
        if (anomaly.waterProbability() == WaterProbability::None) {
            continue;
        }

        DrillingSuggestion suggestion;
        suggestion.position = anomaly.threeDPosition();
        suggestion.originalDepth = suggestion.position.z;
        suggestion.correctedDepth = suggestion.position.z;

        double priority = 0;
        switch (anomaly.waterProbability()) {
        case WaterProbability::High: priority = 1.0; break;
        case WaterProbability::Medium: priority = 0.6; break;
        case WaterProbability::Low: priority = 0.3; break;
        default: priority = 0;
        }

        suggestion.priority = priority;

        QString dipInfo;
        if (m_tunnelParams.aquiferDipAngle > 30.0) {
            dipInfo = QString(" (已修正倾角%1°)").arg(m_tunnelParams.aquiferDipAngle, 0, 'f', 1);
        }

        suggestion.description = QString(
            "含水性: %1, 温差: %2°C, 位置: (%3m, %4m, %5m)%6")
            .arg(anomaly.probabilityString())
            .arg(anomaly.temperatureDifference(), 0, 'f', 2)
            .arg(suggestion.position.x, 0, 'f', 2)
            .arg(suggestion.position.y, 0, 'f', 2)
            .arg(suggestion.position.z, 0, 'f', 2)
            .arg(dipInfo);

        suggestions.push_back(suggestion);
    }

    std::sort(suggestions.begin(), suggestions.end(),
              [](const DrillingSuggestion& a, const DrillingSuggestion& b) {
                  return a.priority > b.priority;
              });

    return suggestions;
}

TunnelParameters WaterStructureLocalizer::tunnelParameters() const
{
    return m_tunnelParams;
}

void WaterStructureLocalizer::setTunnelParameters(const TunnelParameters& params)
{
    m_tunnelParams = params;
}

GradientInfo WaterStructureLocalizer::analyzeGradientDirection(
    const TemperatureFrame& frame, const QRect& anomalyRect)
{
    GradientInfo info;
    info.magnitude = 0;
    info.directionX = 0;
    info.directionY = 0;
    info.estimatedDip = 0;
    info.confidence = 0;

    if (frame.gradientX().empty() || frame.gradientY().empty()) {
        return info;
    }

    cv::Mat gradX = frame.gradientX();
    cv::Mat gradY = frame.gradientY();

    double sumGx = 0, sumGy = 0, sumMag = 0;
    int count = 0;

    for (int y = anomalyRect.y(); y < anomalyRect.y() + anomalyRect.height(); ++y) {
        for (int x = anomalyRect.x(); x < anomalyRect.x() + anomalyRect.width(); ++x) {
            if (x >= 0 && x < gradX.cols && y >= 0 && y < gradX.rows) {
                double gx = gradX.at<double>(y, x);
                double gy = gradY.at<double>(y, x);
                double mag = sqrt(gx * gx + gy * gy);

                if (mag > 0.05) {
                    sumGx += gx;
                    sumGy += gy;
                    sumMag += mag;
                    count++;
                }
            }
        }
    }

    if (count > 0) {
        info.magnitude = sumMag / count;
        info.directionX = sumGx / sumMag;
        info.directionY = sumGy / sumMag;
        info.estimatedDip = estimateDipFromGradient(frame, anomalyRect);
        info.confidence = std::min(1.0, (double)count / (anomalyRect.width() * anomalyRect.height()) * 10.0);
    }

    return info;
}

ThreeDPosition WaterStructureLocalizer::calculate3DPosition(
    const QRect& boundingRect,
    int imageWidth,
    int imageHeight,
    double estimatedDepth,
    const GradientInfo& gradientInfo)
{
    double centerX = boundingRect.x() + boundingRect.width() / 2.0;
    double centerY = boundingRect.y() + boundingRect.height() / 2.0;

    double normalizedX = (centerX - imageWidth / 2.0) / imageWidth;
    double normalizedY = (centerY - imageHeight / 2.0) / imageHeight;

    double realX = normalizedX * m_tunnelParams.tunnelWidth + m_tunnelParams.cameraHorizontalOffset;
    double realY = -normalizedY * m_tunnelParams.tunnelHeight + m_tunnelParams.cameraVerticalOffset;

    double gradientDirection = atan2(gradientInfo.directionY, gradientInfo.directionX);
    double correctedDepth = correctDepthForDip(
        estimatedDepth,
        m_tunnelParams.aquiferDipAngle,
        gradientDirection,
        m_tunnelParams.aquiferStrikeAngle);

    double realZ = m_tunnelParams.distanceToFace + correctedDepth;

    if (m_tunnelParams.aquiferDipAngle > 30.0 && gradientInfo.confidence > 0.3) {
        double dipRad = m_tunnelParams.aquiferDipAngle * M_PI / 180.0;
        double strikeRad = m_tunnelParams.aquiferStrikeAngle * M_PI / 180.0;

        double offsetX = correctedDepth * sin(dipRad) * cos(strikeRad) * 0.3;
        double offsetY = correctedDepth * sin(dipRad) * sin(strikeRad) * 0.3;

        realX += offsetX;
        realY += offsetY;
    }

    return ThreeDPosition(realX, realY, realZ);
}

double WaterStructureLocalizer::estimateWaterDepth(double temperatureDifference, double maxGradient,
                                                   const GradientInfo& gradientInfo)
{
    double depthFromTemp = temperatureDifference * 0.8;
    double depthFromGrad = 0;

    if (maxGradient > 0.1) {
        depthFromGrad = 5.0 / maxGradient;
    }

    double depth = 0.6 * depthFromTemp + 0.4 * depthFromGrad;

    if (m_tunnelParams.aquiferDipAngle > 0.0) {
        double dipRad = m_tunnelParams.aquiferDipAngle * M_PI / 180.0;
        double dipCorrection = 1.0 / cos(dipRad);

        if (m_tunnelParams.aquiferDipAngle > 30.0) {
            double excessDip = m_tunnelParams.aquiferDipAngle - 30.0;
            double nonlinearFactor = 1.0 + (excessDip / 60.0) * 0.5;
            dipCorrection *= nonlinearFactor;
        }

        depth *= dipCorrection;

        if (gradientInfo.confidence > 0.3) {
            double gradDipRad = gradientInfo.estimatedDip * M_PI / 180.0;
            double gradCorrection = 1.0 / cos(gradDipRad);
            depth = 0.7 * depth + 0.3 * (depthFromTemp + depthFromGrad) / 2.0 * gradCorrection;
        }
    }

    return std::max(0.5, std::min(100.0, depth));
}

double WaterStructureLocalizer::correctDepthForDip(double rawDepth, double dipAngle,
                                                    double gradientDirection, double strikeAngle)
{
    if (dipAngle <= 0.0) return rawDepth;

    double dipRad = dipAngle * M_PI / 180.0;

    double angleDiff = fabs(gradientDirection - strikeAngle * M_PI / 180.0);
    while (angleDiff > M_PI) angleDiff -= 2 * M_PI;
    angleDiff = fabs(angleDiff);

    double directionFactor;
    if (angleDiff < M_PI / 4 || angleDiff > 3 * M_PI / 4) {
        directionFactor = 1.0 / cos(dipRad);
    } else if (angleDiff < M_PI / 2) {
        directionFactor = 1.0 + (1.0 / cos(dipRad) - 1.0) * (M_PI / 2 - angleDiff) / (M_PI / 4);
    } else {
        directionFactor = 1.0 + (1.0 / cos(dipRad) - 1.0) * (angleDiff - M_PI / 2) / (M_PI / 4);
    }

    if (dipAngle > 30.0) {
        double excessDip = dipAngle - 30.0;
        double steepCorrection = 1.0 + (excessDip / 60.0) * 0.8;
        directionFactor *= steepCorrection;
    }

    return rawDepth * directionFactor;
}

double WaterStructureLocalizer::estimateDipFromGradient(const TemperatureFrame& frame,
                                                        const QRect& anomalyRect)
{
    if (frame.gradientX().empty() || frame.gradientY().empty()) {
        return 0.0;
    }

    cv::Mat gradX = frame.gradientX();
    cv::Mat gradY = frame.gradientY();

    double sumGx = 0, sumGy = 0;
    int count = 0;

    for (int y = anomalyRect.y(); y < anomalyRect.y() + anomalyRect.height(); ++y) {
        for (int x = anomalyRect.x(); x < anomalyRect.x() + anomalyRect.width(); ++x) {
            if (x >= 0 && x < gradX.cols && y >= 0 && y < gradX.rows) {
                sumGx += gradX.at<double>(y, x);
                sumGy += gradY.at<double>(y, x);
                count++;
            }
        }
    }

    if (count == 0) return 0.0;

    double avgGx = sumGx / count;
    double avgGy = sumGy / count;

    double gradientMagnitude = sqrt(avgGx * avgGx + avgGy * avgGy);

    double estimatedDip = atan(gradientMagnitude * 100.0) * 180.0 / M_PI;
    estimatedDip = std::max(0.0, std::min(80.0, estimatedDip));

    return estimatedDip;
}
