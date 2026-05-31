#ifndef STRAINDECOMPOSER_H
#define STRAINDECOMPOSER_H

#include <opencv2/opencv.hpp>
#include <QObject>
#include <QString>
#include <vector>

class StrainDecomposer : public QObject {
    Q_OBJECT

public:
    enum DecompositionMethod {
        ElasticThreshold,
        RambergOsgood,
        LoadUnloadHysteresis,
        IterativeEnergyMinimization
    };

    struct MaterialProperties {
        double youngsModulus;
        double poissonsRatio;
        double yieldStress;
        double yieldStrain;
        double tangentModulus;
        double elasticLimit;
        QString materialName;
    };

    struct LoadUnloadPoint {
        double load;
        double strain;
        double stress;
        bool isLoading;
    };

    struct DecompositionResult {
        cv::Mat elasticExx;
        cv::Mat elasticEyy;
        cv::Mat elasticExy;
        cv::Mat elasticE1;
        cv::Mat elasticE2;
        cv::Mat elasticMaxShear;
        cv::Mat elasticVonMises;

        cv::Mat plasticExx;
        cv::Mat plasticEyy;
        cv::Mat plasticExy;
        cv::Mat plasticE1;
        cv::Mat plasticE2;
        cv::Mat plasticMaxShear;
        cv::Mat plasticVonMises;
        cv::Mat plasticZone;

        cv::Mat totalExx;
        cv::Mat totalEyy;
        cv::Mat totalExy;
        cv::Mat totalVonMises;

        double plasticAreaRatio;
        double maxPlasticStrain;
        double avgPlasticStrain;
        double avgElasticStrain;

        std::vector<LoadUnloadPoint> loadUnloadCurve;
        double hysteresisArea;
        double elasticEnergy;
        double plasticEnergy;

        bool valid;
        QString errorMessage;
    };

    explicit StrainDecomposer(QObject* parent = nullptr);

    void setDecompositionMethod(DecompositionMethod method);
    DecompositionMethod decompositionMethod() const;

    void setMaterialProperties(const MaterialProperties& props);
    MaterialProperties materialProperties() const;

    void setLoadUnloadCurve(const std::vector<LoadUnloadPoint>& curve);
    std::vector<LoadUnloadPoint> loadUnloadCurve() const;

    void setElasticLimit(double limit);
    double elasticLimit() const;

    void setYieldStrain(double strain);
    double yieldStrain() const;

    DecompositionResult decompose(const cv::Mat& exx, const cv::Mat& eyy,
                                  const cv::Mat& exy, const cv::Mat& vonMises);

    static DecompositionResult decomposeByThreshold(const cv::Mat& exx, const cv::Mat& eyy,
                                                     const cv::Mat& exy, const cv::Mat& vonMises,
                                                     double elasticLimit);

    static DecompositionResult decomposeByRambergOsgood(const cv::Mat& exx, const cv::Mat& eyy,
                                                         const cv::Mat& exy, const cv::Mat& vonMises,
                                                         double yieldStrain, double alpha, double n);

    cv::Mat computeYieldFunction(const cv::Mat& vonMises, double yieldStress) const;

    double computeHysteresisArea(const std::vector<LoadUnloadPoint>& curve) const;

signals:
    void progress(int percent);
    void finished(const StrainDecomposer::DecompositionResult& result);

private:
    void initResult(DecompositionResult& result, const cv::Mat& sizeRef) const;
    void computePrincipalStrains(DecompositionResult& result, bool isElastic) const;
    void computeStatistics(DecompositionResult& result) const;

    DecompositionMethod m_method;
    MaterialProperties m_material;
    std::vector<LoadUnloadPoint> m_loadUnloadCurve;
    double m_elasticLimit;
    double m_yieldStrain;
};

#endif
