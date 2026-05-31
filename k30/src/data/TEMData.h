#ifndef TEMDATA_H
#define TEMDATA_H

#include <opencv2/core.hpp>
#include <QString>
#include <QVector>
#include <QPointF>

struct TEMStation {
    double x;
    double y;
    double elevation;
    QVector<double> resistivities;
    QVector<double> depths;
    QVector<double> times;
};

class TEMProfile {
public:
    TEMProfile();

    bool isValid() const;
    void clear();

    cv::Mat resistivityMatrix() const;
    void setResistivityMatrix(const cv::Mat& mat);

    QVector<double> depthAxis() const;
    void setDepthAxis(const QVector<double>& depths);

    QVector<double> stationAxis() const;
    void setStationAxis(const QVector<double>& stations);

    double minResistivity() const;
    double maxResistivity() const;

    int stationCount() const;
    int depthLevelCount() const;

    double getResistivityAt(double stationX, double depth) const;
    double getResistivityAtIndex(int stationIdx, int depthIdx) const;

    double lowResistivityThreshold() const;
    void setLowResistivityThreshold(double threshold);

    cv::Mat pseudoColorMap() const;
    void setPseudoColorMap(const cv::Mat& map);

    QString filePath() const;
    void setFilePath(const QString& path);

    QVector<TEMStation> stations() const;
    void setStations(const QVector<TEMStation>& st);

private:
    cv::Mat m_resistivityMatrix;
    QVector<double> m_depthAxis;
    QVector<double> m_stationAxis;
    QVector<TEMStation> m_stations;
    double m_lowResistivityThreshold;
    cv::Mat m_pseudoColorMap;
    QString m_filePath;
    mutable double m_minResistivity;
    mutable double m_maxResistivity;
    mutable bool m_statsValid;

    void updateStats() const;
};

#endif
