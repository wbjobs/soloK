#ifndef COLORMAP_H
#define COLORMAP_H

#include <opencv2/opencv.hpp>
#include <QColor>
#include <vector>

class ColorMap {
public:
    enum Type {
        Jet,
        Viridis,
        Hot,
        Cool,
        Rainbow,
        Parula,
        Gray
    };

    static ColorMap& instance();

    void setType(Type type);
    Type type() const;

    QColor color(double value, double minVal, double maxVal) const;
    cv::Mat applyColorMap(const cv::Mat& grayscale, double minVal, double maxVal) const;
    cv::Mat applyColorMask(const cv::Mat& original, const cv::Mat& data,
                           double minVal, double maxVal, double alpha = 0.5) const;

    QColor colorAtPosition(double position) const;

private:
    ColorMap();
    void buildJet();
    void buildViridis();
    void buildHot();
    void buildCool();
    void buildRainbow();
    void buildParula();
    void buildGray();

    Type m_type;
    std::vector<QColor> m_colormap;
    static constexpr int MAP_SIZE = 256;
};

#endif
