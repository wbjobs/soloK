#ifndef IMAGEVIEWER_H
#define IMAGEVIEWER_H

#include <QWidget>
#include <QImage>
#include <QPixmap>
#include <QPoint>
#include <QRect>
#include <opencv2/opencv.hpp>
#include "core/StrainCalculator.h"

class ImageViewer : public QWidget {
    Q_OBJECT

public:
    enum DisplayMode {
        Original,
        PhaseMap,
        StrainExx,
        StrainEyy,
        StrainExy,
        StrainE1,
        StrainE2,
        StrainMaxShear,
        StrainVonMises,
        PrincipalAngle,
        DICDisplacementX,
        DICDisplacementY,
        DICCorrelation,
        FusedDisplacementX,
        FusedDisplacementY,
        FusedMagnitude,
        InterferometryWeight,
        DICWeight,
        ElasticExx,
        ElasticEyy,
        ElasticExy,
        ElasticVonMises,
        PlasticExx,
        PlasticEyy,
        PlasticExy,
        PlasticVonMises,
        PlasticZone
    };

    explicit ImageViewer(QWidget* parent = nullptr);

    void setImage(const cv::Mat& image);
    void setStrainData(const StrainCalculator::StrainResult& strain);
    void setPhaseMap(const cv::Mat& phase);
    void setDICResult(const cv::Mat& dispX, const cv::Mat& dispY, const cv::Mat& correlation);
    void setFusedResult(const cv::Mat& fusedX, const cv::Mat& fusedY,
                        const cv::Mat& fusedMag,
                        const cv::Mat& intWeight, const cv::Mat& dicWeight);
    void setDisplayMode(DisplayMode mode);
    DisplayMode displayMode() const;

    void setColorRange(double minVal, double maxVal);
    void setColorType(int type);
    void setOverlayAlpha(double alpha);

    void setReferencePoint(const QPoint& point);
    void clearReferencePoint();

    void setROI(const QRect& roi);
    void clearROI();

    QPoint mapToImage(const QPoint& widgetPos) const;
    QPoint mapFromImage(const QPoint& imagePos) const;

    cv::Mat currentColoredImage() const;
    double currentValueAt(const QPoint& imagePos) const;

signals:
    void mouseMoved(const QPoint& imagePos, double value);
    void referencePointSet(const QPoint& imagePos);
    void roiSet(const QRect& roiRect);

protected:
    void paintEvent(QPaintEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mousePressEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void wheelEvent(QWheelEvent* event) override;
    void resizeEvent(QResizeEvent* event) override;

private:
    void updateDisplay();
    cv::Mat getCurrentDataMap() const;
    QRect imageRect() const;

    cv::Mat m_originalImage;
    cv::Mat m_phaseMap;
    StrainCalculator::StrainResult m_strain;
    cv::Mat m_dicDispX;
    cv::Mat m_dicDispY;
    cv::Mat m_dicCorrelation;
    cv::Mat m_fusedDispX;
    cv::Mat m_fusedDispY;
    cv::Mat m_fusedMagnitude;
    cv::Mat m_interferometryWeight;
    cv::Mat m_dicWeight;
    DisplayMode m_displayMode;

    double m_colorMin;
    double m_colorMax;
    double m_overlayAlpha;
    int m_colorType;

    double m_zoom;
    QPoint m_offset;
    bool m_panning;
    QPoint m_lastMousePos;

    QPoint m_referencePoint;
    bool m_hasReferencePoint;

    QRect m_roi;
    bool m_hasROI;
    bool m_drawingROI;
    QPoint m_roiStart;

    QImage m_displayImage;
};

#endif
