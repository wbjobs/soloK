#ifndef ANOMALYREGION_H
#define ANOMALYREGION_H

#include "ThreeDPosition.h"
#include <vector>
#include <QRect>
#include <QString>

enum class WaterProbability {
    None,
    Low,
    Medium,
    High
};

class AnomalyRegion {
public:
    AnomalyRegion();

    QRect boundingRect() const;
    void setBoundingRect(const QRect& rect);

    double averageTemperature() const;
    void setAverageTemperature(double temp);

    double temperatureDifference() const;
    void setTemperatureDifference(double diff);

    double maxGradient() const;
    void setMaxGradient(double gradient);

    ThreeDPosition threeDPosition() const;
    void setThreeDPosition(const ThreeDPosition& pos);

    WaterProbability waterProbability() const;
    void setWaterProbability(WaterProbability prob);

    QString probabilityString() const;

    int frameIndex() const;
    void setFrameIndex(int idx);

    void addContourPoint(const QPoint& pt);
    std::vector<QPoint> contourPoints() const;

private:
    QRect m_boundingRect;
    double m_averageTemperature;
    double m_temperatureDifference;
    double m_maxGradient;
    ThreeDPosition m_3DPosition;
    WaterProbability m_waterProbability;
    std::vector<QPoint> m_contourPoints;
    int m_frameIndex;
};

#endif
