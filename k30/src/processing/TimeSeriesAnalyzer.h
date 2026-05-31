#ifndef TIMESERIESANALYZER_H
#define TIMESERIESANALYZER_H

#include "../data/TemperatureFrame.h"
#include <QPoint>
#include <QVector>
#include <QPair>
#include <vector>
#include <fftw3.h>

struct TimeSeriesData {
    QPoint point;
    QVector<double> temperatures;
    QVector<double> timestamps;
    QVector<bool> isInterference;
    QVector<double> filteredTemperatures;
    double trendSlope;
    double robustTrendSlope;
    bool hasCoolingTrend;
    double maxMinuteChange;
    int interferenceCount;
};

struct InterferenceEvent {
    int startIndex;
    int endIndex;
    double maxAmplitude;
    QString type;
};

class TimeSeriesAnalyzer {
public:
    TimeSeriesAnalyzer();
    ~TimeSeriesAnalyzer();

    TimeSeriesData analyzePoint(const std::vector<TemperatureFrame>& frames, const QPoint& point);

    QVector<TimeSeriesData> analyzeMultiplePoints(
        const std::vector<TemperatureFrame>& frames,
        const QVector<QPoint>& points);

    double coolingThreshold() const;
    void setCoolingThreshold(double threshold);

    int smoothingWindow() const;
    void setSmoothingWindow(int window);

    double spikeThreshold() const;
    void setSpikeThreshold(double threshold);

    QVector<double> fftAnalysis(const QVector<double>& data);

    QVector<InterferenceEvent> detectInterference(const QVector<double>& temps,
                                                   const QVector<double>& timestamps);

private:
    double linearRegressionSlope(const QVector<double>& x, const QVector<double>& y);
    double robustRegressionSlope(const QVector<double>& x, const QVector<double>& y,
                                 const QVector<bool>& mask);
    QVector<double> smoothData(const QVector<double>& data);
    QVector<double> medianFilter(const QVector<double>& data, int windowSize);
    QVector<bool> detectSpikes(const QVector<double>& data, const QVector<double>& timestamps);
    QVector<double> interpolateSpikes(const QVector<double>& data, const QVector<bool>& isSpike);

    double m_coolingThreshold;
    int m_smoothingWindow;
    double m_spikeThreshold;
    int m_medianWindow;
};

#endif
