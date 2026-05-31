#ifndef TEMPERATURECALIBRATION_H
#define TEMPERATURECALIBRATION_H

#include "../data/TemperatureFrame.h"
#include <vector>

class TemperatureCalibration {
public:
    TemperatureCalibration();

    TemperatureFrame calibrateFrame(const TemperatureFrame& frame);
    std::vector<TemperatureFrame> calibrateFrames(const std::vector<TemperatureFrame>& frames);

    double emissivity() const;
    void setEmissivity(double e);

    double reflectedTemperature() const;
    void setReflectedTemperature(double t);

    double atmosphericTemperature() const;
    void setAtmosphericTemperature(double t);

    double objectDistance() const;
    void setObjectDistance(double d);

    double relativeHumidity() const;
    void setRelativeHumidity(double h);

private:
    double correctTemperature(double rawTemp) const;
    double calculateAtmosphericTransmittance() const;

    double m_emissivity;
    double m_reflectedTemperature;
    double m_atmosphericTemperature;
    double m_objectDistance;
    double m_relativeHumidity;
};

#endif
