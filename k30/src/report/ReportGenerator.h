#ifndef REPORTGENERATOR_H
#define REPORTGENERATOR_H

#include "../data/TemperatureFrame.h"
#include "../data/AnomalyRegion.h"
#include "../processing/WaterStructureLocalizer.h"
#include "../processing/TimeSeriesAnalyzer.h"
#include <QString>
#include <vector>
#include <QPdfWriter>
#include <QPainter>

class ReportGenerator {
public:
    ReportGenerator();

    bool generatePDF(const QString& filePath,
                     const std::vector<TemperatureFrame>& frames,
                     const std::vector<AnomalyRegion>& anomalies,
                     const std::vector<DrillingSuggestion>& suggestions,
                     const QVector<TimeSeriesData>& timeSeriesData,
                     const QString& projectName,
                     const QString& tunnelName);

    void setPageSize(int width, int height);
    void setDPI(int dpi);

private:
    void drawHeader(QPainter& painter, const QString& projectName, const QString& tunnelName);
    void drawTemperatureMaps(QPainter& painter, const std::vector<TemperatureFrame>& frames);
    void drawAnomalyTable(QPainter& painter, const std::vector<AnomalyRegion>& anomalies);
    void drawDrillingSuggestions(QPainter& painter, const std::vector<DrillingSuggestion>& suggestions);
    void drawTimeSeriesCharts(QPainter& painter, const QVector<TimeSeriesData>& timeSeriesData);
    void drawConclusion(QPainter& painter, const std::vector<AnomalyRegion>& anomalies);

    QImage matToQImage(const cv::Mat& mat);

    int m_pageWidth;
    int m_pageHeight;
    int m_dpi;
    int m_margin;
    int m_currentY;
};

#endif
