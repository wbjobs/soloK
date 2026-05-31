#include "TimeSeriesChart.h"
#include <QPainter>
#include <QPen>
#include <QFont>
#include <QColor>
#include <algorithm>

TimeSeriesChart::TimeSeriesChart(QWidget* parent)
    : QWidget(parent)
    , m_margin(40)
{
    setMinimumHeight(200);
}

void TimeSeriesChart::setTimeSeriesData(const QVector<TimeSeriesData>& data)
{
    m_data = data;
    update();
}

void TimeSeriesChart::clear()
{
    m_data.clear();
    update();
}

void TimeSeriesChart::paintEvent(QPaintEvent* event)
{
    Q_UNUSED(event);
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);

    painter.fillRect(rect(), Qt::white);

    if (m_data.isEmpty()) {
        painter.setPen(Qt::gray);
        painter.drawText(rect(), Qt::AlignCenter, "请选择测点查看温度时间序列");
        return;
    }

    int chartsPerRow = 2;
    int chartWidth = (width() - m_margin * 2 - 10) / chartsPerRow;
    int chartHeight = (height() - m_margin * 2 - 10) / ((m_data.size() + 1) / chartsPerRow);
    chartHeight = std::max(chartHeight, 80);

    for (int i = 0; i < m_data.size(); ++i) {
        int row = i / chartsPerRow;
        int col = i % chartsPerRow;
        int x = m_margin + col * (chartWidth + 10);
        int y = m_margin + row * (chartHeight + 10);

        drawChart(painter, m_data[i], x, y, chartWidth, chartHeight, i);
    }
}

void TimeSeriesChart::drawChart(QPainter& painter, const TimeSeriesData& data,
                                int x, int y, int width, int height, int index)
{
    painter.setPen(QPen(Qt::black, 1));
    painter.drawRect(x, y, width, height);

    QFont titleFont("Arial", 9);
    painter.setFont(titleFont);
    painter.setPen(Qt::black);
    QString title = QString("测点%1: (%2,%3)")
        .arg(index + 1)
        .arg(data.point.x())
        .arg(data.point.y());
    painter.drawText(x + 5, y + 15, title);

    if (data.temperatures.size() < 2) {
        painter.setPen(Qt::gray);
        painter.drawText(x, y + height / 2, width, 20, Qt::AlignCenter, "数据不足");
        return;
    }

    double minTemp = *std::min_element(data.temperatures.begin(), data.temperatures.end());
    double maxTemp = *std::max_element(data.temperatures.begin(), data.temperatures.end());
    double tempRange = maxTemp - minTemp;
    if (tempRange < 0.1) tempRange = 0.1;

    int plotX = x + 40;
    int plotY = y + 25;
    int plotWidth = width - 50;
    int plotHeight = height - 40;

    painter.setPen(QPen(Qt::lightGray, 0.5));
    for (int i = 0; i <= 4; ++i) {
        int lineY = plotY + plotHeight * i / 4;
        painter.drawLine(plotX, lineY, plotX + plotWidth, lineY);

        double tempVal = maxTemp - tempRange * i / 4;
        painter.setPen(Qt::gray);
        painter.drawText(x + 5, lineY + 5, QString::number(tempVal, 'f', 1));
        painter.setPen(QPen(Qt::lightGray, 0.5));
    }

    if (!data.filteredTemperatures.isEmpty() && data.interferenceCount > 0) {
        painter.setPen(QPen(QColor(255, 200, 200), 1, Qt::DashLine));
        for (int i = 0; i < data.temperatures.size() - 1; ++i) {
            double x1 = plotX + (double)i / (data.temperatures.size() - 1) * plotWidth;
            double y1 = plotY + plotHeight - (data.temperatures[i] - minTemp) / tempRange * plotHeight;
            double x2 = plotX + (double)(i + 1) / (data.temperatures.size() - 1) * plotWidth;
            double y2 = plotY + plotHeight - (data.temperatures[i + 1] - minTemp) / tempRange * plotHeight;

            painter.drawLine(QPointF(x1, y1), QPointF(x2, y2));
        }

        painter.setBrush(QColor(255, 200, 200, 80));
        painter.setPen(Qt::NoPen);
        for (int i = 0; i < data.isInterference.size(); ++i) {
            if (data.isInterference[i]) {
                double x1 = plotX + (double)i / (data.temperatures.size() - 1) * plotWidth - 2;
                painter.drawRect(QRectF(x1, plotY, 4, plotHeight));
            }
        }
    }

    const QVector<double>& displayTemps = data.filteredTemperatures.isEmpty() ? 
        data.temperatures : data.filteredTemperatures;

    QColor lineColor = data.hasCoolingTrend ? Qt::red : Qt::blue;
    painter.setPen(QPen(lineColor, 2));

    for (int i = 0; i < displayTemps.size() - 1; ++i) {
        double x1 = plotX + (double)i / (displayTemps.size() - 1) * plotWidth;
        double y1 = plotY + plotHeight - (displayTemps[i] - minTemp) / tempRange * plotHeight;
        double x2 = plotX + (double)(i + 1) / (displayTemps.size() - 1) * plotWidth;
        double y2 = plotY + plotHeight - (displayTemps[i + 1] - minTemp) / tempRange * plotHeight;

        painter.drawLine(QPointF(x1, y1), QPointF(x2, y2));
    }

    painter.setPen(Qt::black);
    QFont infoFont("Arial", 8);
    painter.setFont(infoFont);
    
    double displaySlope = data.robustTrendSlope != 0 ? data.robustTrendSlope : data.trendSlope;
    QString trendText = QString("趋势: %1°C/s %2")
        .arg(displaySlope, 0, 'f', 4)
        .arg(data.hasCoolingTrend ? "(降温)" : "(稳定)");
    
    if (data.interferenceCount > 0) {
        trendText += QString(" [干扰:%1处]").arg(data.interferenceCount);
    }
    
    painter.drawText(x + 5, y + height - 5, trendText);
}
