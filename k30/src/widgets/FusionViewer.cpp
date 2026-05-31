#include "FusionViewer.h"
#include <QPainter>
#include <QMouseEvent>
#include <QPen>
#include <QColor>
#include <opencv2/imgproc.hpp>

FusionViewer::FusionViewer(QWidget* parent)
    : QWidget(parent)
    , m_displayMode(ConfidenceMap)
    , m_hoverPoint(-1, -1)
    , m_scaleFactor(1.0)
{
    setMouseTracking(true);
    setMinimumSize(400, 300);
}

void FusionViewer::setInfraredData(const cv::Mat& pseudoColor)
{
    m_infraredImage = pseudoColor.clone();
    updateDisplay();
    update();
}

void FusionViewer::setTEMData(const TEMProfile& profile)
{
    m_temProfile = profile;
    updateDisplay();
    update();
}

void FusionViewer::setFusionResult(const FusionResult& result)
{
    m_fusionResult = result;
    updateDisplay();
    update();
}

void FusionViewer::setDisplayMode(DisplayMode mode)
{
    m_displayMode = mode;
    updateDisplay();
    update();
}

FusionViewer::DisplayMode FusionViewer::displayMode() const
{
    return m_displayMode;
}

void FusionViewer::clear()
{
    m_infraredImage.release();
    m_fusionResult = FusionResult();
    m_displayImage = QImage();
    m_hoverPoint = QPoint(-1, -1);
    update();
}

void FusionViewer::paintEvent(QPaintEvent* event)
{
    Q_UNUSED(event);
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);

    painter.fillRect(rect(), Qt::darkGray);

    if (m_displayImage.isNull()) {
        painter.setPen(Qt::white);
        painter.drawText(rect(), Qt::AlignCenter, "请导入数据并进行融合分析");
        return;
    }

    painter.drawImage(m_offset, m_displayImage);

    painter.setPen(QPen(Qt::white, 1, Qt::DashLine));
    painter.setBrush(Qt::NoBrush);
    if (!m_fusionResult.fusedAnomalies.empty()) {
        for (const auto& anomaly : m_fusionResult.fusedAnomalies) {
            QRect r = anomaly.boundingRect();
            QPoint topLeft = imageToWidget(r.topLeft());
            QPoint bottomRight = imageToWidget(r.bottomRight());
            painter.drawRect(QRect(topLeft, bottomRight));
        }
    }

    if (m_hoverPoint.x() >= 0 && m_hoverPoint.y() >= 0) {
        QPoint widgetPt = imageToWidget(m_hoverPoint);
        painter.setPen(QPen(Qt::yellow, 1, Qt::DashLine));
        painter.setBrush(Qt::NoBrush);
        painter.drawEllipse(widgetPt, 10, 10);

        double conf = 0, temp = 0, res = 0;
        if (!m_fusionResult.confidenceMap.empty()) {
            int x = std::max(0, std::min(m_hoverPoint.x(), m_fusionResult.confidenceMap.cols - 1));
            int y = std::max(0, std::min(m_hoverPoint.y(), m_fusionResult.confidenceMap.rows - 1));
            conf = m_fusionResult.confidenceMap.at<double>(y, x) * 100;
        }

        QString info = QString("(%1,%2) 置信度:%3%")
            .arg(m_hoverPoint.x())
            .arg(m_hoverPoint.y())
            .arg(conf, 0, 'f', 1);

        painter.setPen(Qt::NoPen);
        painter.setBrush(QColor(0, 0, 0, 180));
        QRect textRect(widgetPt.x() + 15, widgetPt.y() - 20, 150, 20);
        painter.drawRect(textRect);

        painter.setPen(Qt::white);
        painter.drawText(textRect, Qt::AlignCenter, info);
    }
}

void FusionViewer::mouseMoveEvent(QMouseEvent* event)
{
    if (m_displayImage.isNull()) return;

    QPoint imagePt = widgetToImage(event->pos());
    int imgWidth = m_displayImage.width() / m_scaleFactor;
    int imgHeight = m_displayImage.height() / m_scaleFactor;

    if (imagePt.x() >= 0 && imagePt.x() < imgWidth &&
        imagePt.y() >= 0 && imagePt.y() < imgHeight) {
        m_hoverPoint = imagePt;
    } else {
        m_hoverPoint = QPoint(-1, -1);
    }
    update();
}

void FusionViewer::mousePressEvent(QMouseEvent* event)
{
    if (m_displayImage.isNull()) return;

    QPoint imagePt = widgetToImage(event->pos());
    int imgWidth = m_displayImage.width() / m_scaleFactor;
    int imgHeight = m_displayImage.height() / m_scaleFactor;

    if (imagePt.x() >= 0 && imagePt.x() < imgWidth &&
        imagePt.y() >= 0 && imagePt.y() < imgHeight) {
        double conf = 0, temp = 0, res = 0;
        if (!m_fusionResult.confidenceMap.empty()) {
            int x = std::max(0, std::min(imagePt.x(), m_fusionResult.confidenceMap.cols - 1));
            int y = std::max(0, std::min(imagePt.y(), m_fusionResult.confidenceMap.rows - 1));
            conf = m_fusionResult.confidenceMap.at<double>(y, x);
        }
        emit pointSelected(imagePt, conf, temp, res);
    }
}

void FusionViewer::resizeEvent(QResizeEvent* event)
{
    Q_UNUSED(event);
    updateDisplay();
}

void FusionViewer::updateDisplay()
{
    cv::Mat sourceMat;

    switch (m_displayMode) {
    case InfraredOnly:
        if (!m_infraredImage.empty()) {
            sourceMat = m_infraredImage;
        }
        break;
    case ResistivityOnly:
        if (m_temProfile.isValid()) {
            sourceMat = m_temProfile.pseudoColorMap();
        }
        break;
    case ConfidenceMap:
        if (!m_fusionResult.colorConfidenceMap.empty()) {
            sourceMat = m_fusionResult.colorConfidenceMap;
        }
        break;
    case FusionOverlay:
        if (!m_fusionResult.colorConfidenceMap.empty() && !m_infraredImage.empty()) {
            cv::Mat resizedIR, resizedConf;
            cv::resize(m_infraredImage, resizedIR, m_fusionResult.colorConfidenceMap.size());
            cv::addWeighted(resizedIR, 0.5, m_fusionResult.colorConfidenceMap, 0.5, 0, sourceMat);
        }
        break;
    }

    if (sourceMat.empty()) {
        m_displayImage = QImage();
        return;
    }

    cv::Mat rgb;
    if (sourceMat.channels() == 3) {
        cv::cvtColor(sourceMat, rgb, cv::COLOR_BGR2RGB);
    } else {
        rgb = sourceMat.clone();
    }

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

QPoint FusionViewer::imageToWidget(const QPoint& imagePt) const
{
    return QPoint(
        imagePt.x() * m_scaleFactor + m_offset.x(),
        imagePt.y() * m_scaleFactor + m_offset.y()
    );
}

QPoint FusionViewer::widgetToImage(const QPoint& widgetPt) const
{
    return QPoint(
        (widgetPt.x() - m_offset.x()) / m_scaleFactor,
        (widgetPt.y() - m_offset.y()) / m_scaleFactor
    );
}
