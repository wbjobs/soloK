#include "io/DataExporter.h"
#include <QFile>
#include <QTextStream>
#include <QPainter>
#include <QPdfWriter>
#include <QPageLayout>
#include <QImage>
#include <QPixmap>
#include <QDebug>
#include <cmath>

DataExporter::DataExporter(QObject* parent)
    : QObject(parent)
{
}

QString DataExporter::formatDouble(double value, int precision) {
    if (std::abs(value) < 1e-12) return "0.000000";
    return QString::number(value, 'e', precision);
}

bool DataExporter::exportVTK(const QString& filePath,
                             const cv::Mat& displacementX, const cv::Mat& displacementY,
                             const StrainCalculator::StrainResult& strain,
                             double pixelToPhysical)
{
    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        emit finished(false, "Cannot open VTK file: " + filePath);
        return false;
    }

    QTextStream out(&file);
    int nx = displacementX.cols;
    int ny = displacementX.rows;

    out << "# vtk DataFile Version 3.0\n";
    out << "Speckle Interferometry Strain Results\n";
    out << "ASCII\n";
    out << "DATASET STRUCTURED_POINTS\n";
    out << "DIMENSIONS " << nx << " " << ny << " 1\n";
    out << "ORIGIN 0 0 0\n";
    out << "SPACING " << pixelToPhysical << " " << pixelToPhysical << " 1\n";
    out << "POINT_DATA " << nx * ny << "\n";

    out << "VECTORS Displacement double\n";
    for (int y = 0; y < ny; ++y) {
        for (int x = 0; x < nx; ++x) {
            double ux = displacementX.at<double>(y, x) * pixelToPhysical;
            double uy = displacementY.at<double>(y, x) * pixelToPhysical;
            out << ux << " " << uy << " 0.0\n";
        }
    }

    out << "SCALARS Strain_Exx double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x)
            out << strain.exx.at<double>(y, x) << "\n";

    out << "SCALARS Strain_Eyy double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x)
            out << strain.eyy.at<double>(y, x) << "\n";

    out << "SCALARS Strain_Exy double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x)
            out << strain.exy.at<double>(y, x) << "\n";

    out << "SCALARS Principal_E1 double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x)
            out << strain.e1.at<double>(y, x) << "\n";

    out << "SCALARS Principal_E2 double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x)
            out << strain.e2.at<double>(y, x) << "\n";

    out << "SCALARS Max_Shear double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x)
            out << strain.maxShear.at<double>(y, x) << "\n";

    out << "SCALARS Von_Mises double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x)
            out << strain.vonMises.at<double>(y, x) << "\n";

    out << "SCALARS Principal_Angle double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x)
            out << strain.principalAngle.at<double>(y, x) << "\n";

    if (!strain.elasticExx.empty()) {
        out << "SCALARS Elastic_Exx double 1\nLOOKUP_TABLE default\n";
        for (int y = 0; y < ny; ++y)
            for (int x = 0; x < nx; ++x)
                out << strain.elasticExx.at<double>(y, x) << "\n";
        out << "SCALARS Elastic_Eyy double 1\nLOOKUP_TABLE default\n";
        for (int y = 0; y < ny; ++y)
            for (int x = 0; x < nx; ++x)
                out << strain.elasticEyy.at<double>(y, x) << "\n";
        out << "SCALARS Elastic_VonMises double 1\nLOOKUP_TABLE default\n";
        for (int y = 0; y < ny; ++y)
            for (int x = 0; x < nx; ++x)
                out << strain.elasticVonMises.at<double>(y, x) << "\n";
    }

    if (!strain.plasticExx.empty()) {
        out << "SCALARS Plastic_Exx double 1\nLOOKUP_TABLE default\n";
        for (int y = 0; y < ny; ++y)
            for (int x = 0; x < nx; ++x)
                out << strain.plasticExx.at<double>(y, x) << "\n";
        out << "SCALARS Plastic_Eyy double 1\nLOOKUP_TABLE default\n";
        for (int y = 0; y < ny; ++y)
            for (int x = 0; x < nx; ++x)
                out << strain.plasticEyy.at<double>(y, x) << "\n";
        out << "SCALARS Plastic_VonMises double 1\nLOOKUP_TABLE default\n";
        for (int y = 0; y < ny; ++y)
            for (int x = 0; x < nx; ++x)
                out << strain.plasticVonMises.at<double>(y, x) << "\n";
        out << "SCALARS Plastic_Zone double 1\nLOOKUP_TABLE default\n";
        for (int y = 0; y < ny; ++y)
            for (int x = 0; x < nx; ++x)
                out << static_cast<double>(strain.plasticZone.at<uchar>(y, x)) << "\n";
    }

    file.close();
    emit finished(true, "VTK export successful: " + filePath);
    return true;
}

bool DataExporter::exportCSV(const QString& filePath,
                             const cv::Mat& displacementX, const cv::Mat& displacementY,
                             const StrainCalculator::StrainResult& strain,
                             const ExportOptions& options)
{
    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        emit finished(false, "Cannot open CSV file: " + filePath);
        return false;
    }

    QTextStream out(&file);

    out << "X,Y";
    if (options.includeDisplacement) out << ",Ux,Uy";
    if (options.includeStrain) out << ",Exx,Eyy,Exy";
    if (options.includePrincipal) out << ",E1,E2,MaxShear,Angle";
    if (options.includeVonMises) out << ",VonMises";
    out << "\n";

    for (int y = 0; y < strain.exx.rows; ++y) {
        for (int x = 0; x < strain.exx.cols; ++x) {
            out << x << "," << y;
            if (options.includeDisplacement) {
                out << "," << formatDouble(displacementX.at<double>(y, x))
                    << "," << formatDouble(displacementY.at<double>(y, x));
            }
            if (options.includeStrain) {
                out << "," << formatDouble(strain.exx.at<double>(y, x))
                    << "," << formatDouble(strain.eyy.at<double>(y, x))
                    << "," << formatDouble(strain.exy.at<double>(y, x));
            }
            if (options.includePrincipal) {
                out << "," << formatDouble(strain.e1.at<double>(y, x))
                    << "," << formatDouble(strain.e2.at<double>(y, x))
                    << "," << formatDouble(strain.maxShear.at<double>(y, x))
                    << "," << formatDouble(strain.principalAngle.at<double>(y, x));
            }
            if (options.includeVonMises) {
                out << "," << formatDouble(strain.vonMises.at<double>(y, x));
            }
            out << "\n";
        }
    }

    file.close();
    emit finished(true, "CSV export successful: " + filePath);
    return true;
}

bool DataExporter::exportPDF(const QString& filePath,
                             const cv::Mat& originalImage,
                             const cv::Mat& coloredStrain,
                             const StrainCalculator::StrainResult& strain,
                             const StrainCalculator::ROIResult* roiResult,
                             const QString& title)
{
    QPdfWriter writer(filePath);
    writer.setPageSize(QPageSize(QPageSize::A4));
    writer.setResolution(300);
    writer.setPageMargins(QMarginsF(20, 20, 20, 20), QPageLayout::Millimeter);

    QPainter painter(&writer);
    if (!painter.isActive()) {
        emit finished(false, "Failed to create PDF painter");
        return false;
    }

    int dpi = 300;
    int pageWidth = writer.width();
    int pageHeight = writer.height();
    int margin = static_cast<int>(20.0 / 25.4 * dpi);
    int contentWidth = pageWidth - 2 * margin;
    int y = margin;

    painter.setFont(QFont("Arial", 18, QFont::Bold));
    painter.drawText(margin, y, contentWidth, 40, Qt::AlignCenter, title);
    y += 60;

    painter.setFont(QFont("Arial", 10));
    QString dateStr = QDateTime::currentDateTime().toString("yyyy-MM-dd HH:mm:ss");
    painter.drawText(margin, y, contentWidth, 20, Qt::AlignRight, "Date: " + dateStr);
    y += 30;

    painter.setFont(QFont("Arial", 12, QFont::Bold));
    painter.drawText(margin, y, contentWidth, 25, "1. Strain Summary");
    y += 30;

    painter.setFont(QFont("Arial", 10));
    QStringList summary;
    summary << QString("Average Exx: %1").arg(formatDouble(strain.averageExx, 6))
            << QString("Average Eyy: %1").arg(formatDouble(strain.averageEyy, 6))
            << QString("Average Exy: %1").arg(formatDouble(strain.averageExy, 6))
            << QString("Average Von Mises: %1").arg(formatDouble(strain.averageVonMises, 6))
            << QString("Max Principal Strain: %1").arg(formatDouble(strain.maxPrincipalStrain, 6))
            << QString("Min Principal Strain: %1").arg(formatDouble(strain.minPrincipalStrain, 6))
            << QString("Max Shear Strain: %1").arg(formatDouble(strain.maxShearStrain, 6));

    for (const QString& line : summary) {
        painter.drawText(margin + 10, y, contentWidth, 20, line);
        y += 22;
    }

    if (roiResult) {
        y += 10;
        painter.setFont(QFont("Arial", 12, QFont::Bold));
        painter.drawText(margin, y, contentWidth, 25, "2. ROI Analysis");
        y += 30;

        painter.setFont(QFont("Arial", 10));
        QStringList roiStats;
        roiStats << QString("Average Exx: %1").arg(formatDouble(roiResult->averageExx, 6))
                 << QString("Average Eyy: %1").arg(formatDouble(roiResult->averageEyy, 6))
                 << QString("Average Exy: %1").arg(formatDouble(roiResult->averageExy, 6))
                 << QString("Average E1: %1").arg(formatDouble(roiResult->averageE1, 6))
                 << QString("Average E2: %1").arg(formatDouble(roiResult->averageE2, 6))
                 << QString("Average Max Shear: %1").arg(formatDouble(roiResult->averageMaxShear, 6))
                 << QString("Average Von Mises: %1").arg(formatDouble(roiResult->averageVonMises, 6))
                 << QString("Principal Direction: %1 deg").arg(formatDouble(roiResult->principalDirection, 4))
                 << QString("Pixel Count: %1").arg(roiResult->numPixels);

        for (const QString& line : roiStats) {
            painter.drawText(margin + 10, y, contentWidth, 20, line);
            y += 22;
        }
    }

    int imgHeight = (pageHeight - y - margin) / 2;
    if (imgHeight > 200) {
        QImage origImg;
        if (originalImage.channels() == 1) {
            origImg = QImage(originalImage.data, originalImage.cols, originalImage.rows,
                            originalImage.step, QImage::Format_Grayscale8).copy();
        } else {
            cv::Mat rgb;
            cv::cvtColor(originalImage, rgb, cv::COLOR_BGR2RGB);
            origImg = QImage(rgb.data, rgb.cols, rgb.rows, rgb.step, QImage::Format_RGB888).copy();
        }

        painter.setFont(QFont("Arial", 12, QFont::Bold));
        painter.drawText(margin, y, contentWidth, 25, "3. Original Image");
        y += 30;

        QPixmap origPix = QPixmap::fromImage(origImg).scaled(
            contentWidth, imgHeight - 30, Qt::KeepAspectRatio, Qt::SmoothTransformation);
        painter.drawPixmap(margin + (contentWidth - origPix.width()) / 2, y, origPix);
        y += imgHeight;

        QImage colorImg(coloredStrain.data, coloredStrain.cols, coloredStrain.rows,
                       coloredStrain.step, QImage::Format_RGB888);
        colorImg = colorImg.rgbSwapped().copy();

        painter.setFont(QFont("Arial", 12, QFont::Bold));
        painter.drawText(margin, y, contentWidth, 25, "4. Strain Distribution");
        y += 30;

        QPixmap colorPix = QPixmap::fromImage(colorImg).scaled(
            contentWidth, imgHeight - 30, Qt::KeepAspectRatio, Qt::SmoothTransformation);
        painter.drawPixmap(margin + (contentWidth - colorPix.width()) / 2, y, colorPix);
    }

    painter.end();
    emit finished(true, "PDF export successful: " + filePath);
    return true;
}

bool DataExporter::exportImage(const QString& filePath, const cv::Mat& image, int dpi) {
    Q_UNUSED(dpi);
    cv::Mat toSave;
    if (image.channels() == 3) {
        cv::cvtColor(image, toSave, cv::COLOR_RGB2BGR);
    } else if (image.channels() == 4) {
        cv::cvtColor(image, toSave, cv::COLOR_RGBA2BGRA);
    } else {
        toSave = image.clone();
    }
    if (toSave.depth() == CV_64F) {
        double minVal, maxVal;
        cv::minMaxLoc(toSave.reshape(1), &minVal, &maxVal);
        toSave = (toSave - minVal) / (maxVal - minVal) * 255.0;
        toSave.convertTo(toSave, CV_8U);
    }
    bool ok = cv::imwrite(filePath.toStdString(), toSave);
    emit finished(ok, ok ? "Image export successful" : "Image export failed");
    return ok;
}

bool DataExporter::exportROIResults(const QString& filePath,
                                    const std::vector<StrainCalculator::ROIResult>& results,
                                    const QStringList& roiNames)
{
    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        emit finished(false, "Cannot open CSV file");
        return false;
    }

    QTextStream out(&file);
    out << "ROI,Name,AverageExx,AverageEyy,AverageExy,AverageE1,AverageE2,"
        << "AverageMaxShear,AverageVonMises,PrincipalDirection,MinExx,MaxExx,MinEyy,MaxEyy,PixelCount\n";

    for (int i = 0; i < static_cast<int>(results.size()); ++i) {
        const auto& r = results[i];
        QString name = (i < roiNames.size()) ? roiNames[i] : QString("ROI_%1").arg(i + 1);
        out << (i + 1) << "," << name << ","
            << formatDouble(r.averageExx) << "," << formatDouble(r.averageEyy) << ","
            << formatDouble(r.averageExy) << "," << formatDouble(r.averageE1) << ","
            << formatDouble(r.averageE2) << "," << formatDouble(r.averageMaxShear) << ","
            << formatDouble(r.averageVonMises) << "," << formatDouble(r.principalDirection) << ","
            << formatDouble(r.minExx) << "," << formatDouble(r.maxExx) << ","
            << formatDouble(r.minEyy) << "," << formatDouble(r.maxEyy) << ","
            << r.numPixels << "\n";
    }

    file.close();
    emit finished(true, "ROI results export successful");
    return true;
}

bool DataExporter::exportTimeHistoryCSV(const QString& filePath,
                                        const std::vector<double>& times,
                                        const std::vector<std::vector<double>>& strainData,
                                        const QStringList& pointNames)
{
    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) return false;

    QTextStream out(&file);
    out << "Time";
    for (const auto& name : pointNames) out << "," << name;
    out << "\n";

    for (size_t t = 0; t < times.size(); ++t) {
        out << times[t];
        for (const auto& data : strainData) {
            if (t < data.size()) out << "," << formatDouble(data[t], 6);
            else out << ",";
        }
        out << "\n";
    }

    file.close();
    return true;
}
