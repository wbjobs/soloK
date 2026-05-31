#ifndef FUSIONVIEWER_H
#define FUSIONVIEWER_H

#include "../processing/CrossValidationAnalyzer.h"
#include "../data/TEMData.h"
#include <QWidget>
#include <QImage>
#include <QPoint>

class FusionViewer : public QWidget
{
    Q_OBJECT
public:
    enum DisplayMode {
        InfraredOnly,
        ResistivityOnly,
        ConfidenceMap,
        FusionOverlay
    };

    explicit FusionViewer(QWidget* parent = nullptr);

    void setInfraredData(const cv::Mat& pseudoColor);
    void setTEMData(const TEMProfile& profile);
    void setFusionResult(const FusionResult& result);

    void setDisplayMode(DisplayMode mode);
    DisplayMode displayMode() const;

    void clear();

signals:
    void pointSelected(const QPoint& point, double confidence, double temp, double resistivity);

protected:
    void paintEvent(QPaintEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mousePressEvent(QMouseEvent* event) override;
    void resizeEvent(QResizeEvent* event) override;

private:
    void updateDisplay();
    QPoint imageToWidget(const QPoint& imagePt) const;
    QPoint widgetToImage(const QPoint& widgetPt) const;

    cv::Mat m_infraredImage;
    TEMProfile m_temProfile;
    FusionResult m_fusionResult;
    DisplayMode m_displayMode;

    QImage m_displayImage;
    QPoint m_hoverPoint;
    double m_scaleFactor;
    QPoint m_offset;
};

#endif
