#include "utils/ColorMap.h"
#include <cmath>
#include <algorithm>

ColorMap::ColorMap() {
    buildJet();
}

ColorMap& ColorMap::instance() {
    static ColorMap inst;
    return inst;
}

void ColorMap::setType(Type type) {
    if (m_type == type) return;
    m_type = type;
    switch (type) {
        case Jet:      buildJet(); break;
        case Viridis:  buildViridis(); break;
        case Hot:      buildHot(); break;
        case Cool:     buildCool(); break;
        case Rainbow:  buildRainbow(); break;
        case Parula:   buildParula(); break;
        case Gray:     buildGray(); break;
    }
}

ColorMap::Type ColorMap::type() const { return m_type; }

QColor ColorMap::color(double value, double minVal, double maxVal) const {
    if (maxVal <= minVal) return m_colormap.front();
    double norm = (value - minVal) / (maxVal - minVal);
    norm = std::clamp(norm, 0.0, 1.0);
    int idx = static_cast<int>(norm * (MAP_SIZE - 1));
    idx = std::clamp(idx, 0, MAP_SIZE - 1);
    return m_colormap[static_cast<size_t>(idx)];
}

cv::Mat ColorMap::applyColorMap(const cv::Mat& grayscale, double minVal, double maxVal) const {
    cv::Mat result(grayscale.size(), CV_8UC3);
    for (int y = 0; y < grayscale.rows; ++y) {
        for (int x = 0; x < grayscale.cols; ++x) {
            double val = grayscale.at<double>(y, x);
            QColor c = color(val, minVal, maxVal);
            result.at<cv::Vec3b>(y, x) = cv::Vec3b(c.blue(), c.green(), c.red());
        }
    }
    return result;
}

cv::Mat ColorMap::applyColorMask(const cv::Mat& original, const cv::Mat& data,
                                  double minVal, double maxVal, double alpha) const {
    cv::Mat result;
    if (original.channels() == 1) {
        cv::cvtColor(original, result, cv::COLOR_GRAY2BGR);
    } else {
        result = original.clone();
    }
    result.convertTo(result, CV_64FC3);

    for (int y = 0; y < data.rows; ++y) {
        for (int x = 0; x < data.cols; ++x) {
            double val = data.at<double>(y, x);
            QColor c = color(val, minVal, maxVal);
            cv::Vec3d& pixel = result.at<cv::Vec3d>(y, x);
            pixel[0] = pixel[0] * (1.0 - alpha) + c.blue() * alpha;
            pixel[1] = pixel[1] * (1.0 - alpha) + c.green() * alpha;
            pixel[2] = pixel[2] * (1.0 - alpha) + c.red() * alpha;
        }
    }
    result.convertTo(result, CV_8UC3);
    return result;
}

QColor ColorMap::colorAtPosition(double position) const {
    int idx = static_cast<int>(std::clamp(position, 0.0, 1.0) * (MAP_SIZE - 1));
    return m_colormap[static_cast<size_t>(idx)];
}

void ColorMap::buildJet() {
    m_colormap.clear();
    for (int i = 0; i < MAP_SIZE; ++i) {
        double t = static_cast<double>(i) / (MAP_SIZE - 1);
        double r, g, b;
        if (t < 0.125) { r = 0; g = 0; b = 0.5 + 4 * t; }
        else if (t < 0.375) { r = 0; g = 4 * t - 0.5; b = 1; }
        else if (t < 0.625) { r = 4 * t - 1.5; g = 1; b = 1.5 - 4 * t; }
        else if (t < 0.875) { r = 1; g = 2.5 - 4 * t; b = 0; }
        else { r = 2.5 - 4 * t; g = 0; b = 0; }
        m_colormap.emplace_back(
            static_cast<int>(std::clamp(r, 0.0, 1.0) * 255),
            static_cast<int>(std::clamp(g, 0.0, 1.0) * 255),
            static_cast<int>(std::clamp(b, 0.0, 1.0) * 255));
    }
    m_type = Jet;
}

void ColorMap::buildViridis() {
    m_colormap.clear();
    struct RGB { double r, g, b; };
    static const RGB stops[] = {
        {0.267, 0.004, 0.329},
        {0.282, 0.140, 0.457},
        {0.253, 0.265, 0.529},
        {0.206, 0.371, 0.553},
        {0.163, 0.471, 0.558},
        {0.127, 0.566, 0.550},
        {0.190, 0.658, 0.517},
        {0.477, 0.821, 0.318},
        {0.741, 0.873, 0.150},
        {0.993, 0.906, 0.144}
    };
    int nStops = sizeof(stops) / sizeof(stops[0]);
    for (int i = 0; i < MAP_SIZE; ++i) {
        double t = static_cast<double>(i) / (MAP_SIZE - 1) * (nStops - 1);
        int idx = static_cast<int>(t);
        double frac = t - idx;
        int idx2 = std::min(idx + 1, nStops - 1);
        double r = stops[idx].r + (stops[idx2].r - stops[idx].r) * frac;
        double g = stops[idx].g + (stops[idx2].g - stops[idx].g) * frac;
        double b = stops[idx].b + (stops[idx2].b - stops[idx].b) * frac;
        m_colormap.emplace_back(
            static_cast<int>(std::clamp(r, 0.0, 1.0) * 255),
            static_cast<int>(std::clamp(g, 0.0, 1.0) * 255),
            static_cast<int>(std::clamp(b, 0.0, 1.0) * 255));
    }
    m_type = Viridis;
}

void ColorMap::buildHot() {
    m_colormap.clear();
    for (int i = 0; i < MAP_SIZE; ++i) {
        double t = static_cast<double>(i) / (MAP_SIZE - 1);
        double r = std::min(1.0, t / 0.33);
        double g = std::max(0.0, std::min(1.0, (t - 0.33) / 0.33));
        double b = std::max(0.0, std::min(1.0, (t - 0.66) / 0.34));
        m_colormap.emplace_back(
            static_cast<int>(r * 255),
            static_cast<int>(g * 255),
            static_cast<int>(b * 255));
    }
    m_type = Hot;
}

void ColorMap::buildCool() {
    m_colormap.clear();
    for (int i = 0; i < MAP_SIZE; ++i) {
        double t = static_cast<double>(i) / (MAP_SIZE - 1);
        m_colormap.emplace_back(
            static_cast<int>(t * 255),
            static_cast<int>((1.0 - t) * 255),
            255);
    }
    m_type = Cool;
}

void ColorMap::buildRainbow() {
    m_colormap.clear();
    for (int i = 0; i < MAP_SIZE; ++i) {
        double t = static_cast<double>(i) / (MAP_SIZE - 1);
        double r = 0, g = 0, b = 0;
        if (t < 0.2) { r = 1; g = t / 0.2; b = 0; }
        else if (t < 0.4) { r = 1 - (t - 0.2) / 0.2; g = 1; b = 0; }
        else if (t < 0.6) { r = 0; g = 1; b = (t - 0.4) / 0.2; }
        else if (t < 0.8) { r = 0; g = 1 - (t - 0.6) / 0.2; b = 1; }
        else { r = (t - 0.8) / 0.2; g = 0; b = 1; }
        m_colormap.emplace_back(
            static_cast<int>(r * 255),
            static_cast<int>(g * 255),
            static_cast<int>(b * 255));
    }
    m_type = Rainbow;
}

void ColorMap::buildParula() {
    m_colormap.clear();
    struct RGB { double r, g, b; };
    static const RGB stops[] = {
        {0.208, 0.166, 0.529},
        {0.059, 0.354, 0.866},
        {0.078, 0.506, 0.835},
        {0.023, 0.678, 0.502},
        {0.628, 0.742, 0.216},
        {0.988, 0.734, 0.255},
        {0.976, 0.984, 0.082}
    };
    int nStops = sizeof(stops) / sizeof(stops[0]);
    for (int i = 0; i < MAP_SIZE; ++i) {
        double t = static_cast<double>(i) / (MAP_SIZE - 1) * (nStops - 1);
        int idx = static_cast<int>(t);
        double frac = t - idx;
        int idx2 = std::min(idx + 1, nStops - 1);
        double r = stops[idx].r + (stops[idx2].r - stops[idx].r) * frac;
        double g = stops[idx].g + (stops[idx2].g - stops[idx].g) * frac;
        double b = stops[idx].b + (stops[idx2].b - stops[idx].b) * frac;
        m_colormap.emplace_back(
            static_cast<int>(std::clamp(r, 0.0, 1.0) * 255),
            static_cast<int>(std::clamp(g, 0.0, 1.0) * 255),
            static_cast<int>(std::clamp(b, 0.0, 1.0) * 255));
    }
    m_type = Parula;
}

void ColorMap::buildGray() {
    m_colormap.clear();
    for (int i = 0; i < MAP_SIZE; ++i) {
        int v = static_cast<int>(static_cast<double>(i) / (MAP_SIZE - 1) * 255);
        m_colormap.emplace_back(v, v, v);
    }
    m_type = Gray;
}
