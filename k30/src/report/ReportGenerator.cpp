#include "ReportGenerator.h"
#include <QDateTime>
#include <QImage>
#include <QPixmap>
#include <QPainter>
#include <QPageSize>
#include <QPen>
#include <QFont>
#include <QDebug>

ReportGenerator::ReportGenerator()
    : m_pageWidth(210)
    , m_pageHeight(297)
    , m_dpi(96)
    , m_margin(20)
    , m_currentY(0)
{
}

bool ReportGenerator::generatePDF(const QString& filePath,
                                  const std::vector<TemperatureFrame>& frames,
                                  const std::vector<AnomalyRegion>& anomalies,
                                  const std::vector<DrillingSuggestion>& suggestions,
                                  const QVector<TimeSeriesData>& timeSeriesData,
                                  const QString& projectName,
                                  const QString& tunnelName)
{
    if (filePath.isEmpty()) {
        return false;
    }

    QPdfWriter writer(filePath);
    writer.setPageSize(QPageSize(QPageSize::A4));
    writer.setPageMargins(QMarginsF(m_margin, m_margin, m_margin, m_margin),
                          QPageLayout::Millimeter);
    writer.setResolution(m_dpi);
    writer.setTitle("红外探水超前预报报告");

    QPainter painter(&writer);
    if (!painter.isActive()) {
        return false;
    }

    m_currentY = 0;
    drawHeader(painter, projectName, tunnelName);
    drawTemperatureMaps(painter, frames);
    drawAnomalyTable(painter, anomalies);
    drawDrillingSuggestions(painter, suggestions);
    drawTimeSeriesCharts(painter, timeSeriesData);
    drawConclusion(painter, anomalies);

    painter.end();
    return true;
}

void ReportGenerator::setPageSize(int width, int height)
{
    m_pageWidth = width;
    m_pageHeight = height;
}

void ReportGenerator::setDPI(int dpi)
{
    m_dpi = dpi;
}

void ReportGenerator::drawHeader(QPainter& painter, const QString& projectName, const QString& tunnelName)
{
    painter.setPen(QPen(Qt::black));
    QFont titleFont("SimHei", 16, QFont::Bold);
    painter.setFont(titleFont);

    QString title = "隧道红外探水超前预报报告";
    painter.drawText(0, m_currentY, 170, 20, Qt::AlignCenter, title);
    m_currentY += 30;

    QFont infoFont("SimHei", 10);
    painter.setFont(infoFont);

    QString projectInfo = QString("工程名称: %1").arg(projectName);
    painter.drawText(0, m_currentY, 170, 10, Qt::AlignLeft, projectInfo);
    m_currentY += 12;

    QString tunnelInfo = QString("隧道名称: %1").arg(tunnelName);
    painter.drawText(0, m_currentY, 170, 10, Qt::AlignLeft, tunnelInfo);
    m_currentY += 12;

    QString dateInfo = QString("报告日期: %1").arg(QDateTime::currentDateTime().toString("yyyy-MM-dd hh:mm:ss"));
    painter.drawText(0, m_currentY, 170, 10, Qt::AlignLeft, dateInfo);
    m_currentY += 20;
}

void ReportGenerator::drawTemperatureMaps(QPainter& painter, const std::vector<TemperatureFrame>& frames)
{
    if (frames.empty()) return;

    QFont sectionFont("SimHei", 12, QFont::Bold);
    painter.setFont(sectionFont);
    painter.drawText(0, m_currentY, 170, 15, Qt::AlignLeft, "一、温度场分布图");
    m_currentY += 20;

    int imagesPerRow = 2;
    int imageWidth = 80;
    int imageHeight = 60;
    int spacing = 10;

    for (size_t i = 0; i < std::min(frames.size(), (size_t)4); ++i) {
        if (!frames[i].pseudoColorMap().empty()) {
            QImage img = matToQImage(frames[i].pseudoColorMap());
            if (!img.isNull()) {
                int row = i / imagesPerRow;
                int col = i % imagesPerRow;
                int x = col * (imageWidth + spacing);
                int y = m_currentY + row * (imageHeight + spacing + 15);

                QPixmap pixmap = QPixmap::fromImage(img).scaled(
                    imageWidth * m_dpi / 25.4, imageHeight * m_dpi / 25.4,
                    Qt::KeepAspectRatio, Qt::SmoothTransformation);

                painter.drawPixmap(x * m_dpi / 25.4, y * m_dpi / 25.4, pixmap);

                QFont captionFont("SimHei", 8);
                painter.setFont(captionFont);
                QString caption = QString("帧 %1").arg(i + 1);
                painter.drawText(x * m_dpi / 25.4, (y + imageHeight + 5) * m_dpi / 25.4,
                                 imageWidth * m_dpi / 25.4, 10, Qt::AlignCenter, caption);
            }
        }
    }

    m_currentY += 2 * (imageHeight + spacing + 15) + 10;
}

void ReportGenerator::drawAnomalyTable(QPainter& painter, const std::vector<AnomalyRegion>& anomalies)
{
    QFont sectionFont("SimHei", 12, QFont::Bold);
    painter.setFont(sectionFont);
    painter.drawText(0, m_currentY, 170, 15, Qt::AlignLeft, "二、低温异常区统计表");
    m_currentY += 20;

    QFont tableFont("SimHei", 9);
    painter.setFont(tableFont);

    int colWidths[] = {25, 40, 35, 35, 35};
    QString headers[] = {"编号", "位置(X,Y,Z)", "温差(°C)", "平均温度(°C)", "含水性"};

    painter.setPen(QPen(Qt::black, 0.5));
    for (int i = 0; i < 5; ++i) {
        int x = 0;
        for (int j = 0; j < i; ++j) x += colWidths[j];
        painter.drawRect(x * m_dpi / 25.4, m_currentY * m_dpi / 25.4,
                         colWidths[i] * m_dpi / 25.4, 10 * m_dpi / 25.4);
        painter.drawText(x * m_dpi / 25.4, m_currentY * m_dpi / 25.4,
                         colWidths[i] * m_dpi / 25.4, 10 * m_dpi / 25.4,
                         Qt::AlignCenter, headers[i]);
    }
    m_currentY += 10;

    for (size_t i = 0; i < anomalies.size(); ++i) {
        const auto& anomaly = anomalies[i];
        ThreeDPosition pos = anomaly.threeDPosition();

        QString rowData[] = {
            QString::number(i + 1),
            QString("(%1,%2,%3)").arg(pos.x, 0, 'f', 1).arg(pos.y, 0, 'f', 1).arg(pos.z, 0, 'f', 1),
            QString::number(anomaly.temperatureDifference(), 'f', 2),
            QString::number(anomaly.averageTemperature(), 'f', 2),
            anomaly.probabilityString()
        };

        for (int j = 0; j < 5; ++j) {
            int x = 0;
            for (int k = 0; k < j; ++k) x += colWidths[k];
            painter.drawRect(x * m_dpi / 25.4, m_currentY * m_dpi / 25.4,
                             colWidths[j] * m_dpi / 25.4, 10 * m_dpi / 25.4);
            painter.drawText(x * m_dpi / 25.4, m_currentY * m_dpi / 25.4,
                             colWidths[j] * m_dpi / 25.4, 10 * m_dpi / 25.4,
                             Qt::AlignCenter, rowData[j]);
        }
        m_currentY += 10;
    }

    if (anomalies.empty()) {
        painter.drawText(0, m_currentY * m_dpi / 25.4, 170 * m_dpi / 25.4,
                         10 * m_dpi / 25.4, Qt::AlignCenter, "未检测到显著低温异常区");
        m_currentY += 15;
    }

    m_currentY += 10;
}

void ReportGenerator::drawDrillingSuggestions(QPainter& painter, const std::vector<DrillingSuggestion>& suggestions)
{
    QFont sectionFont("SimHei", 12, QFont::Bold);
    painter.setFont(sectionFont);
    painter.drawText(0, m_currentY, 170, 15, Qt::AlignLeft, "三、超前钻探建议位置");
    m_currentY += 20;

    QFont textFont("SimHei", 9);
    painter.setFont(textFont);

    for (size_t i = 0; i < suggestions.size(); ++i) {
        const auto& s = suggestions[i];
        QString text = QString("%1. 位置: (%2m, %3m, %4m)  优先级: %5  - %6")
            .arg(i + 1)
            .arg(s.position.x, 0, 'f', 2)
            .arg(s.position.y, 0, 'f', 2)
            .arg(s.position.z, 0, 'f', 2)
            .arg(s.priority, 0, 'f', 2)
            .arg(s.description);

        painter.drawText(0, m_currentY * m_dpi / 25.4, 170 * m_dpi / 25.4,
                         8 * m_dpi / 25.4, Qt::AlignLeft, text);
        m_currentY += 10;
    }

    if (suggestions.empty()) {
        painter.drawText(0, m_currentY * m_dpi / 25.4, 170 * m_dpi / 25.4,
                         8 * m_dpi / 25.4, Qt::AlignLeft, "当前无钻探建议");
        m_currentY += 12;
    }

    m_currentY += 15;
}

void ReportGenerator::drawTimeSeriesCharts(QPainter& painter, const QVector<TimeSeriesData>& timeSeriesData)
{
    if (timeSeriesData.isEmpty()) return;

    QFont sectionFont("SimHei", 12, QFont::Bold);
    painter.setFont(sectionFont);
    painter.drawText(0, m_currentY, 170, 15, Qt::AlignLeft, "四、温度时间序列分析");
    m_currentY += 20;

    QFont textFont("SimHei", 9);
    painter.setFont(textFont);

    for (int i = 0; i < std::min(timeSeriesData.size(), 3); ++i) {
        const auto& data = timeSeriesData[i];
        QString text = QString("测点(%1,%2): 趋势斜率=%3 °C/s, %4")
            .arg(data.point.x())
            .arg(data.point.y())
            .arg(data.trendSlope, 0, 'f', 4)
            .arg(data.hasCoolingTrend ? "存在降温趋势" : "无明显降温趋势");

        painter.drawText(0, m_currentY * m_dpi / 25.4, 170 * m_dpi / 25.4,
                         8 * m_dpi / 25.4, Qt::AlignLeft, text);
        m_currentY += 10;

        int chartWidth = 160;
        int chartHeight = 30;
        int chartX = 5;
        int chartY = m_currentY;

        painter.setPen(QPen(Qt::black, 0.3));
        painter.drawRect(chartX * m_dpi / 25.4, chartY * m_dpi / 25.4,
                         chartWidth * m_dpi / 25.4, chartHeight * m_dpi / 25.4);

        if (data.temperatures.size() >= 2) {
            double minTemp = *std::min_element(data.temperatures.begin(), data.temperatures.end());
            double maxTemp = *std::max_element(data.temperatures.begin(), data.temperatures.end());
            double tempRange = maxTemp - minTemp;
            if (tempRange < 0.1) tempRange = 0.1;

            painter.setPen(QPen(Qt::red, 0.5));
            for (int j = 0; j < data.temperatures.size() - 1; ++j) {
                double x1 = chartX + (double)j / (data.temperatures.size() - 1) * chartWidth;
                double y1 = chartY + chartHeight - (data.temperatures[j] - minTemp) / tempRange * chartHeight;
                double x2 = chartX + (double)(j + 1) / (data.temperatures.size() - 1) * chartWidth;
                double y2 = chartY + chartHeight - (data.temperatures[j + 1] - minTemp) / tempRange * chartHeight;

                painter.drawLine(x1 * m_dpi / 25.4, y1 * m_dpi / 25.4,
                                 x2 * m_dpi / 25.4, y2 * m_dpi / 25.4);
            }
        }

        m_currentY += chartHeight + 5;
    }

    m_currentY += 15;
}

void ReportGenerator::drawConclusion(QPainter& painter, const std::vector<AnomalyRegion>& anomalies)
{
    QFont sectionFont("SimHei", 12, QFont::Bold);
    painter.setFont(sectionFont);
    painter.drawText(0, m_currentY, 170, 15, Qt::AlignLeft, "五、预报结论");
    m_currentY += 20;

    QFont textFont("SimHei", 10);
    painter.setFont(textFont);

    WaterProbability maxProb = WaterProbability::None;
    for (const auto& a : anomalies) {
        if (a.waterProbability() > maxProb) {
            maxProb = a.waterProbability();
        }
    }

    QString conclusion;
    QString suggestion;

    switch (maxProb) {
    case WaterProbability::High:
        conclusion = "综合判断: 掌子面前方存在较高含水可能性。";
        suggestion = "建议: 立即进行超前钻探验证,并做好防水预案。";
        break;
    case WaterProbability::Medium:
        conclusion = "综合判断: 掌子面前方存在中等含水可能性。";
        suggestion = "建议: 考虑进行超前钻探,加强施工监测。";
        break;
    case WaterProbability::Low:
        conclusion = "综合判断: 掌子面前方存在较低含水可能性。";
        suggestion = "建议: 保持关注,继续常规监测。";
        break;
    case WaterProbability::None:
    default:
        conclusion = "综合判断: 未检测到明显含水异常。";
        suggestion = "建议: 可正常施工,保持常规监测。";
        break;
    }

    painter.drawText(0, m_currentY * m_dpi / 25.4, 170 * m_dpi / 25.4,
                     10 * m_dpi / 25.4, Qt::AlignLeft, conclusion);
    m_currentY += 15;

    painter.drawText(0, m_currentY * m_dpi / 25.4, 170 * m_dpi / 25.4,
                     10 * m_dpi / 25.4, Qt::AlignLeft, suggestion);
    m_currentY += 15;

    int highCount = 0, mediumCount = 0, lowCount = 0;
    for (const auto& a : anomalies) {
        switch (a.waterProbability()) {
        case WaterProbability::High: highCount++; break;
        case WaterProbability::Medium: mediumCount++; break;
        case WaterProbability::Low: lowCount++; break;
        default: break;
        }
    }

    QString summary = QString("检测到异常区共%1处: 高风险%2处, 中风险%3处, 低风险%4处。")
        .arg(anomalies.size()).arg(highCount).arg(mediumCount).arg(lowCount);

    painter.drawText(0, m_currentY * m_dpi / 25.4, 170 * m_dpi / 25.4,
                     10 * m_dpi / 25.4, Qt::AlignLeft, summary);
}

QImage ReportGenerator::matToQImage(const cv::Mat& mat)
{
    if (mat.empty()) return QImage();

    if (mat.type() == CV_8UC3) {
        cv::Mat rgb;
        cv::cvtColor(mat, rgb, cv::COLOR_BGR2RGB);
        return QImage(rgb.data, rgb.cols, rgb.rows, rgb.step, QImage::Format_RGB888).copy();
    } else if (mat.type() == CV_8UC1) {
        return QImage(mat.data, mat.cols, mat.rows, mat.step, QImage::Format_Grayscale8).copy();
    }

    return QImage();
}
