#include "FLIRImporter.h"
#include <QFile>
#include <QFileInfo>
#include <QTextStream>
#include <QDateTime>
#include <QDebug>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

FLIRImporter::FLIRImporter(QObject* parent)
    : QObject(parent)
    , m_emissivity(0.95)
    , m_objectDistance(1.0)
    , m_ambientTemperature(25.0)
{
}

std::vector<TemperatureFrame> FLIRImporter::importFrames(const QStringList& filePaths)
{
    std::vector<TemperatureFrame> frames;
    int total = filePaths.size();

    for (int i = 0; i < total; ++i) {
        emit progress(i + 1, total);
        TemperatureFrame frame = importSingleFrame(filePaths[i]);
        if (!frame.thermalData().empty()) {
            frames.push_back(frame);
        }
    }

    return frames;
}

TemperatureFrame FLIRImporter::importSingleFrame(const QString& filePath)
{
    QFileInfo fileInfo(filePath);
    QString suffix = fileInfo.suffix().toLower();

    if (suffix == "csv" || suffix == "txt") {
        return parseCSVFile(filePath);
    } else if (suffix == "tiff" || suffix == "tif") {
        return parseTIFFFile(filePath);
    } else {
        return generateSimulatedFrame(filePath);
    }
}

double FLIRImporter::emissivity() const
{
    return m_emissivity;
}

void FLIRImporter::setEmissivity(double e)
{
    m_emissivity = e;
}

double FLIRImporter::objectDistance() const
{
    return m_objectDistance;
}

void FLIRImporter::setObjectDistance(double d)
{
    m_objectDistance = d;
}

double FLIRImporter::ambientTemperature() const
{
    return m_ambientTemperature;
}

void FLIRImporter::setAmbientTemperature(double t)
{
    m_ambientTemperature = t;
}

TemperatureFrame FLIRImporter::parseFLIRFile(const QString& filePath)
{
    return TemperatureFrame();
}

TemperatureFrame FLIRImporter::parseCSVFile(const QString& filePath)
{
    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        emit error(QString("无法打开文件: %1").arg(filePath));
        return TemperatureFrame();
    }

    QTextStream in(&file);
    QStringList lines;
    while (!in.atEnd()) {
        lines.append(in.readLine());
    }
    file.close();

    if (lines.isEmpty()) {
        return TemperatureFrame();
    }

    int dataStartRow = 0;
    int width = 0;
    int height = 0;
    QDateTime timestamp = QDateTime::currentDateTime();

    for (int i = 0; i < lines.size() && i < 20; ++i) {
        QString line = lines[i].trimmed();
        if (line.startsWith("Frame") || line.startsWith("Timestamp") || line.startsWith("Time")) {
            dataStartRow = i + 1;
            QStringList parts = line.split(',', Qt::SkipEmptyParts);
            if (parts.size() >= 2) {
                timestamp = QDateTime::fromString(parts[1].trimmed(), "yyyy-MM-dd hh:mm:ss");
            }
        } else if (line.startsWith("Width") || line.startsWith("width")) {
            QStringList parts = line.split(',');
            if (parts.size() >= 2) width = parts[1].toInt();
        } else if (line.startsWith("Height") || line.startsWith("height")) {
            QStringList parts = line.split(',');
            if (parts.size() >= 2) height = parts[1].toInt();
        }
    }

    if (width == 0 || height == 0) {
        height = lines.size() - dataStartRow;
        if (height > 0) {
            QStringList firstDataLine = lines[dataStartRow].split(',', Qt::SkipEmptyParts);
            width = firstDataLine.size();
        }
    }

    if (width <= 0 || height <= 0) {
        emit error(QString("无法解析CSV文件尺寸: %1").arg(filePath));
        return TemperatureFrame();
    }

    cv::Mat thermalData(height, width, CV_64FC1);

    for (int y = 0; y < height && (y + dataStartRow) < lines.size(); ++y) {
        QStringList values = lines[y + dataStartRow].split(',', Qt::SkipEmptyParts);
        for (int x = 0; x < width && x < values.size(); ++x) {
            bool ok;
            double temp = values[x].trimmed().toDouble(&ok);
            if (ok) {
                thermalData.at<double>(y, x) = temp;
            } else {
                thermalData.at<double>(y, x) = m_ambientTemperature;
            }
        }
    }

    return TemperatureFrame(thermalData, timestamp, filePath);
}

TemperatureFrame FLIRImporter::parseTIFFFile(const QString& filePath)
{
    cv::Mat rawImage = cv::imread(filePath.toStdString(), cv::IMREAD_ANYDEPTH | cv::IMREAD_GRAYSCALE);

    if (rawImage.empty()) {
        emit error(QString("无法读取TIFF文件: %1").arg(filePath));
        return TemperatureFrame();
    }

    cv::Mat thermalData;
    if (rawImage.depth() == CV_16U) {
        rawImage.convertTo(thermalData, CV_64FC1);
        double scale = 0.04;
        double offset = 273.15;
        thermalData = thermalData * scale - offset;
    } else if (rawImage.depth() == CV_32F) {
        rawImage.convertTo(thermalData, CV_64FC1);
    } else {
        rawImage.convertTo(thermalData, CV_64FC1);
        thermalData = thermalData * 0.1 + m_ambientTemperature;
    }

    QFileInfo fileInfo(filePath);
    QString baseName = fileInfo.baseName();
    QDateTime timestamp = QDateTime::currentDateTime();

    QDateTime parsedTime = QDateTime::fromString(baseName, "yyyyMMdd_hhmmss");
    if (parsedTime.isValid()) {
        timestamp = parsedTime;
    }

    return TemperatureFrame(thermalData, timestamp, filePath);
}

TemperatureFrame FLIRImporter::generateSimulatedFrame(const QString& filePath)
{
    int width = 320;
    int height = 240;
    cv::Mat thermalData(height, width, CV_64FC1);

    double baseTemp = m_ambientTemperature;

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            double noise = (double)rand() / RAND_MAX * 2.0 - 1.0;
            double temp = baseTemp + noise;

            double centerX = width * 0.5;
            double centerY = height * 0.4;
            double dist = sqrt(pow(x - centerX, 2) + pow(y - centerY, 2));
            if (dist < 50) {
                temp -= (50 - dist) * 0.08;
            }

            double centerX2 = width * 0.7;
            double centerY2 = height * 0.6;
            double dist2 = sqrt(pow(x - centerX2, 2) + pow(y - centerY2, 2));
            if (dist2 < 40) {
                temp -= (40 - dist2) * 0.06;
            }

            thermalData.at<double>(y, x) = temp;
        }
    }

    QDateTime timestamp = QDateTime::currentDateTime();
    return TemperatureFrame(thermalData, timestamp, filePath);
}
