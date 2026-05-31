#ifndef TEMIMPORTER_H
#define TEMIMPORTER_H

#include "../data/TEMData.h"
#include <QObject>
#include <QString>

class TEMImporter : public QObject
{
    Q_OBJECT
public:
    explicit TEMImporter(QObject* parent = nullptr);

    TEMProfile importProfile(const QString& filePath);

    double lowResistivityThreshold() const;
    void setLowResistivityThreshold(double threshold);

signals:
    void progress(int current, int total);
    void error(const QString& message);

private:
    TEMProfile parseXYZFile(const QString& filePath);
    TEMProfile parseCSVFile(const QString& filePath);
    TEMProfile generateSimulatedProfile();

    double m_lowResistivityThreshold;
};

#endif
