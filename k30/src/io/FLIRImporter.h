#ifndef FLIRIMPORTER_H
#define FLIRIMPORTER_H

#include "../data/TemperatureFrame.h"
#include <QStringList>
#include <QObject>
#include <vector>

class FLIRImporter : public QObject
{
    Q_OBJECT
public:
    explicit FLIRImporter(QObject* parent = nullptr);

    std::vector<TemperatureFrame> importFrames(const QStringList& filePaths);
    TemperatureFrame importSingleFrame(const QString& filePath);

    double emissivity() const;
    void setEmissivity(double e);

    double objectDistance() const;
    void setObjectDistance(double d);

    double ambientTemperature() const;
    void setAmbientTemperature(double t);

signals:
    void progress(int current, int total);
    void error(const QString& message);

private:
    TemperatureFrame parseFLIRFile(const QString& filePath);
    TemperatureFrame parseCSVFile(const QString& filePath);
    TemperatureFrame parseTIFFFile(const QString& filePath);
    TemperatureFrame generateSimulatedFrame(const QString& filePath);

    double m_emissivity;
    double m_objectDistance;
    double m_ambientTemperature;
};

#endif
