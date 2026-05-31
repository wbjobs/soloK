#include "TemperatureFrame.h"
#include <opencv2/imgproc.hpp>

TemperatureFrame::TemperatureFrame()
    : m_minTemp(0), m_maxTemp(0), m_meanTemp(0), m_statsValid(false)
{
}

TemperatureFrame::TemperatureFrame(const cv::Mat& thermalData, const QDateTime& timestamp,
                                   const QString& filePath)
    : m_thermalData(thermalData.clone())
    , m_timestamp(timestamp)
    , m_filePath(filePath)
    , m_minTemp(0), m_maxTemp(0), m_meanTemp(0), m_statsValid(false)
{
}

cv::Mat TemperatureFrame::thermalData() const
{
    return m_thermalData;
}

void TemperatureFrame::setThermalData(const cv::Mat& data)
{
    m_thermalData = data.clone();
    m_statsValid = false;
}

QDateTime TemperatureFrame::timestamp() const
{
    return m_timestamp;
}

void TemperatureFrame::setTimestamp(const QDateTime& t)
{
    m_timestamp = t;
}

QString TemperatureFrame::filePath() const
{
    return m_filePath;
}

void TemperatureFrame::setFilePath(const QString& path)
{
    m_filePath = path;
}

cv::Mat TemperatureFrame::pseudoColorMap() const
{
    return m_pseudoColorMap;
}

void TemperatureFrame::setPseudoColorMap(const cv::Mat& map)
{
    m_pseudoColorMap = map.clone();
}

double TemperatureFrame::getTemperatureAt(int x, int y) const
{
    if (m_thermalData.empty() || x < 0 || y < 0 ||
        x >= m_thermalData.cols || y >= m_thermalData.rows) {
        return 0.0;
    }
    return m_thermalData.at<double>(y, x);
}

double TemperatureFrame::minTemperature() const
{
    if (!m_statsValid) updateStats();
    return m_minTemp;
}

double TemperatureFrame::maxTemperature() const
{
    if (!m_statsValid) updateStats();
    return m_maxTemp;
}

double TemperatureFrame::meanTemperature() const
{
    if (!m_statsValid) updateStats();
    return m_meanTemp;
}

int TemperatureFrame::width() const
{
    return m_thermalData.cols;
}

int TemperatureFrame::height() const
{
    return m_thermalData.rows;
}

cv::Mat TemperatureFrame::gradientX() const
{
    return m_gradientX;
}

cv::Mat TemperatureFrame::gradientY() const
{
    return m_gradientY;
}

void TemperatureFrame::setGradients(const cv::Mat& gradX, const cv::Mat& gradY)
{
    m_gradientX = gradX.clone();
    m_gradientY = gradY.clone();
}

void TemperatureFrame::updateStats() const
{
    if (m_thermalData.empty()) {
        m_minTemp = m_maxTemp = m_meanTemp = 0;
        return;
    }

    cv::minMaxLoc(m_thermalData, &m_minTemp, &m_maxTemp);
    cv::Scalar mean = cv::mean(m_thermalData);
    m_meanTemp = mean[0];
    m_statsValid = true;
}
