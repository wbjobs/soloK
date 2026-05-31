#ifndef TIMESERIESCHART_H
#define TIMESERIESCHART_H

#include "../processing/TimeSeriesAnalyzer.h"
#include <QWidget>
#include <QVector>

class TimeSeriesChart : public QWidget
{
    Q_OBJECT
public:
    explicit TimeSeriesChart(QWidget* parent = nullptr);

    void setTimeSeriesData(const QVector<TimeSeriesData>& data);
    void clear();

protected:
    void paintEvent(QPaintEvent* event) override;

private:
    void drawChart(QPainter& painter, const TimeSeriesData& data,
                   int x, int y, int width, int height, int index);

    QVector<TimeSeriesData> m_data;
    int m_margin;
};

#endif
