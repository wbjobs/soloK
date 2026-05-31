#ifndef EXPORTDIALOG_H
#define EXPORTDIALOG_H

#include <QDialog>
#include <QComboBox>
#include <QCheckBox>
#include <QLineEdit>
#include <QLabel>
#include <opencv2/opencv.hpp>
#include "core/StrainCalculator.h"

class QGroupBox;
class QSpinBox;
class QDoubleSpinBox;

class ExportDialog : public QDialog {
    Q_OBJECT

public:
    struct ExportConfig {
        cv::Mat originalImage;
        cv::Mat displacementX;
        cv::Mat displacementY;
        StrainCalculator::StrainResult strain;
        StrainCalculator::ROIResult roiResult;
        bool hasROI;
    };

    explicit ExportDialog(const ExportConfig& config, QWidget* parent = nullptr);

    QString selectedFormat() const;
    QString filePath() const;
    bool includeCoordinates() const;
    bool includeDisplacement() const;
    bool includeStrain() const;
    bool includePrincipal() const;
    bool includeVonMises() const;
    int dpi() const;

private slots:
    void onBrowse();
    void onFormatChanged(int index);

private:
    void setupUI();

    ExportConfig m_config;
    QComboBox* m_comboFormat;
    QLineEdit* m_editFilePath;
    QCheckBox* m_chkCoordinates;
    QCheckBox* m_chkDisplacement;
    QCheckBox* m_chkStrain;
    QCheckBox* m_chkPrincipal;
    QCheckBox* m_chkVonMises;
    QSpinBox* m_spinDpi;
    QLabel* m_labelPreview;
};

#endif
