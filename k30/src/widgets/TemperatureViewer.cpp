#include "TemperatureViewer.h"
#include <QPainter>
#include <QMouseEvent>
#include <QPen>
#include <QColor>
#include <QDebug>
#include <opencv2/imgproc.hpp>

TemperatureViewer::TemperatureViewer(QWidget* parent)
    : QWidget(parent)
    , m_hoverPoint(-1, -1)
    , m_selectedPoint(-1, -1)
    , m_showAnomalies(true)
    , m_scaleFactor(1.0)
{
    setMouseTracking(true);
    setMinimumSize(320, 240);
}

void TemperatureViewer::setFrame(const TemperatureFrame& frame)
{
    m_frame = frame;
    updateDisplayImage();
    update();
}

void TemperatureViewer::setAnomalies(const std::vector<AnomalyRegion>& anomalies)
{
    m_anomalies = anomalies;
    update();
}

void TemperatureViewer::clear()
{
    m_frame = TemperatureFrame();
    m_anomalies.clear();
    m_displayImage = QImage();
    m_hoverPoint = QPoint(-1, -1);
    m_selectedPoint = QPoint(-1, -1);
    update();
}

bool TemperatureViewer::showAnomalies() const
{
    return m_showAnomalies;
}

void TemperatureViewer::setShowAnomalies(bool show)
{
    m_showAnomalies = show;
    update();
}

QPoint TemperatureViewer::selectedPoint() const
{
    return m_selectedPoint;
}

void TemperatureViewer::paintEvent(QPaintEvent* event)
{
    Q_UNUSED(event);
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);

    painter.fillRect(rect(), Qt::darkGray);

    if (m_displayImage.isNull()) {
        painter.setPen(Qt::white);
        painter.drawText(rect(), Qt::AlignCenter, "请导入红外热成像数据");
        return;
    }

    painter.drawImage(m_offset, m_displayImage);

    if (m_showAnomalies) {
        painter.setPen(QPen(Qt::red, 2));
        painter.setBrush(Qt::NoBrush);
        for (const auto& anomaly : m_anomalies) {
            QRect r = anomaly.boundingRect();
            QPoint topLeft = imageToWidget(r.topLeft());
            QPoint bottomRight = imageToWidget(r.bottomRight());
            painter.drawRect(QRect(topLeft, bottomRight));

            QPoint center = imageToWidget(QPoint(r.center().x(), r.y() - 5));
            painter.setPen(Qt::red);
            painter.drawText(center, QString("%1°C").arg(anomaly.temperatureDifference(), 0, 'f', 1));
            painter.setPen(QPen(Qt::red, 2));
        }
    }

    if (m_hoverPoint.x() >= 0 && m_hoverPoint.y() >= 0) {
        QPoint widgetPt = imageToWidget(m_hoverPoint);
        painter.setPen(QPen(Qt::yellow, 1, Qt::DashLine));
        painter.setBrush(Qt::NoBrush);
        painter.drawEllipse(widgetPt, 10, 10);

        double temp = m_frame.getTemperatureAt(m_hoverPoint.x(), m_hoverPoint.y());
        QString info = QString("(%1,%2): %3°C")
            .arg(m_hoverPoint.x())
            .arg(m_hoverPoint.y())
            .arg(temp, 0, 'f', 2);

        painter.setPen(Qt::NoPen);
        painter.setBrush(QColor(0, 0, 0, 180));
        QRect textRect(widgetPt.x() + 15, widgetPt.y() - 20, 150, 20);
        painter.drawRect(textRect);

        painter.setPen(Qt::white);
        painter.drawText(textRect, Qt::AlignCenter, info);
    }

    if (m_selectedPoint.x() >= 0 && m_selectedPoint.y() >= 0) {
        QPoint widgetPt = imageToWidget(m_selectedPoint);
        painter.setPen(QPen(Qt::green, 2));
        painter.setBrush(Qt::NoBrush);
        painter.drawEllipse(widgetPt, 12, 12);
    }
}

void TemperatureViewer::mouseMoveEvent(QMouseEvent* event)
{
    if (m_displayImage.isNull()) return;

    QPoint imagePt = widgetToImage(event->pos());
    if (imagePt.x() >= 0 && imagePt.x() < m_frame.width() &&
        imagePt.y() >= 0 && imagePt.y() < m_frame.height()) {
        m_hoverPoint = imagePt;
    } else {
        m_hoverPoint = QPoint(-1, -1);
    }
    update();
}

void TemperatureViewer::mousePressEvent(QMouseEvent* event)
{
    if (m_displayImage.isNull()) return;

    QPoint imagePt = widgetToImage(event->pos());
    if (imagePt.x() >= 0 && imagePt.x() < m_frame.width() &&
        imagePt.y() >= 0 && imagePt.y() < m_frame.height()) {
        m_selectedPoint = imagePt;
        double temp = m_frame.getTemperatureAt(imagePt.x(), imagePt.y());
        emit pointSelected(imagePt, temp);
    }
    update();
}

void TemperatureViewer::resizeEvent(QResizeEvent* event)
{
    Q_UNUSED(event);
    updateDisplayImage();
}

void TemperatureViewer::updateDisplayImage()
{
    if (m_frame.thermalData().empty()) {
        m_displayImage = QImage();
        return;
    }

    cv::Mat colorMap = m_frame.pseudoColorMap();
    if (colorMap.empty()) {
        return;
    }

    cv::Mat rgb;
    cv::cvtColor(colorMap, rgb, cv::COLOR_BGR2RGB);
    QImage img(rgb.data, rgb.cols, rgb.rows, rgb.step, QImage::Format_RGB888);

    int widgetWidth = width();
    int widgetHeight = height();
    double imgAspect = (double)img.width() / img.height();
    double widgetAspect = (double)widgetWidth / widgetHeight;

    if (imgAspect > widgetAspect) {
        m_scaleFactor = (double)widgetWidth / img.width();
    } else {
        m_scaleFactor = (double)widgetHeight / img.height();
    }

    QSize scaledSize = img.size() * m_scaleFactor;
    m_displayImage = img.scaled(scaledSize, Qt::KeepAspectRatio, Qt::SmoothTransformation);

    m_offset.setX((widgetWidth - m_displayImage.width()) / 2);
    m_offset.setY((widgetHeight - m_displayImage.height()) / 2);
}

QPoint TemperatureViewer::imageToWidget(const QPoint& imagePt) const
{
    return QPoint(
        imagePt.x() * m_scaleFactor + m_offset.x(),
        imagePt.y() * m_scaleFactor + m_offset.y()
    );
}

QPoint TemperatureViewer::widgetToImage(const QPoint& widgetPt) const
{
    return QPoint(
        (widgetPt.x() - m_offset.x()) / m_scaleFactor,
        (widgetPt.y() - m_offset.y()) / m_scaleFactor
    );
}
