#include "TemperatureCalibration.h"
#include <cmath>

TemperatureCalibration::TemperatureCalibration()
    : m_emissivity(0.95)
    , m_reflectedTemperature(25.0)
    , m_atmosphericTemperature(25.0)
    , m_objectDistance(1.0)
    , m_relativeHumidity(0.5)
{
}

TemperatureFrame TemperatureCalibration::calibrateFrame(const TemperatureFrame& frame)
{
    if (frame.thermalData().empty()) {
        return frame;
    }

    cv::Mat calibratedData = frame.thermalData().clone();

    for (int y = 0; y < calibratedData.rows; ++y) {
        for (int x = 0; x < calibratedData.cols; ++x) {
            double rawTemp = calibratedData.at<double>(y, x);
            calibratedData.at<double>(y, x) = correctTemperature(rawTemp);
        }
    }

    TemperatureFrame calibratedFrame = frame;
    calibratedFrame.setThermalData(calibratedData);

    return calibratedFrame;
}

std::vector<TemperatureFrame> TemperatureCalibration::calibrateFrames(const std::vector<TemperatureFrame>& frames)
{
    std::vector<TemperatureFrame> calibratedFrames;
    for (const auto& frame : frames) {
        calibratedFrames.push_back(calibrateFrame(frame));
    }
    return calibratedFrames;
}

double TemperatureCalibration::emissivity() const
{
    return m_emissivity;
}

void TemperatureCalibration::setEmissivity(double e)
{
    m_emissivity = std::max(0.01, std::min(1.0, e));
}

double TemperatureCalibration::reflectedTemperature() const
{
    return m_reflectedTemperature;
}

void TemperatureCalibration::setReflectedTemperature(double t)
{
    m_reflectedTemperature = t;
}

double TemperatureCalibration::atmosphericTemperature() const
{
    return m_atmosphericTemperature;
}

void TemperatureCalibration::setAtmosphericTemperature(double t)
{
    m_atmosphericTemperature = t;
}

double TemperatureCalibration::objectDistance() const
{
    return m_objectDistance;
}

void TemperatureCalibration::setObjectDistance(double d)
{
    m_objectDistance = std::max(0.1, d);
}

double TemperatureCalibration::relativeHumidity() const
{
    return m_relativeHumidity;
}

void TemperatureCalibration::setRelativeHumidity(double h)
{
    m_relativeHumidity = std::max(0.0, std::min(1.0, h));
}

double TemperatureCalibration::correctTemperature(double rawTemp) const
{
    double tau = calculateAtmosphericTransmittance();

    double reflectedRadiance = (1.0 - m_emissivity) / m_emissivity *
                               pow(m_reflectedTemperature + 273.15, 4);
    double atmosphericRadiance = (1.0 - tau) / (m_emissivity * tau) *
                                 pow(m_atmosphericTemperature + 273.15, 4);

    double totalRadiance = pow(rawTemp + 273.15, 4) + reflectedRadiance + atmosphericRadiance;
    double correctedTemp = pow(totalRadiance, 0.25) - 273.15;

    return correctedTemp;
}

double TemperatureCalibration::calculateAtmosphericTransmittance() const
{
    double tau = exp(-m_objectDistance * (0.0065 + 0.01 * m_relativeHumidity));
    return std::max(0.5, std::min(1.0, tau));
}
