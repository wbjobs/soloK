#include "TimeSeriesAnalyzer.h"
#include <QDebug>
#include <cmath>
#include <algorithm>

TimeSeriesAnalyzer::TimeSeriesAnalyzer()
    : m_coolingThreshold(-0.01)
    , m_smoothingWindow(5)
    , m_spikeThreshold(5.0)
    , m_medianWindow(3)
{
}

TimeSeriesAnalyzer::~TimeSeriesAnalyzer()
{
}

TimeSeriesData TimeSeriesAnalyzer::analyzePoint(const std::vector<TemperatureFrame>& frames,
                                                const QPoint& point)
{
    TimeSeriesData result;
    result.point = point;
    result.trendSlope = 0;
    result.robustTrendSlope = 0;
    result.hasCoolingTrend = false;
    result.maxMinuteChange = 0;
    result.interferenceCount = 0;

    if (frames.empty()) {
        return result;
    }

    QVector<double> temps;
    QVector<double> timestamps;

    for (size_t i = 0; i < frames.size(); ++i) {
        double temp = frames[i].getTemperatureAt(point.x(), point.y());
        temps.push_back(temp);

        double t = static_cast<double>(i);
        if (i > 0) {
            qint64 msecs = frames[0].timestamp().msecsTo(frames[i].timestamp());
            t = static_cast<double>(msecs) / 1000.0;
        }
        timestamps.push_back(t);
    }

    result.temperatures = temps;
    result.timestamps = timestamps;

    result.isInterference = detectSpikes(temps, timestamps);
    result.interferenceCount = 0;
    for (bool b : result.isInterference) {
        if (b) result.interferenceCount++;
    }

    result.filteredTemperatures = interpolateSpikes(temps, result.isInterference);
    QVector<double> smoothedTemps = smoothData(result.filteredTemperatures);

    result.trendSlope = linearRegressionSlope(timestamps, smoothedTemps);
    result.robustTrendSlope = robustRegressionSlope(timestamps, smoothedTemps, result.isInterference);

    double maxChange = 0;
    for (int i = 1; i < temps.size(); ++i) {
        if (!result.isInterference[i] && !result.isInterference[i-1]) {
            double dt = timestamps[i] - timestamps[i-1];
            if (dt > 0) {
                double changePerMinute = qAbs(temps[i] - temps[i-1]) / dt * 60.0;
                maxChange = std::max(maxChange, changePerMinute);
            }
        }
    }
    result.maxMinuteChange = maxChange;

    result.hasCoolingTrend = (result.robustTrendSlope < m_coolingThreshold &&
                              result.maxMinuteChange < m_spikeThreshold);

    return result;
}

QVector<TimeSeriesData> TimeSeriesAnalyzer::analyzeMultiplePoints(
    const std::vector<TemperatureFrame>& frames,
    const QVector<QPoint>& points)
{
    QVector<TimeSeriesData> results;

    for (const QPoint& pt : points) {
        results.push_back(analyzePoint(frames, pt));
    }

    return results;
}

double TimeSeriesAnalyzer::coolingThreshold() const
{
    return m_coolingThreshold;
}

void TimeSeriesAnalyzer::setCoolingThreshold(double threshold)
{
    m_coolingThreshold = threshold;
}

int TimeSeriesAnalyzer::smoothingWindow() const
{
    return m_smoothingWindow;
}

void TimeSeriesAnalyzer::setSmoothingWindow(int window)
{
    m_smoothingWindow = std::max(1, window);
}

double TimeSeriesAnalyzer::spikeThreshold() const
{
    return m_spikeThreshold;
}

void TimeSeriesAnalyzer::setSpikeThreshold(double threshold)
{
    m_spikeThreshold = threshold;
}

QVector<InterferenceEvent> TimeSeriesAnalyzer::detectInterference(
    const QVector<double>& temps, const QVector<double>& timestamps)
{
    QVector<InterferenceEvent> events;
    QVector<bool> isSpike = detectSpikes(temps, timestamps);

    int i = 0;
    while (i < isSpike.size()) {
        if (isSpike[i]) {
            InterferenceEvent event;
            event.startIndex = i;
            double maxAmp = 0;
            double baseline = 0;
            int baselineCount = 0;

            for (int j = std::max(0, i - 5); j < i; ++j) {
                if (!isSpike[j]) {
                    baseline += temps[j];
                    baselineCount++;
                }
            }
            if (baselineCount > 0) baseline /= baselineCount;

            while (i < isSpike.size() && isSpike[i]) {
                maxAmp = std::max(maxAmp, qAbs(temps[i] - baseline));
                i++;
            }
            event.endIndex = i - 1;
            event.maxAmplitude = maxAmp;

            if (maxAmp > 10) {
                event.type = "爆破干扰";
            } else if (maxAmp > 5) {
                event.type = "通风干扰";
            } else {
                event.type = "其他干扰";
            }

            events.push_back(event);
        } else {
            i++;
        }
    }

    return events;
}

QVector<double> TimeSeriesAnalyzer::fftAnalysis(const QVector<double>& data)
{
    int n = data.size();
    if (n < 2) {
        return QVector<double>();
    }

    fftw_complex* in = (fftw_complex*)fftw_malloc(sizeof(fftw_complex) * n);
    fftw_complex* out = (fftw_complex*)fftw_malloc(sizeof(fftw_complex) * n);

    for (int i = 0; i < n; ++i) {
        in[i][0] = data[i];
        in[i][1] = 0;
    }

    fftw_plan plan = fftw_plan_dft_1d(n, in, out, FFTW_FORWARD, FFTW_ESTIMATE);
    fftw_execute(plan);

    QVector<double> magnitudes(n / 2);
    for (int i = 0; i < n / 2; ++i) {
        magnitudes[i] = sqrt(out[i][0] * out[i][0] + out[i][1] * out[i][1]);
    }

    fftw_destroy_plan(plan);
    fftw_free(in);
    fftw_free(out);

    return magnitudes;
}

double TimeSeriesAnalyzer::linearRegressionSlope(const QVector<double>& x, const QVector<double>& y)
{
    int n = x.size();
    if (n < 2) return 0;

    double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (int i = 0; i < n; ++i) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
    }

    double denominator = (n * sumX2 - sumX * sumX);
    if (qAbs(denominator) < 1e-10) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
}

double TimeSeriesAnalyzer::robustRegressionSlope(const QVector<double>& x, const QVector<double>& y,
                                                 const QVector<bool>& mask)
{
    QVector<double> xClean, yClean;
    for (int i = 0; i < x.size(); ++i) {
        if (i < mask.size() && !mask[i]) {
            xClean.push_back(x[i]);
            yClean.push_back(y[i]);
        }
    }

    if (xClean.size() < 4) {
        return linearRegressionSlope(x, y);
    }

    double medianSlope = linearRegressionSlope(xClean, yClean);

    QVector<double> residuals;
    for (int i = 0; i < xClean.size(); ++i) {
        double predicted = medianSlope * xClean[i] + 
            (yClean[0] - medianSlope * xClean[0]);
        residuals.push_back(qAbs(yClean[i] - predicted));
    }

    std::sort(residuals.begin(), residuals.end());
    double medianResidual = residuals[residuals.size() / 2];
    double threshold = 3.0 * (1.4826 * medianResidual + 1e-10);

    QVector<double> xRobust, yRobust;
    for (int i = 0; i < xClean.size(); ++i) {
        double predicted = medianSlope * xClean[i] + 
            (yClean[0] - medianSlope * xClean[0]);
        if (qAbs(yClean[i] - predicted) <= threshold) {
            xRobust.push_back(xClean[i]);
            yRobust.push_back(yClean[i]);
        }
    }

    if (xRobust.size() >= 4) {
        return linearRegressionSlope(xRobust, yRobust);
    }

    return medianSlope;
}

QVector<double> TimeSeriesAnalyzer::smoothData(const QVector<double>& data)
{
    int n = data.size();
    if (n < m_smoothingWindow) {
        return data;
    }

    QVector<double> smoothed(n);
    int halfWindow = m_smoothingWindow / 2;

    for (int i = 0; i < n; ++i) {
        double sum = 0;
        int count = 0;

        for (int j = std::max(0, i - halfWindow); j <= std::min(n - 1, i + halfWindow); ++j) {
            sum += data[j];
            count++;
        }

        smoothed[i] = sum / count;
    }

    return smoothed;
}

QVector<double> TimeSeriesAnalyzer::medianFilter(const QVector<double>& data, int windowSize)
{
    int n = data.size();
    if (n < windowSize) return data;

    QVector<double> result(n);
    int half = windowSize / 2;

    for (int i = 0; i < n; ++i) {
        QVector<double> window;
        for (int j = std::max(0, i - half); j <= std::min(n - 1, i + half); ++j) {
            window.push_back(data[j]);
        }
        std::sort(window.begin(), window.end());
        result[i] = window[window.size() / 2];
    }

    return result;
}

QVector<bool> TimeSeriesAnalyzer::detectSpikes(const QVector<double>& data, 
                                               const QVector<double>& timestamps)
{
    int n = data.size();
    QVector<bool> isSpike(n, false);

    if (n < 5) return isSpike;

    QVector<double> medianFiltered = medianFilter(data, m_medianWindow);

    QVector<double> diffs(n, 0);
    for (int i = 1; i < n; ++i) {
        double dt = timestamps[i] - timestamps[i-1];
        if (dt > 0) {
            diffs[i] = (data[i] - data[i-1]) / dt * 60.0;
        }
    }

    QVector<double> absDiffs = diffs;
    for (double& d : absDiffs) d = qAbs(d);
    std::sort(absDiffs.begin(), absDiffs.end());
    double medianDiff = absDiffs[absDiffs.size() / 2];
    double madThreshold = 5.0 * (1.4826 * medianDiff + 0.1);

    for (int i = 1; i < n; ++i) {
        if (qAbs(diffs[i]) > m_spikeThreshold || 
            qAbs(data[i] - medianFiltered[i]) > m_spikeThreshold * 0.5) {
            isSpike[i] = true;
            if (i > 0) isSpike[i-1] = true;
            if (i < n-1) isSpike[i+1] = true;
        }
    }

    for (int i = 2; i < n - 2; ++i) {
        if (isSpike[i]) {
            double localMean = 0;
            int count = 0;
            for (int j = i - 5; j <= i + 5; ++j) {
                if (j >= 0 && j < n && !isSpike[j]) {
                    localMean += data[j];
                    count++;
                }
            }
            if (count > 0) {
                localMean /= count;
                if (qAbs(data[i] - localMean) > m_spikeThreshold) {
                    isSpike[i] = true;
                }
            }
        }
    }

    return isSpike;
}

QVector<double> TimeSeriesAnalyzer::interpolateSpikes(const QVector<double>& data, 
                                                      const QVector<bool>& isSpike)
{
    int n = data.size();
    QVector<double> result = data;

    for (int i = 0; i < n; ++i) {
        if (isSpike[i]) {
            int leftValid = -1;
            int rightValid = -1;

            for (int j = i - 1; j >= 0; --j) {
                if (!isSpike[j]) {
                    leftValid = j;
                    break;
                }
            }

            for (int j = i + 1; j < n; ++j) {
                if (!isSpike[j]) {
                    rightValid = j;
                    break;
                }
            }

            if (leftValid >= 0 && rightValid >= 0) {
                double t = (double)(i - leftValid) / (rightValid - leftValid);
                result[i] = data[leftValid] * (1 - t) + data[rightValid] * t;
            } else if (leftValid >= 0) {
                result[i] = data[leftValid];
            } else if (rightValid >= 0) {
                result[i] = data[rightValid];
            }
        }
    }

    return result;
}
