#ifndef CALIBRATIONDIALOG_H
#define CALIBRATIONDIALOG_H

#include <QDialog>
#include <QLineEdit>
#include <QDoubleSpinBox>
#include <QComboBox>
#include <QLabel>
#include <QImage>
#include "core/Calibrator.h"

class QPushButton;
class QGroupBox;
class QLabel;

class CalibrationDialog : public QDialog {
    Q_OBJECT

public:
    explicit CalibrationDialog(Calibrator* calibrator, QWidget* parent = nullptr);

    Calibrator::CalibrationData calibrationData() const { return m_data; }

private slots:
    void onManualCalibrate();
    void onBoardCalibrate();
    void onLoadCalibrationImages();
    void onApply();

private:
    void setupUI();
    void updateStatus();

    Calibrator* m_calibrator;
    Calibrator::CalibrationData m_data;

    QDoubleSpinBox* m_spinPixelLength;
    QDoubleSpinBox* m_spinPhysicalLength;
    QComboBox* m_comboUnit;
    QDoubleSpinBox* m_spinBoardCols;
    QDoubleSpinBox* m_spinBoardRows;
    QDoubleSpinBox* m_spinSquareSize;
    QPushButton* m_btnLoadImages;
    QLabel* m_labelStatus;
    QLabel* m_labelPreview;
    QImage m_previewImage;

    QList<cv::Mat> m_calibrationImages;
};

#endif
