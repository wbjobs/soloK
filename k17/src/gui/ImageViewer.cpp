#include "gui/ImageViewer.h"
#include "utils/ColorMap.h"
#include <QPainter>
#include <QMouseEvent>
#include <QWheelEvent>
#include <QPaintEvent>

ImageViewer::ImageViewer(QWidget* parent)
    : QWidget(parent)
    , m_displayMode(Original)
    , m_colorMin(0)
    , m_colorMax(1)
    , m_overlayAlpha(0.5)
    , m_colorType(0)
    , m_zoom(1.0)
    , m_panning(false)
    , m_hasReferencePoint(false)
    , m_hasROI(false)
    , m_drawingROI(false)
{
    setMinimumSize(400, 300);
    setMouseTracking(true);
    setBackgroundRole(QPalette::Dark);
    setAutoFillBackground(true);
}

void ImageViewer::setImage(const cv::Mat& image) {
    m_originalImage = image.clone();
    updateDisplay();
    update();
}

void ImageViewer::setStrainData(const StrainCalculator::StrainResult& strain) {
    m_strain = strain;
    if (m_displayMode != Original) {
        updateDisplay();
        update();
    }
}

void ImageViewer::setPhaseMap(const cv::Mat& phase) {
    m_phaseMap = phase.clone();
}

void ImageViewer::setDICResult(const cv::Mat& dispX, const cv::Mat& dispY, const cv::Mat& correlation) {
    m_dicDispX = dispX.clone();
    m_dicDispY = dispY.clone();
    m_dicCorrelation = correlation.clone();
    updateDisplay();
    update();
}

void ImageViewer::setFusedResult(const cv::Mat& fusedX, const cv::Mat& fusedY,
                                 const cv::Mat& fusedMag,
                                 const cv::Mat& intWeight, const cv::Mat& dicWeight) {
    m_fusedDispX = fusedX.clone();
    m_fusedDispY = fusedY.clone();
    m_fusedMagnitude = fusedMag.clone();
    m_interferometryWeight = intWeight.clone();
    m_dicWeight = dicWeight.clone();
    updateDisplay();
    update();
}

void ImageViewer::setDisplayMode(DisplayMode mode) {
    m_displayMode = mode;
    cv::Mat data = getCurrentDataMap();
    if (!data.empty()) {
        double minVal, maxVal;
        cv::minMaxLoc(data, &minVal, &maxVal);
        if (m_colorMin == m_colorMax || m_colorMin == 0 && m_colorMax == 1) {
            m_colorMin = minVal;
            m_colorMax = maxVal;
        }
    }
    updateDisplay();
    update();
}

ImageViewer::DisplayMode ImageViewer::displayMode() const { return m_displayMode; }

void ImageViewer::setColorRange(double minVal, double maxVal) {
    m_colorMin = minVal;
    m_colorMax = maxVal;
    updateDisplay();
    update();
}

void ImageViewer::setColorType(int type) {
    m_colorType = type;
    ColorMap::instance().setType(static_cast<ColorMap::Type>(type));
    updateDisplay();
    update();
}

void ImageViewer::setOverlayAlpha(double alpha) {
    m_overlayAlpha = alpha;
    updateDisplay();
    update();
}

void ImageViewer::setReferencePoint(const QPoint& point) {
    m_referencePoint = point;
    m_hasReferencePoint = true;
    update();
    emit referencePointSet(point);
}

void ImageViewer::clearReferencePoint() {
    m_hasReferencePoint = false;
    update();
}

void ImageViewer::setROI(const QRect& roi) {
    m_roi = roi;
    m_hasROI = true;
    update();
}

void ImageViewer::clearROI() {
    m_hasROI = false;
    update();
}

QPoint ImageViewer::mapToImage(const QPoint& widgetPos) const {
    QRect r = imageRect();
    if (r.width() <= 0 || r.height() <= 0 || m_originalImage.empty()) return QPoint(-1, -1);
    double scaleX = static_cast<double>(m_originalImage.cols) / r.width();
    double scaleY = static_cast<double>(m_originalImage.rows) / r.height();
    int x = static_cast<int>((widgetPos.x() - r.x()) * scaleX);
    int y = static_cast<int>((widgetPos.y() - r.y()) * scaleY);
    return QPoint(x, y);
}

QPoint ImageViewer::mapFromImage(const QPoint& imagePos) const {
    QRect r = imageRect();
    if (r.width() <= 0 || r.height() <= 0 || m_originalImage.empty()) return QPoint(-1, -1);
    double scaleX = static_cast<double>(r.width()) / m_originalImage.cols;
    double scaleY = static_cast<double>(r.height()) / m_originalImage.rows;
    int x = static_cast<int>(imagePos.x() * scaleX) + r.x();
    int y = static_cast<int>(imagePos.y() * scaleY) + r.y();
    return QPoint(x, y);
}

cv::Mat ImageViewer::currentColoredImage() const {
    cv::Mat data = getCurrentDataMap();
    if (data.empty()) {
        return m_originalImage.clone();
    }
    ColorMap::instance().setType(static_cast<ColorMap::Type>(m_colorType));
    cv::Mat colored = ColorMap::instance().applyColorMap(data, m_colorMin, m_colorMax);
    cv::Mat result;
    if (m_originalImage.channels() == 1) {
        cv::cvtColor(m_originalImage, result, cv::COLOR_GRAY2BGR);
    } else {
        result = m_originalImage.clone();
    }
    cv::addWeighted(result, 1.0 - m_overlayAlpha, colored, m_overlayAlpha, 0, result);
    return result;
}

double ImageViewer::currentValueAt(const QPoint& imagePos) const {
    cv::Mat data = getCurrentDataMap();
    if (data.empty() || imagePos.x() < 0 || imagePos.y() < 0 ||
        imagePos.x() >= data.cols || imagePos.y() >= data.rows) {
        return 0.0;
    }
    return data.at<double>(imagePos.y(), imagePos.x());
}

void ImageViewer::paintEvent(QPaintEvent* event) {
    Q_UNUSED(event);
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);

    if (m_originalImage.empty()) {
        painter.setPen(Qt::gray);
        painter.setFont(QFont("Arial", 14));
        painter.drawText(rect(), Qt::AlignCenter, tr("No Image Loaded"));
        return;
    }

    QRect r = imageRect();
    if (!m_displayImage.isNull()) {
        painter.drawImage(r, m_displayImage);
    }

    if (m_hasROI) {
        QPoint tl = mapFromImage(m_roi.topLeft());
        QPoint br = mapFromImage(m_roi.bottomRight());
        painter.setPen(QPen(Qt::green, 2));
        painter.setBrush(QBrush(QColor(0, 255, 0, 40)));
        painter.drawRect(QRect(tl, br));
    }

    if (m_drawingROI) {
        QRect drawRect(m_roiStart, m_lastMousePos);
        drawRect = drawRect.normalized();
        painter.setPen(QPen(Qt::yellow, 2, Qt::DashLine));
        painter.setBrush(Qt::NoBrush);
        painter.drawRect(drawRect);
    }

    if (m_hasReferencePoint) {
        QPoint pos = mapFromImage(m_referencePoint);
        painter.setPen(QPen(Qt::red, 3));
        painter.drawEllipse(pos, 6, 6);
        painter.drawLine(pos - QPoint(10, 0), pos + QPoint(10, 0));
        painter.drawLine(pos - QPoint(0, 10), pos + QPoint(0, 10));
    }
}

void ImageViewer::mouseMoveEvent(QMouseEvent* event) {
    m_lastMousePos = event->pos();
    QPoint imgPos = mapToImage(event->pos());
    if (imgPos.x() >= 0 && imgPos.y() >= 0) {
        emit mouseMoved(imgPos, currentValueAt(imgPos));
    }
    QWidget::mouseMoveEvent(event);
}

void ImageViewer::mousePressEvent(QMouseEvent* event) {
    if (event->button() == Qt::LeftButton) {
        if (event->modifiers() & Qt::ShiftModifier) {
            m_drawingROI = true;
            m_roiStart = event->pos();
        } else if (event->modifiers() & Qt::ControlModifier) {
            QPoint imgPos = mapToImage(event->pos());
            if (imgPos.x() >= 0) setReferencePoint(imgPos);
        } else {
            m_panning = true;
            m_lastMousePos = event->pos();
        }
    }
    QWidget::mousePressEvent(event);
}

void ImageViewer::mouseReleaseEvent(QMouseEvent* event) {
    if (event->button() == Qt::LeftButton) {
        if (m_drawingROI) {
            m_drawingROI = false;
            QPoint imgStart = mapToImage(m_roiStart);
            QPoint imgEnd = mapToImage(event->pos());
            if (imgStart.x() >= 0 && imgEnd.x() >= 0) {
                QRect roi(imgStart, imgEnd);
                roi = roi.normalized();
                roi = roi.intersected(QRect(0, 0, m_originalImage.cols, m_originalImage.rows));
                if (roi.width() > 5 && roi.height() > 5) {
                    setROI(roi);
                }
            }
        }
        m_panning = false;
    }
    QWidget::mouseReleaseEvent(event);
}

void ImageViewer::wheelEvent(QWheelEvent* event) {
    double factor = (event->angleDelta().y() > 0) ? 1.15 : 1.0 / 1.15;
    m_zoom = qBound(0.1, m_zoom * factor, 10.0);
    updateDisplay();
    update();
    event->accept();
}

void ImageViewer::resizeEvent(QResizeEvent* event) {
    Q_UNUSED(event);
    updateDisplay();
}

void ImageViewer::updateDisplay() {
    if (m_originalImage.empty()) {
        m_displayImage = QImage();
        return;
    }

    cv::Mat data = getCurrentDataMap();
    cv::Mat toShow;

    if (m_displayMode == Original || data.empty()) {
        if (m_originalImage.channels() == 1) {
            cv::cvtColor(m_originalImage, toShow, cv::COLOR_GRAY2RGB);
        } else if (m_originalImage.channels() == 3) {
            cv::cvtColor(m_originalImage, toShow, cv::COLOR_BGR2RGB);
        } else {
            toShow = m_originalImage.clone();
        }
    } else {
        ColorMap::instance().setType(static_cast<ColorMap::Type>(m_colorType));
        cv::Mat colored = ColorMap::instance().applyColorMap(data, m_colorMin, m_colorMax);
        cv::Mat baseImg;
        if (m_originalImage.channels() == 1) {
            cv::cvtColor(m_originalImage, baseImg, cv::COLOR_GRAY2RGB);
        } else if (m_originalImage.channels() == 3) {
            cv::cvtColor(m_originalImage, baseImg, cv::COLOR_BGR2RGB);
        } else {
            baseImg = m_originalImage.clone();
        }
        baseImg.convertTo(baseImg, CV_8UC3);
        cv::addWeighted(baseImg, 1.0 - m_overlayAlpha, colored, m_overlayAlpha, 0, toShow);
    }

    int w = static_cast<int>(toShow.cols * m_zoom);
    int h = static_cast<int>(toShow.rows * m_zoom);

    QImage img(toShow.data, toShow.cols, toShow.rows, toShow.step, QImage::Format_RGB888);
    m_displayImage = img.scaled(w, h, Qt::KeepAspectRatio, Qt::SmoothTransformation).copy();
}

cv::Mat ImageViewer::getCurrentDataMap() const {
    switch (m_displayMode) {
        case Original: return cv::Mat();
        case PhaseMap: return m_phaseMap;
        case StrainExx: return m_strain.exx;
        case StrainEyy: return m_strain.eyy;
        case StrainExy: return m_strain.exy;
        case StrainE1: return m_strain.e1;
        case StrainE2: return m_strain.e2;
        case StrainMaxShear: return m_strain.maxShear;
        case StrainVonMises: return m_strain.vonMises;
        case PrincipalAngle: return m_strain.principalAngle;
        case DICDisplacementX: return m_dicDispX;
        case DICDisplacementY: return m_dicDispY;
        case DICCorrelation: return m_dicCorrelation;
        case FusedDisplacementX: return m_fusedDispX;
        case FusedDisplacementY: return m_fusedDispY;
        case FusedMagnitude: return m_fusedMagnitude;
        case InterferometryWeight: return m_interferometryWeight;
        case DICWeight: return m_dicWeight;
        case ElasticExx: return m_strain.elasticExx;
        case ElasticEyy: return m_strain.elasticEyy;
        case ElasticExy: return m_strain.elasticExy;
        case ElasticVonMises: return m_strain.elasticVonMises;
        case PlasticExx: return m_strain.plasticExx;
        case PlasticEyy: return m_strain.plasticEyy;
        case PlasticExy: return m_strain.plasticExy;
        case PlasticVonMises: return m_strain.plasticVonMises;
        case PlasticZone: return m_strain.plasticZone;
    }
    return cv::Mat();
}

QRect ImageViewer::imageRect() const {
    if (m_displayImage.isNull()) return QRect();
    int x = (width() - m_displayImage.width()) / 2;
    int y = (height() - m_displayImage.height()) / 2;
    return QRect(x, y, m_displayImage.width(), m_displayImage.height());
}
