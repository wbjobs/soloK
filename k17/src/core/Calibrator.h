#ifndef CALIBRATOR_H
#define CALIBRATOR_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>

class Calibrator : public QObject {
    Q_OBJECT

public:
    struct CalibrationData {
        double pixelSize;
        double physicalUnit;
        double conversionFactor;
        bool isCalibrated;
        QString unit;
        double referenceLengthPixels;
        double referenceLengthPhysical;
    };

    explicit Calibrator(QObject* parent = nullptr);

    void setPixelSize(double size);
    double pixelSize() const;

    void setPhysicalUnit(const QString& unit);
    QString physicalUnit() const;

    void calibrateFromReference(double pixelLength, double physicalLength, const QString& unit);
    void calibrateFromBoard(int innerCols, int innerRows, double squareSize,
                           const std::vector<cv::Mat>& images);

    double conversionFactor() const;
    bool isCalibrated() const;

    CalibrationData data() const;
    void setData(const CalibrationData& data);

    cv::Mat applyCalibration(const cv::Mat& displacementField) const;

    static double computeStrainConversionFactor(const CalibrationData& calib, double gaugeLength);

signals:
    void calibrationChanged();
    void calibrationFinished(bool success, const QString& message);

private:
    CalibrationData m_data;
};

#endif
