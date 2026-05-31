#ifndef TEMPERATUREFRAME_H
#define TEMPERATUREFRAME_H

#include <opencv2/core.hpp>
#include <QDateTime>
#include <QString>

class TemperatureFrame {
public:
    TemperatureFrame();
    TemperatureFrame(const cv::Mat& thermalData, const QDateTime& timestamp,
                     const QString& filePath = QString());

    cv::Mat thermalData() const;
    void setThermalData(const cv::Mat& data);

    QDateTime timestamp() const;
    void setTimestamp(const QDateTime& t);

    QString filePath() const;
    void setFilePath(const QString& path);

    cv::Mat pseudoColorMap() const;
    void setPseudoColorMap(const cv::Mat& map);

    double getTemperatureAt(int x, int y) const;
    double minTemperature() const;
    double maxTemperature() const;
    double meanTemperature() const;

    int width() const;
    int height() const;

    cv::Mat gradientX() const;
    cv::Mat gradientY() const;
    void setGradients(const cv::Mat& gradX, const cv::Mat& gradY);

private:
    cv::Mat m_thermalData;
    cv::Mat m_pseudoColorMap;
    cv::Mat m_gradientX;
    cv::Mat m_gradientY;
    QDateTime m_timestamp;
    QString m_filePath;

    mutable double m_minTemp;
    mutable double m_maxTemp;
    mutable double m_meanTemp;
    mutable bool m_statsValid;

    void updateStats() const;
};

#endif
