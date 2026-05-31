#include "core/StrainDecomposer.h"
#include "utils/MathUtils.h"
#include <cmath>
#include <algorithm>
#include <numeric>
#include <limits>

StrainDecomposer::StrainDecomposer(QObject* parent)
    : QObject(parent)
    , m_method(LoadUnloadHysteresis)
    , m_elasticLimit(0.002)
    , m_yieldStrain(0.002)
{
    m_material.youngsModulus = 210e9;
    m_material.poissonsRatio = 0.3;
    m_material.yieldStress = 250e6;
    m_material.yieldStrain = m_material.yieldStress / m_material.youngsModulus;
    m_material.tangentModulus = m_material.youngsModulus * 0.1;
    m_material.elasticLimit = m_material.yieldStrain;
    m_material.materialName = "Steel";
}

void StrainDecomposer::setDecompositionMethod(DecompositionMethod method) { m_method = method; }
StrainDecomposer::DecompositionMethod StrainDecomposer::decompositionMethod() const { return m_method; }

void StrainDecomposer::setMaterialProperties(const MaterialProperties& props) {
    m_material = props;
    m_yieldStrain = props.yieldStrain;
    m_elasticLimit = props.elasticLimit;
}
StrainDecomposer::MaterialProperties StrainDecomposer::materialProperties() const { return m_material; }

void StrainDecomposer::setLoadUnloadCurve(const std::vector<LoadUnloadPoint>& curve) {
    m_loadUnloadCurve = curve;
}
std::vector<StrainDecomposer::LoadUnloadPoint> StrainDecomposer::loadUnloadCurve() const {
    return m_loadUnloadCurve;
}

void StrainDecomposer::setElasticLimit(double limit) { m_elasticLimit = limit; }
double StrainDecomposer::elasticLimit() const { return m_elasticLimit; }

void StrainDecomposer::setYieldStrain(double strain) { m_yieldStrain = strain; }
double StrainDecomposer::yieldStrain() const { return m_yieldStrain; }

void StrainDecomposer::initResult(DecompositionResult& result, const cv::Mat& sizeRef) const {
    result.elasticExx = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.elasticEyy = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.elasticExy = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.elasticE1 = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.elasticE2 = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.elasticMaxShear = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.elasticVonMises = cv::Mat::zeros(sizeRef.size(), CV_64F);

    result.plasticExx = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.plasticEyy = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.plasticExy = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.plasticE1 = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.plasticE2 = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.plasticMaxShear = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.plasticVonMises = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.plasticZone = cv::Mat::zeros(sizeRef.size(), CV_8U);

    result.totalExx = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.totalEyy = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.totalExy = cv::Mat::zeros(sizeRef.size(), CV_64F);
    result.totalVonMises = cv::Mat::zeros(sizeRef.size(), CV_64F);
}

void StrainDecomposer::computePrincipalStrains(DecompositionResult& result, bool isElastic) const {
    cv::Mat& exx = isElastic ? result.elasticExx : result.plasticExx;
    cv::Mat& eyy = isElastic ? result.elasticEyy : result.plasticEyy;
    cv::Mat& exy = isElastic ? result.elasticExy : result.plasticExy;
    cv::Mat& e1 = isElastic ? result.elasticE1 : result.plasticE1;
    cv::Mat& e2 = isElastic ? result.elasticE2 : result.plasticE2;
    cv::Mat& maxShear = isElastic ? result.elasticMaxShear : result.plasticMaxShear;
    cv::Mat& vonMises = isElastic ? result.elasticVonMises : result.plasticVonMises;

    for (int y = 0; y < exx.rows; ++y) {
        for (int x = 0; x < exx.cols; ++x) {
            double e = exx.at<double>(y, x);
            double ey = eyy.at<double>(y, x);
            double gamma = 2.0 * exy.at<double>(y, x);

            double avg = 0.5 * (e + ey);
            double diff = 0.5 * (e - ey);
            double r = std::sqrt(diff * diff + (gamma * 0.5) * (gamma * 0.5));

            e1.at<double>(y, x) = avg + r;
            e2.at<double>(y, x) = avg - r;
            maxShear.at<double>(y, x) = 2.0 * r;
            vonMises.at<double>(y, x) = std::sqrt(e * e - e * ey + ey * ey + 3.0 * exy.at<double>(y, x) * exy.at<double>(y, x));
        }
    }
}

void StrainDecomposer::computeStatistics(DecompositionResult& result) const {
    int totalPixels = result.plasticZone.rows * result.plasticZone.cols;
    int plasticPixels = cv::countNonZero(result.plasticZone);
    result.plasticAreaRatio = totalPixels > 0 ? static_cast<double>(plasticPixels) / totalPixels : 0.0;

    double maxP = 0, sumP = 0, sumE = 0;
    int cntP = 0;
    for (int y = 0; y < result.plasticZone.rows; ++y) {
        for (int x = 0; x < result.plasticZone.cols; ++x) {
            double pvm = result.plasticVonMises.at<double>(y, x);
            double evm = result.elasticVonMises.at<double>(y, x);
            sumE += evm;
            if (result.plasticZone.at<uchar>(y, x)) {
                sumP += pvm;
                maxP = std::max(maxP, pvm);
                cntP++;
            }
        }
    }
    result.maxPlasticStrain = maxP;
    result.avgPlasticStrain = cntP > 0 ? sumP / cntP : 0.0;
    result.avgElasticStrain = totalPixels > 0 ? sumE / totalPixels : 0.0;

    result.hysteresisArea = computeHysteresisArea(m_loadUnloadCurve);

    double elasticEnergy = 0, plasticEnergy = 0;
    for (int y = 0; y < result.plasticZone.rows; ++y) {
        for (int x = 0; x < result.plasticZone.cols; ++x) {
            double e = result.elasticVonMises.at<double>(y, x);
            double p = result.plasticVonMises.at<double>(y, x);
            elasticEnergy += 0.5 * m_material.youngsModulus * e * e;
            plasticEnergy += m_material.yieldStress * p;
        }
    }
    result.elasticEnergy = elasticEnergy;
    result.plasticEnergy = plasticEnergy;
    result.loadUnloadCurve = m_loadUnloadCurve;
}

cv::Mat StrainDecomposer::computeYieldFunction(const cv::Mat& vonMises, double yieldStress) const {
    cv::Mat yieldFunc(vonMises.size(), CV_64F);
    for (int y = 0; y < vonMises.rows; ++y) {
        for (int x = 0; x < vonMises.cols; ++x) {
            double vm = vonMises.at<double>(y, x);
            double stress = vm * m_material.youngsModulus;
            yieldFunc.at<double>(y, x) = stress - yieldStress;
        }
    }
    return yieldFunc;
}

double StrainDecomposer::computeHysteresisArea(const std::vector<LoadUnloadPoint>& curve) const {
    if (curve.size() < 4) return 0.0;

    double area = 0.0;
    for (size_t i = 1; i < curve.size(); ++i) {
        double dStrain = curve[i].strain - curve[i - 1].strain;
        double avgStress = 0.5 * (curve[i].stress + curve[i - 1].stress);
        area += dStrain * avgStress;
    }
    return std::abs(area);
}

StrainDecomposer::DecompositionResult StrainDecomposer::decompose(
    const cv::Mat& exx, const cv::Mat& eyy,
    const cv::Mat& exy, const cv::Mat& vonMises)
{
    DecompositionResult result;
    result.valid = false;

    if (exx.empty() || vonMises.empty()) {
        result.errorMessage = "Empty strain field";
        emit finished(result);
        return result;
    }

    initResult(result, exx);

    result.totalExx = exx.clone();
    result.totalEyy = eyy.clone();
    result.totalExy = exy.clone();
    result.totalVonMises = vonMises.clone();

    emit progress(20);

    switch (m_method) {
        case ElasticThreshold:
            result = decomposeByThreshold(exx, eyy, exy, vonMises, m_elasticLimit);
            break;

        case RambergOsgood: {
            double alpha = 0.5;
            double n = 5.0;
            result = decomposeByRambergOsgood(exx, eyy, exy, vonMises, m_yieldStrain, alpha, n);
            break;
        }

        case LoadUnloadHysteresis: {
            result = decomposeByThreshold(exx, eyy, exy, vonMises, m_elasticLimit);
            if (!m_loadUnloadCurve.empty()) {
                double maxStrain = 0;
                double unloadStrain = 0;
                double maxLoad = 0;
                for (const auto& pt : m_loadUnloadCurve) {
                    maxStrain = std::max(maxStrain, pt.strain);
                    maxLoad = std::max(maxLoad, pt.load);
                    if (!pt.isLoading && unloadStrain == 0) unloadStrain = pt.strain;
                }
                double residual = maxStrain - unloadStrain;
                if (residual > 0) {
                    double scale = residual / maxStrain;
                    result.plasticExx *= scale;
                    result.plasticEyy *= scale;
                    result.plasticExy *= scale;
                    result.elasticExx = result.totalExx - result.plasticExx;
                    result.elasticEyy = result.totalEyy - result.plasticEyy;
                    result.elasticExy = result.totalExy - result.plasticExy;
                }
            }
            break;
        }

        case IterativeEnergyMinimization: {
            double elasticLimit = m_elasticLimit;
            for (int iter = 0; iter < 20; ++iter) {
                result = decomposeByThreshold(exx, eyy, exy, vonMises, elasticLimit);
                double avgElastic = result.avgElasticStrain;
                if (std::abs(avgElastic - elasticLimit) < 1e-6) break;
                elasticLimit = 0.5 * (elasticLimit + avgElastic);
            }
            break;
        }
    }

    emit progress(60);

    computePrincipalStrains(result, true);
    computePrincipalStrains(result, false);

    emit progress(80);

    computeStatistics(result);

    result.valid = true;
    emit progress(100);
    emit finished(result);
    return result;
}

StrainDecomposer::DecompositionResult StrainDecomposer::decomposeByThreshold(
    const cv::Mat& exx, const cv::Mat& eyy,
    const cv::Mat& exy, const cv::Mat& vonMises,
    double elasticLimit)
{
    DecompositionResult result;
    result.valid = true;

    int rows = exx.rows;
    int cols = exx.cols;

    result.elasticExx = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticEyy = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticExy = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticE1 = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticE2 = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticMaxShear = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticVonMises = cv::Mat::zeros(rows, cols, CV_64F);

    result.plasticExx = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticEyy = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticExy = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticE1 = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticE2 = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticMaxShear = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticVonMises = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticZone = cv::Mat::zeros(rows, cols, CV_8U);

    result.totalExx = exx.clone();
    result.totalEyy = eyy.clone();
    result.totalExy = exy.clone();
    result.totalVonMises = vonMises.clone();

    for (int y = 0; y < rows; ++y) {
        for (int x = 0; x < cols; ++x) {
            double vm = vonMises.at<double>(y, x);

            if (vm <= elasticLimit) {
                result.elasticExx.at<double>(y, x) = exx.at<double>(y, x);
                result.elasticEyy.at<double>(y, x) = eyy.at<double>(y, x);
                result.elasticExy.at<double>(y, x) = exy.at<double>(y, x);
                result.elasticVonMises.at<double>(y, x) = vm;
            } else {
                double eRatio = elasticLimit / vm;
                result.elasticExx.at<double>(y, x) = exx.at<double>(y, x) * eRatio;
                result.elasticEyy.at<double>(y, x) = eyy.at<double>(y, x) * eRatio;
                result.elasticExy.at<double>(y, x) = exy.at<double>(y, x) * eRatio;
                result.elasticVonMises.at<double>(y, x) = elasticLimit;

                result.plasticExx.at<double>(y, x) = exx.at<double>(y, x) * (1.0 - eRatio);
                result.plasticEyy.at<double>(y, x) = eyy.at<double>(y, x) * (1.0 - eRatio);
                result.plasticExy.at<double>(y, x) = exy.at<double>(y, x) * (1.0 - eRatio);
                result.plasticVonMises.at<double>(y, x) = vm - elasticLimit;
                result.plasticZone.at<uchar>(y, x) = 1;
            }
        }
    }

    return result;
}

StrainDecomposer::DecompositionResult StrainDecomposer::decomposeByRambergOsgood(
    const cv::Mat& exx, const cv::Mat& eyy,
    const cv::Mat& exy, const cv::Mat& vonMises,
    double yieldStrain, double alpha, double n)
{
    DecompositionResult result;
    result.valid = true;

    int rows = exx.rows;
    int cols = exx.cols;

    result.elasticExx = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticEyy = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticExy = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticE1 = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticE2 = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticMaxShear = cv::Mat::zeros(rows, cols, CV_64F);
    result.elasticVonMises = cv::Mat::zeros(rows, cols, CV_64F);

    result.plasticExx = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticEyy = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticExy = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticE1 = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticE2 = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticMaxShear = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticVonMises = cv::Mat::zeros(rows, cols, CV_64F);
    result.plasticZone = cv::Mat::zeros(rows, cols, CV_8U);

    result.totalExx = exx.clone();
    result.totalEyy = eyy.clone();
    result.totalExy = exy.clone();
    result.totalVonMises = vonMises.clone();

    for (int y = 0; y < rows; ++y) {
        for (int x = 0; x < cols; ++x) {
            double vm = vonMises.at<double>(y, x);

            double plasticStrain = alpha * yieldStrain * std::pow(vm / yieldStrain, n);
            double ratio = (vm > 1e-12) ? std::min(1.0, plasticStrain / vm) : 0.0;

            if (ratio > 0.01) {
                result.plasticExx.at<double>(y, x) = exx.at<double>(y, x) * ratio;
                result.plasticEyy.at<double>(y, x) = eyy.at<double>(y, x) * ratio;
                result.plasticExy.at<double>(y, x) = exy.at<double>(y, x) * ratio;
                result.plasticVonMises.at<double>(y, x) = vm * ratio;
                result.plasticZone.at<uchar>(y, x) = 1;

                result.elasticExx.at<double>(y, x) = exx.at<double>(y, x) * (1.0 - ratio);
                result.elasticEyy.at<double>(y, x) = eyy.at<double>(y, x) * (1.0 - ratio);
                result.elasticExy.at<double>(y, x) = exy.at<double>(y, x) * (1.0 - ratio);
                result.elasticVonMises.at<double>(y, x) = vm * (1.0 - ratio);
            } else {
                result.elasticExx.at<double>(y, x) = exx.at<double>(y, x);
                result.elasticEyy.at<double>(y, x) = eyy.at<double>(y, x);
                result.elasticExy.at<double>(y, x) = exy.at<double>(y, x);
                result.elasticVonMises.at<double>(y, x) = vm;
            }
        }
    }

    return result;
}
