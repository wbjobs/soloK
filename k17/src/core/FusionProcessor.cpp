#include "core/FusionProcessor.h"
#include "utils/MathUtils.h"
#include <cmath>
#include <algorithm>
#include <numeric>

FusionProcessor::FusionProcessor(QObject* parent)
    : QObject(parent)
    , m_strategy(ConfidenceWeighted)
    , m_interferometrySensitivity(0.01)
    , m_dicRange(100.0)
    , m_crossoverFrequency(0.1)
    , m_alpha(0.5)
{
}

void FusionProcessor::setFusionStrategy(FusionStrategy strategy) { m_strategy = strategy; }
FusionProcessor::FusionStrategy FusionProcessor::fusionStrategy() const { return m_strategy; }

void FusionProcessor::setInterferometrySensitivity(double sensitivity) { m_interferometrySensitivity = sensitivity; }
double FusionProcessor::interferometrySensitivity() const { return m_interferometrySensitivity; }

void FusionProcessor::setDICRange(double range) { m_dicRange = range; }
double FusionProcessor::dicRange() const { return m_dicRange; }

void FusionProcessor::setCrossoverFrequency(double freq) { m_crossoverFrequency = freq; }
double FusionProcessor::crossoverFrequency() const { return m_crossoverFrequency; }

void FusionProcessor::setAlpha(double alpha) { m_alpha = alpha; }
double FusionProcessor::alpha() const { return m_alpha; }

cv::Mat FusionProcessor::confidenceMapFromInterferometry(const cv::Mat& magnitude,
                                                          const cv::Mat& correlation)
{
    cv::Mat confidence(magnitude.size(), CV_64F);
    cv::Mat gradientX = MathUtils::gradientX(magnitude);
    cv::Mat gradientY = MathUtils::gradientY(magnitude);

    for (int y = 0; y < magnitude.rows; ++y) {
        for (int x = 0; x < magnitude.cols; ++x) {
            double gx = gradientX.at<double>(y, x);
            double gy = gradientY.at<double>(y, x);
            double gradMag = std::sqrt(gx * gx + gy * gy);

            double spatialConf = 1.0 / (1.0 + gradMag * 0.1);

            double amplitudeConf = 1.0;
            if (!correlation.empty()) {
                amplitudeConf = std::abs(correlation.at<double>(y, x));
            } else {
                double val = std::abs(magnitude.at<double>(y, x));
                amplitudeConf = std::exp(-val / (m_dicRange * 0.5));
            }

            confidence.at<double>(y, x) = spatialConf * amplitudeConf;
        }
    }
    cv::GaussianBlur(confidence, confidence, cv::Size(5, 5), 1.0);
    return confidence;
}

cv::Mat FusionProcessor::confidenceMapFromDIC(const cv::Mat& correlation) {
    cv::Mat confidence = correlation.clone();
    for (int y = 0; y < confidence.rows; ++y) {
        for (int x = 0; x < confidence.cols; ++x) {
            double c = confidence.at<double>(y, x);
            confidence.at<double>(y, x) = std::clamp(c, 0.0, 1.0);
        }
    }
    cv::GaussianBlur(confidence, confidence, cv::Size(5, 5), 1.0);
    return confidence;
}

cv::Mat FusionProcessor::fuseWeighted(const cv::Mat& field1, const cv::Mat& field2,
                                       const cv::Mat& weight1, const cv::Mat& weight2)
{
    cv::Mat fused(field1.size(), CV_64F);
    for (int y = 0; y < field1.rows; ++y) {
        for (int x = 0; x < field1.cols; ++x) {
            double w1 = weight1.at<double>(y, x);
            double w2 = weight2.at<double>(y, x);
            double wsum = w1 + w2;
            if (wsum > 1e-10) {
                fused.at<double>(y, x) = (field1.at<double>(y, x) * w1 +
                                        field2.at<double>(y, x) * w2) / wsum;
            } else {
                fused.at<double>(y, x) = 0.5 * (field1.at<double>(y, x) + field2.at<double>(y, x));
            }
        }
    }
    return fused;
}

FusionProcessor::FusionResult FusionProcessor::fuse(
    const SpeckleProcessor::Result& interferometryResult,
    const DICProcessor::DICResult& dicResult,
    const cv::Mat& reference)
{
    Q_UNUSED(reference);

    FusionResult result;
    result.valid = false;

    if (!interferometryResult.valid && !dicResult.valid) {
        result.errorMessage = "Both inputs invalid";
        emit finished(result);
        return result;
    }

    cv::Mat dispXInt = interferometryResult.displacementX;
    cv::Mat dispYInt = interferometryResult.displacementY;
    cv::Mat dispXDIC = dicResult.displacementX;
    cv::Mat dispYDIC = dicResult.displacementY;

    if (dispXInt.empty() && !dispXDIC.empty()) {
        result.fusedDisplacementX = dispXDIC.clone();
        result.fusedDisplacementY = dispYDIC.clone();
        result.interferometryWeight = cv::Mat::zeros(dispXDIC.size(), CV_64F);
        result.DICWeight = cv::Mat::ones(dispXDIC.size(), CV_64F);
        cv::magnitude(result.fusedDisplacementX, result.fusedDisplacementY, result.fusedMagnitude);
        result.fusionQuality = 0.5;
        result.valid = true;
        emit finished(result);
        return result;
    }

    if (dispXDIC.empty() && !dispXInt.empty()) {
        result.fusedDisplacementX = dispXInt.clone();
        result.fusedDisplacementY = dispYInt.clone();
        result.interferometryWeight = cv::Mat::ones(dispXInt.size(), CV_64F);
        result.DICWeight = cv::Mat::zeros(dispXInt.size(), CV_64F);
        cv::magnitude(result.fusedDisplacementX, result.fusedDisplacementY, result.fusedMagnitude);
        result.fusionQuality = 0.5;
        result.valid = true;
        emit finished(result);
        return result;
    }

    if (dispXInt.size() != dispXDIC.size()) {
        cv::resize(dispXInt, dispXInt, dispXDIC.size());
        cv::resize(dispYInt, dispYInt, dispXDIC.size());
    }

    cv::Mat confInt = confidenceMapFromInterferometry(interferometryResult.magnitude);
    cv::Mat confDIC = confidenceMapFromDIC(dicResult.correlationMap);

    emit progress(20);

    switch (m_strategy) {
        case WeightedAverage: {
            cv::Mat weightInt = cv::Mat::ones(dispXInt.size(), CV_64F) * m_alpha;
            cv::Mat weightDIC = cv::Mat::ones(dispXInt.size(), CV_64F) * (1.0 - m_alpha);
            result.fusedDisplacementX = fuseWeighted(dispXInt, dispXDIC, weightInt, weightDIC);
            result.fusedDisplacementY = fuseWeighted(dispYInt, dispYDIC, weightInt, weightDIC);
            result.interferometryWeight = weightInt.clone();
            result.DICWeight = weightDIC.clone();
            break;
        }
        case FrequencyDomain: {
            auto r = fuseFrequencyDomain(dispXInt, dispYInt, dispXDIC, dispYDIC, confInt, confDIC);
            result = r;
            break;
        }
        case MultiScalePyramid: {
            auto r = fuseMultiScale(dispXInt, dispYInt, dispXDIC, dispYDIC, confInt, confDIC);
            result = r;
            break;
        }
        case VarianceWeighted: {
            auto r = fuseVarianceWeighted(dispXInt, dispYInt, dispXDIC, dispYDIC);
            result = r;
            break;
        }
        case ConfidenceWeighted: {
            auto r = fuseConfidenceWeighted(dispXInt, dispYInt, dispXDIC, dispYDIC, confInt, confDIC);
            result = r;
            break;
        }
    }

    emit progress(80);

    cv::magnitude(result.fusedDisplacementX, result.fusedDisplacementY, result.fusedMagnitude);

    cv::Scalar meanIntW = cv::mean(result.interferometryWeight);
    cv::Scalar meanDICW = cv::mean(result.DICWeight);
    result.fusionQuality = std::max(meanIntW[0], meanDICW[0]);

    result.valid = true;
    emit progress(100);
    emit finished(result);
    return result;
}

FusionProcessor::FusionResult FusionProcessor::fuseFrequencyDomain(
    const cv::Mat& dispXInt, const cv::Mat& dispYInt,
    const cv::Mat& dispXDIC, const cv::Mat& dispYDIC,
    const cv::Mat& weightInt, const cv::Mat& weightDIC)
{
    FusionResult result;

    int rows = dispXInt.rows;
    int cols = dispXInt.cols;

    cv::Mat fftXInt = MathUtils::fft2(dispXInt);
    cv::Mat fftYInt = MathUtils::fft2(dispYInt);
    cv::Mat fftXDIC = MathUtils::fft2(dispXDIC);
    cv::Mat fftYDIC = MathUtils::fft2(dispYDIC);

    fftXInt = MathUtils::fftshift(fftXInt);
    fftYInt = MathUtils::fftshift(fftYInt);
    fftXDIC = MathUtils::fftshift(fftXDIC);
    fftYDIC = MathUtils::fftshift(fftYDIC);

    cv::Mat fusedX(rows, cols, CV_64FC2);
    cv::Mat fusedY(rows, cols, CV_64FC2);

    int cx = cols / 2;
    int cy = rows / 2;
    double crossover = m_crossoverFrequency * std::min(rows, cols) / 2.0;

    for (int y = 0; y < rows; ++y) {
        for (int x = 0; x < cols; ++x) {
            double dist = std::sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));

            double transition = 1.0 / (1.0 + std::exp(-(dist - crossover) * 3.0));
            double wInt = 1.0 - transition;
            double wDIC = transition;

            double wi = weightInt.at<double>(y, x);
            double wd = weightDIC.at<double>(y, x);
            double wsum = wi * wInt + wd * wDIC;
            if (wsum > 1e-10) {
                wInt = (wi * wInt) / wsum;
                wDIC = (wd * wDIC) / wsum;
            }

            fusedX.at<cv::Vec2d>(y, x)[0] = fftXInt.at<cv::Vec2d>(y, x)[0] * wInt
                                            + fftXDIC.at<cv::Vec2d>(y, x)[0] * wDIC;
            fusedX.at<cv::Vec2d>(y, x)[1] = fftXInt.at<cv::Vec2d>(y, x)[1] * wInt
                                            + fftXDIC.at<cv::Vec2d>(y, x)[1] * wDIC;
            fusedY.at<cv::Vec2d>(y, x)[0] = fftYInt.at<cv::Vec2d>(y, x)[0] * wInt
                                            + fftYDIC.at<cv::Vec2d>(y, x)[0] * wDIC;
            fusedY.at<cv::Vec2d>(y, x)[1] = fftYInt.at<cv::Vec2d>(y, x)[1] * wInt
                                            + fftYDIC.at<cv::Vec2d>(y, x)[1] * wDIC;
        }
    }

    fusedX = MathUtils::ifftshift(fusedX);
    fusedY = MathUtils::ifftshift(fusedY);

    result.fusedDisplacementX = MathUtils::ifft2(fusedX);
    result.fusedDisplacementY = MathUtils::ifft2(fusedY);

    result.interferometryWeight = cv::Mat::ones(rows, cols, CV_64F);
    result.DICWeight = cv::Mat::ones(rows, cols, CV_64F);
    for (int y = 0; y < rows; ++y) {
        for (int x = 0; x < cols; ++x) {
            double dist = std::sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
            double transition = 1.0 / (1.0 + std::exp(-(dist - crossover) * 3.0));
            result.interferometryWeight.at<double>(y, x) = 1.0 - transition;
            result.DICWeight.at<double>(y, x) = transition;
        }
    }

    return result;
}

FusionProcessor::FusionResult FusionProcessor::fuseMultiScale(
    const cv::Mat& dispXInt, const cv::Mat& dispYInt,
    const cv::Mat& dispXDIC, const cv::Mat& dispYDIC,
    const cv::Mat& weightInt, const cv::Mat& weightDIC)
{
    FusionResult result;

    const int levels = 4;
    std::vector<cv::Mat> gaussInt, lapInt, gaussDIC, lapDIC;
    gaussianDecompose(dispXInt, levels, gaussInt, lapInt);
    gaussianDecompose(dispXDIC, levels, gaussDIC, lapDIC);

    std::vector<cv::Mat> fusedLapX(levels);
    std::vector<cv::Mat> fusedLapY(levels);

    for (int l = 0; l < levels; ++l) {
        cv::Mat wIntResized, wDICResized;
        cv::resize(weightInt, wIntResized, lapInt[l].size());
        cv::resize(weightDIC, wDICResized, lapDIC[l].size());

        double scaleFactor = std::pow(2.0, l);
        double transition;
        if (l < 2) {
            transition = 0.3;
        } else {
            transition = 0.7;
        }
        double wI = 1.0 - transition;
        double wD = transition;

        fusedLapX[l] = lapInt[l] * wI + lapDIC[l] * wD;
        fusedLapY[l] = lapInt[l] * wI + lapDIC[l] * wD;

        Q_UNUSED(wIntResized);
        Q_UNUSED(wDICResized);
        Q_UNUSED(scaleFactor);
    }

    gaussInt.clear();
    gaussDIC.clear();
    gaussInt.push_back(gaussInt[levels]);
    gaussDIC.push_back(gaussDIC[levels]);

    for (int l = levels - 1; l >= 0; --l) {
        gaussInt.push_back(cv::Mat());
        gaussDIC.push_back(cv::Mat());
    }

    result.fusedDisplacementX = gaussianReconstruct(fusedLapX);
    result.fusedDisplacementY = gaussianReconstruct(fusedLapY);

    result.interferometryWeight = weightInt.clone();
    result.DICWeight = weightDIC.clone();

    return result;
}

FusionProcessor::FusionResult FusionProcessor::fuseVarianceWeighted(
    const cv::Mat& dispXInt, const cv::Mat& dispYInt,
    const cv::Mat& dispXDIC, const cv::Mat& dispYDIC)
{
    FusionResult result;

    cv::Mat diffX = dispXInt - dispXDIC;
    cv::Mat diffY = dispYInt - dispYDIC;
    cv::Mat diffMag;
    cv::magnitude(diffX, diffY, diffMag);

    cv::Mat varInt = cv::Mat::ones(dispXInt.size(), CV_64F) * 0.1;
    cv::Mat varDIC = cv::Mat::ones(dispXInt.size(), CV_64F) * 1.0;

    for (int y = 0; y < dispXInt.rows; ++y) {
        for (int x = 0; x < dispXInt.cols; ++x) {
            double d = diffMag.at<double>(y, x);
            if (d < m_interferometrySensitivity * 5.0) {
                varInt.at<double>(y, x) = 0.05;
            } else if (d > m_dicRange * 0.1) {
                varInt.at<double>(y, x) = 5.0;
            }

            if (d > m_dicRange * 0.5) {
                varDIC.at<double>(y, x) = 0.1;
            }
        }
    }

    cv::Mat precInt = 1.0 / varInt;
    cv::Mat precDIC = 1.0 / varDIC;

    cv::Mat wInt = precInt / (precInt + precDIC);
    cv::Mat wDIC = precDIC / (precInt + precDIC);

    result.fusedDisplacementX = wInt.mul(dispXInt) + wDIC.mul(dispXDIC);
    result.fusedDisplacementY = wInt.mul(dispYInt) + wDIC.mul(dispYDIC);
    result.interferometryWeight = wInt.clone();
    result.DICWeight = wDIC.clone();

    return result;
}

FusionProcessor::FusionResult FusionProcessor::fuseConfidenceWeighted(
    const cv::Mat& dispXInt, const cv::Mat& dispYInt,
    const cv::Mat& dispXDIC, const cv::Mat& dispYDIC,
    const cv::Mat& confInt, const cv::Mat& confDIC)
{
    FusionResult result;

    cv::Mat wInt = confInt.clone();
    cv::Mat wDIC = confDIC.clone();

    double crossoverDisp = m_interferometrySensitivity * 30.0;

    for (int y = 0; y < dispXInt.rows; ++y) {
        for (int x = 0; x < dispXInt.cols; ++x) {
            double dispMag = std::sqrt(
                dispXInt.at<double>(y, x) * dispXInt.at<double>(y, x) +
                dispYInt.at<double>(y, x) * dispYInt.at<double>(y, x));

            if (dispMag < m_interferometrySensitivity * 2.0) {
                wInt.at<double>(y, x) *= 1.0;
                wDIC.at<double>(y, x) *= 0.2;
            } else if (dispMag > m_dicRange * 0.8) {
                wInt.at<double>(y, x) *= 0.1;
                wDIC.at<double>(y, x) *= 1.0;
            } else {
                double t = (dispMag - m_interferometrySensitivity * 2.0) /
                           (m_dicRange * 0.8 - m_interferometrySensitivity * 2.0);
                t = std::clamp(t, 0.0, 1.0);
                wInt.at<double>(y, x) *= (1.0 - t);
                wDIC.at<double>(y, x) *= t;
            }
        }
    }

    cv::Mat wsum = wInt + wDIC;
    for (int y = 0; y < wsum.rows; ++y) {
        for (int x = 0; x < wsum.cols; ++x) {
            if (wsum.at<double>(y, x) < 1e-10) {
                wInt.at<double>(y, x) = 0.5;
                wDIC.at<double>(y, x) = 0.5;
                wsum.at<double>(y, x) = 1.0;
            }
        }
    }

    result.fusedDisplacementX = wInt.mul(dispXInt) + wDIC.mul(dispXDIC);
    result.fusedDisplacementY = wInt.mul(dispYInt) + wDIC.mul(dispYDIC);
    result.interferometryWeight = wInt / wsum;
    result.DICWeight = wDIC / wsum;

    Q_UNUSED(crossoverDisp);

    return result;
}

cv::Mat FusionProcessor::gaussianDecompose(const cv::Mat& src, int levels,
                                           std::vector<cv::Mat>& gaussian,
                                           std::vector<cv::Mat>& laplacian)
{
    gaussian.clear();
    laplacian.clear();

    cv::Mat current = src.clone();
    gaussian.push_back(current);

    for (int i = 0; i < levels; ++i) {
        cv::Mat down;
        cv::pyrDown(current, down);
        cv::Mat up;
        cv::pyrUp(down, up, current.size());
        cv::Mat lap = current - up;
        laplacian.push_back(lap);
        current = down;
        gaussian.push_back(current);
    }

    return current;
}

cv::Mat FusionProcessor::gaussianReconstruct(const std::vector<cv::Mat>& laplacian) {
    if (laplacian.empty()) return cv::Mat();

    cv::Mat current = laplacian.back().clone();

    for (int i = static_cast<int>(laplacian.size()) - 2; i >= 0; --i) {
        cv::Mat up;
        cv::pyrUp(current, up, laplacian[i].size());
        current = up + laplacian[i];
    }

    return current;
}
