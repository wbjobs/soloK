#ifndef STRAINCALCULATOR_H
#define STRAINCALCULATOR_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>
#include <array>

class StrainCalculator : public QObject {
    Q_OBJECT

public:
    struct StrainResult {
        cv::Mat exx;
        cv::Mat eyy;
        cv::Mat exy;
        cv::Mat e1;
        cv::Mat e2;
        cv::Mat maxShear;
        cv::Mat principalAngle;
        cv::Mat vonMises;

        cv::Mat elasticExx;
        cv::Mat elasticEyy;
        cv::Mat elasticExy;
        cv::Mat elasticVonMises;

        cv::Mat plasticExx;
        cv::Mat plasticEyy;
        cv::Mat plasticExy;
        cv::Mat plasticVonMises;
        cv::Mat plasticZone;

        double averageExx;
        double averageEyy;
        double averageExy;
        double averageVonMises;
        double maxPrincipalStrain;
        double minPrincipalStrain;
        double maxShearStrain;
        double plasticAreaRatio;
        double maxPlasticStrain;
        double avgPlasticStrain;
        double avgElasticStrain;

        bool valid;
        QString errorMessage;
    };

    struct ROIResult {
        double averageExx;
        double averageEyy;
        double averageExy;
        double averageE1;
        double averageE2;
        double averageMaxShear;
        double averageVonMises;
        double principalDirection;
        double minExx;
        double maxExx;
        double minEyy;
        double maxEyy;
        int numPixels;
    };

    explicit StrainCalculator(QObject* parent = nullptr);

    StrainResult compute(const cv::Mat& displacementX, const cv::Mat& displacementY,
                         double pixelToPhysical = 1.0);

    cv::Mat computeGradient(const cv::Mat& src, bool isX);

    static cv::Mat smoothField(const cv::Mat& field, int kernelSize = 5);

    static ROIResult computeROIStatistics(const StrainResult& strain, cv::Rect roi);

signals:
    void progress(int percent);
    void finished(const StrainCalculator::StrainResult& result);

private:
    cv::Mat computeVonMises(const cv::Mat& exx, const cv::Mat& eyy, const cv::Mat& exy);
};

#endif
