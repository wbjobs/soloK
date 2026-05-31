#include "AnomalyRegion.h"

AnomalyRegion::AnomalyRegion()
    : m_averageTemperature(0)
    , m_temperatureDifference(0)
    , m_maxGradient(0)
    , m_waterProbability(WaterProbability::None)
    , m_frameIndex(-1)
{
}

QRect AnomalyRegion::boundingRect() const
{
    return m_boundingRect;
}

void AnomalyRegion::setBoundingRect(const QRect& rect)
{
    m_boundingRect = rect;
}

double AnomalyRegion::averageTemperature() const
{
    return m_averageTemperature;
}

void AnomalyRegion::setAverageTemperature(double temp)
{
    m_averageTemperature = temp;
}

double AnomalyRegion::temperatureDifference() const
{
    return m_temperatureDifference;
}

void AnomalyRegion::setTemperatureDifference(double diff)
{
    m_temperatureDifference = diff;
}

double AnomalyRegion::maxGradient() const
{
    return m_maxGradient;
}

void AnomalyRegion::setMaxGradient(double gradient)
{
    m_maxGradient = gradient;
}

ThreeDPosition AnomalyRegion::threeDPosition() const
{
    return m_3DPosition;
}

void AnomalyRegion::setThreeDPosition(const ThreeDPosition& pos)
{
    m_3DPosition = pos;
}

WaterProbability AnomalyRegion::waterProbability() const
{
    return m_waterProbability;
}

void AnomalyRegion::setWaterProbability(WaterProbability prob)
{
    m_waterProbability = prob;
}

QString AnomalyRegion::probabilityString() const
{
    switch (m_waterProbability) {
    case WaterProbability::High: return "高";
    case WaterProbability::Medium: return "中";
    case WaterProbability::Low: return "低";
    case WaterProbability::None:
    default: return "无";
    }
}

int AnomalyRegion::frameIndex() const
{
    return m_frameIndex;
}

void AnomalyRegion::setFrameIndex(int idx)
{
    m_frameIndex = idx;
}

void AnomalyRegion::addContourPoint(const QPoint& pt)
{
    m_contourPoints.push_back(pt);
}

std::vector<QPoint> AnomalyRegion::contourPoints() const
{
    return m_contourPoints;
}
