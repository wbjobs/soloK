#ifndef DATAEXPORTER_H
#define DATAEXPORTER_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>
#include "core/StrainCalculator.h"

class DataExporter : public QObject {
    Q_OBJECT

public:
    enum Format {
        VTK,
        CSV,
        PDF,
        PNG,
        MAT
    };

    struct ExportOptions {
        QString filePath;
        Format format;
        bool includeCoordinates;
        bool includeDisplacement;
        bool includeStrain;
        bool includePrincipal;
        bool includeVonMises;
        bool includeElasticPlastic;
        bool includeDIC;
        bool includeFused;
        QString title;
        QString author;
        QString notes;
        int dpi;
    };

    explicit DataExporter(QObject* parent = nullptr);

    bool exportVTK(const QString& filePath,
                   const cv::Mat& displacementX, const cv::Mat& displacementY,
                   const StrainCalculator::StrainResult& strain,
                   double pixelToPhysical = 1.0);

    bool exportCSV(const QString& filePath,
                   const cv::Mat& displacementX, const cv::Mat& displacementY,
                   const StrainCalculator::StrainResult& strain,
                   const ExportOptions& options = ExportOptions());

    bool exportPDF(const QString& filePath,
                   const cv::Mat& originalImage,
                   const cv::Mat& coloredStrain,
                   const StrainCalculator::StrainResult& strain,
                   const StrainCalculator::ROIResult* roiResult = nullptr,
                   const QString& title = "Strain Analysis Report");

    bool exportImage(const QString& filePath, const cv::Mat& image, int dpi = 300);

    bool exportROIResults(const QString& filePath,
                          const std::vector<StrainCalculator::ROIResult>& results,
                          const QStringList& roiNames = QStringList());

    static bool exportTimeHistoryCSV(const QString& filePath,
                                     const std::vector<double>& times,
                                     const std::vector<std::vector<double>>& strainData,
                                     const QStringList& pointNames);

signals:
    void progress(int percent);
    void finished(bool success, const QString& message);

private:
    QString formatDouble(double value, int precision = 6);
};

#endif
