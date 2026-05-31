#ifndef TEMPERATUREVIEWER_H
#define TEMPERATUREVIEWER_H

#include "../data/TemperatureFrame.h"
#include "../data/AnomalyRegion.h"
#include <QWidget>
#include <QImage>
#include <QPoint>
#include <vector>

class TemperatureViewer : public QWidget
{
    Q_OBJECT
public:
    explicit TemperatureViewer(QWidget* parent = nullptr);

    void setFrame(const TemperatureFrame& frame);
    void setAnomalies(const std::vector<AnomalyRegion>& anomalies);
    void clear();

    bool showAnomalies() const;
    void setShowAnomalies(bool show);

    QPoint selectedPoint() const;

signals:
    void pointSelected(const QPoint& point, double temperature);

protected:
    void paintEvent(QPaintEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mousePressEvent(QMouseEvent* event) override;
    void resizeEvent(QResizeEvent* event) override;

private:
    void updateDisplayImage();
    QPoint imageToWidget(const QPoint& imagePt) const;
    QPoint widgetToImage(const QPoint& widgetPt) const;

    TemperatureFrame m_frame;
    std::vector<AnomalyRegion> m_anomalies;
    QImage m_displayImage;
    QPoint m_hoverPoint;
    QPoint m_selectedPoint;
    bool m_showAnomalies;
    double m_scaleFactor;
    QPoint m_offset;
};

#endif
