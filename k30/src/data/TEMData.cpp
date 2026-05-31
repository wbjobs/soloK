#include "TEMData.h"
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <algorithm>

TEMProfile::TEMProfile()
    : m_lowResistivityThreshold(50.0)
    , m_minResistivity(0)
    , m_maxResistivity(0)
    , m_statsValid(false)
{
}

bool TEMProfile::isValid() const
{
    return !m_resistivityMatrix.empty();
}

void TEMProfile::clear()
{
    m_resistivityMatrix.release();
    m_depthAxis.clear();
    m_stationAxis.clear();
    m_stations.clear();
    m_pseudoColorMap.release();
    m_filePath.clear();
    m_statsValid = false;
}

cv::Mat TEMProfile::resistivityMatrix() const
{
    return m_resistivityMatrix;
}

void TEMProfile::setResistivityMatrix(const cv::Mat& mat)
{
    m_resistivityMatrix = mat.clone();
    m_statsValid = false;
}

QVector<double> TEMProfile::depthAxis() const
{
    return m_depthAxis;
}

void TEMProfile::setDepthAxis(const QVector<double>& depths)
{
    m_depthAxis = depths;
}

QVector<double> TEMProfile::stationAxis() const
{
    return m_stationAxis;
}

void TEMProfile::setStationAxis(const QVector<double>& stations)
{
    m_stationAxis = stations;
}

double TEMProfile::minResistivity() const
{
    if (!m_statsValid) updateStats();
    return m_minResistivity;
}

double TEMProfile::maxResistivity() const
{
    if (!m_statsValid) updateStats();
    return m_maxResistivity;
}

int TEMProfile::stationCount() const
{
    return m_resistivityMatrix.cols;
}

int TEMProfile::depthLevelCount() const
{
    return m_resistivityMatrix.rows;
}

double TEMProfile::getResistivityAt(double stationX, double depth) const
{
    if (m_resistivityMatrix.empty() || m_stationAxis.size() < 2 || m_depthAxis.size() < 2) {
        return 0.0;
    }

    double stationIdx = 0;
    for (int i = 0; i < m_stationAxis.size() - 1; ++i) {
        if (stationX >= m_stationAxis[i] && stationX <= m_stationAxis[i + 1]) {
            double t = (stationX - m_stationAxis[i]) / (m_stationAxis[i + 1] - m_stationAxis[i]);
            stationIdx = i + t;
            break;
        }
    }

    double depthIdx = 0;
    for (int i = 0; i < m_depthAxis.size() - 1; ++i) {
        if (depth >= m_depthAxis[i] && depth <= m_depthAxis[i + 1]) {
            double t = (depth - m_depthAxis[i]) / (m_depthAxis[i + 1] - m_depthAxis[i]);
            depthIdx = i + t;
            break;
        }
    }

    int si = std::max(0, std::min((int)stationIdx, m_resistivityMatrix.cols - 2));
    int di = std::max(0, std::min((int)depthIdx, m_resistivityMatrix.rows - 2));

    double tx = stationIdx - si;
    double ty = depthIdx - di;

    double v00 = m_resistivityMatrix.at<double>(di, si);
    double v10 = m_resistivityMatrix.at<double>(di, si + 1);
    double v01 = m_resistivityMatrix.at<double>(di + 1, si);
    double v11 = m_resistivityMatrix.at<double>(di + 1, si + 1);

    return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) +
           v01 * (1 - tx) * ty + v11 * tx * ty;
}

double TEMProfile::getResistivityAtIndex(int stationIdx, int depthIdx) const
{
    if (m_resistivityMatrix.empty() ||
        stationIdx < 0 || stationIdx >= m_resistivityMatrix.cols ||
        depthIdx < 0 || depthIdx >= m_resistivityMatrix.rows) {
        return 0.0;
    }
    return m_resistivityMatrix.at<double>(depthIdx, stationIdx);
}

double TEMProfile::lowResistivityThreshold() const
{
    return m_lowResistivityThreshold;
}

void TEMProfile::setLowResistivityThreshold(double threshold)
{
    m_lowResistivityThreshold = threshold;
}

cv::Mat TEMProfile::pseudoColorMap() const
{
    return m_pseudoColorMap;
}

void TEMProfile::setPseudoColorMap(const cv::Mat& map)
{
    m_pseudoColorMap = map.clone();
}

QString TEMProfile::filePath() const
{
    return m_filePath;
}

void TEMProfile::setFilePath(const QString& path)
{
    m_filePath = path;
}

QVector<TEMStation> TEMProfile::stations() const
{
    return m_stations;
}

void TEMProfile::setStations(const QVector<TEMStation>& st)
{
    m_stations = st;
}

void TEMProfile::updateStats() const
{
    if (m_resistivityMatrix.empty()) {
        m_minResistivity = m_maxResistivity = 0;
        return;
    }

    cv::minMaxLoc(m_resistivityMatrix, &m_minResistivity, &m_maxResistivity);
    m_statsValid = true;
}
