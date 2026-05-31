#include "core/Calibrator.h"
#include "utils/MathUtils.h"
#include <cmath>
#include <algorithm>

Calibrator::Calibrator(QObject* parent)
    : QObject(parent)
{
    m_data.pixelSize = 1.0;
    m_data.physicalUnit = "mm";
    m_data.conversionFactor = 1.0;
    m_data.isCalibrated = false;
    m_data.referenceLengthPixels = 0.0;
    m_data.referenceLengthPhysical = 0.0;
}

void Calibrator::setPixelSize(double size) {
    m_data.pixelSize = size;
    m_data.conversionFactor = size;
    emit calibrationChanged();
}

double Calibrator::pixelSize() const { return m_data.pixelSize; }

void Calibrator::setPhysicalUnit(const QString& unit) {
    m_data.physicalUnit = unit;
    m_data.unit = unit;
    emit calibrationChanged();
}

QString Calibrator::physicalUnit() const { return m_data.physicalUnit; }

void Calibrator::calibrateFromReference(double pixelLength, double physicalLength, const QString& unit) {
    if (pixelLength <= 0 || physicalLength <= 0) {
        emit calibrationFinished(false, "Invalid calibration parameters");
        return;
    }

    m_data.referenceLengthPixels = pixelLength;
    m_data.referenceLengthPhysical = physicalLength;
    m_data.pixelSize = physicalLength / pixelLength;
    m_data.conversionFactor = m_data.pixelSize;
    m_data.physicalUnit = unit;
    m_data.unit = unit;
    m_data.isCalibrated = true;

    emit calibrationChanged();
    emit calibrationFinished(true, QString("Calibration: %1 px = %2 %3")
                                .arg(pixelLength, 0, 'f', 1)
                                .arg(physicalLength, 0, 'f', 3)
                                .arg(unit));
}

void Calibrator::calibrateFromBoard(int innerCols, int innerRows, double squareSize,
                                    const std::vector<cv::Mat>& images)
{
    if (images.empty()) {
        emit calibrationFinished(false, "No calibration images");
        return;
    }

    std::vector<cv::Point2f> allCorners;
    cv::Size boardSize(innerCols, innerRows);

    for (const auto& img : images) {
        cv::Mat gray;
        if (img.channels() > 1) {
            cv::cvtColor(img, gray, cv::COLOR_BGR2GRAY);
        } else {
            gray = img.clone();
        }

        std::vector<cv::Point2f> corners;
        bool found = cv::findChessboardCorners(gray, boardSize, corners,
                                               cv::CALIB_CB_ADAPTIVE_THRESH + cv::CALIB_CB_NORMALIZE_IMAGE);
        if (found) {
            cv::cornerSubPix(gray, corners, cv::Size(11, 11), cv::Size(-1, -1),
                           cv::TermCriteria(cv::TermCriteria::EPS + cv::TermCriteria::MAX_ITER, 30, 0.001));
            allCorners.insert(allCorners.end(), corners.begin(), corners.end());
        }
    }

    if (allCorners.size() < 4) {
        emit calibrationFinished(false, "Insufficient corners detected");
        return;
    }

    double totalPixelDist = 0.0;
    int count = 0;
    for (size_t i = 1; i < allCorners.size(); ++i) {
        double dist = cv::norm(allCorners[i] - allCorners[i - 1]);
        if (dist > 5.0 && dist < 1000.0) {
            totalPixelDist += dist;
            count++;
        }
    }

    if (count == 0) {
        emit calibrationFinished(false, "Could not estimate pixel size");
        return;
    }

    double avgPixelDist = totalPixelDist / count;
    double pixelSize = squareSize / avgPixelDist;
    calibrateFromReference(avgPixelDist, squareSize, "mm");
}

double Calibrator::conversionFactor() const { return m_data.conversionFactor; }
bool Calibrator::isCalibrated() const { return m_data.isCalibrated; }
Calibrator::CalibrationData Calibrator::data() const { return m_data; }

void Calibrator::setData(const CalibrationData& data) {
    m_data = data;
    emit calibrationChanged();
}

cv::Mat Calibrator::applyCalibration(const cv::Mat& displacementField) const {
    cv::Mat result = displacementField.clone();
    result *= m_data.conversionFactor;
    return result;
}

double Calibrator::computeStrainConversionFactor(const CalibrationData& calib, double gaugeLength) {
    if (gaugeLength <= 0.0) return 1.0;
    return calib.conversionFactor / gaugeLength;
}
