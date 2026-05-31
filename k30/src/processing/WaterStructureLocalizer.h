#ifndef WATERSTRUCTURELOCALIZER_H
#define WATERSTRUCTURELOCALIZER_H

#include "../data/TemperatureFrame.h"
#include "../data/AnomalyRegion.h"
#include "../data/ThreeDPosition.h"
#include <vector>

struct TunnelParameters {
    double tunnelWidth;
    double tunnelHeight;
    double cameraFocalLength;
    double sensorPixelSize;
    double distanceToFace;
    double cameraHorizontalOffset;
    double cameraVerticalOffset;
    double aquiferDipAngle;
    double aquiferStrikeAngle;

    TunnelParameters()
        : tunnelWidth(10.0)
        , tunnelHeight(8.0)
        , cameraFocalLength(0.025)
        , sensorPixelSize(17e-6)
        , distanceToFace(5.0)
        , cameraHorizontalOffset(0)
        , cameraVerticalOffset(0)
        , aquiferDipAngle(0.0)
        , aquiferStrikeAngle(0.0)
    {}
};

struct DrillingSuggestion {
    ThreeDPosition position;
    double priority;
    QString description;
    double correctedDepth;
    double originalDepth;
};

struct GradientInfo {
    double magnitude;
    double directionX;
    double directionY;
    double estimatedDip;
    double confidence;
};

class WaterStructureLocalizer {
public:
    WaterStructureLocalizer();

    std::vector<AnomalyRegion> localizeStructures(
        const std::vector<TemperatureFrame>& frames,
        const std::vector<std::vector<AnomalyRegion>>& frameAnomalies);

    std::vector<DrillingSuggestion> suggestDrillingPositions(
        const std::vector<AnomalyRegion>& anomalies);

    TunnelParameters tunnelParameters() const;
    void setTunnelParameters(const TunnelParameters& params);

    GradientInfo analyzeGradientDirection(const TemperatureFrame& frame,
                                          const QRect& anomalyRect);

private:
    ThreeDPosition calculate3DPosition(
        const QRect& boundingRect,
        int imageWidth,
        int imageHeight,
        double estimatedDepth,
        const GradientInfo& gradientInfo);

    double estimateWaterDepth(double temperatureDifference, double maxGradient,
                              const GradientInfo& gradientInfo);

    double correctDepthForDip(double rawDepth, double dipAngle,
                              double gradientDirection, double strikeAngle);

    double estimateDipFromGradient(const TemperatureFrame& frame,
                                   const QRect& anomalyRect);

    TunnelParameters m_tunnelParams;
};

#endif
