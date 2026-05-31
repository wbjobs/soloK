#include "core/SpeckleProcessor.h"
#include "utils/MathUtils.h"
#include <cmath>
#include <QDebug>

SpeckleProcessor::SpeckleProcessor(QObject* parent)
    : QObject(parent)
    , m_method(FFT_Phase)
    , m_windowSize(32)
    , m_searchRange(16)
    , m_subpixelEnabled(true)
    , m_fftHighPass(true)
    , m_fftLowPass(true)
{
}

SpeckleProcessor::~SpeckleProcessor() = default;

void SpeckleProcessor::setMethod(Method method) { m_method = method; }
SpeckleProcessor::Method SpeckleProcessor::method() const { return m_method; }
void SpeckleProcessor::setWindowSize(int size) { m_windowSize = size; }
int SpeckleProcessor::windowSize() const { return m_windowSize; }
void SpeckleProcessor::setSearchRange(int range) { m_searchRange = range; }
int SpeckleProcessor::searchRange() const { return m_searchRange; }
void SpeckleProcessor::setSubpixelEnabled(bool enabled) { m_subpixelEnabled = enabled; }
bool SpeckleProcessor::isSubpixelEnabled() const { return m_subpixelEnabled; }
void SpeckleProcessor::setFFTHighPass(bool enabled) { m_fftHighPass = enabled; }
bool SpeckleProcessor::isFFTHighPass() const { return m_fftHighPass; }
void SpeckleProcessor::setFFTLowPass(bool enabled) { m_fftLowPass = enabled; }
bool SpeckleProcessor::isFFTLowPass() const { return m_fftLowPass; }

cv::Mat SpeckleProcessor::preprocessImage(const cv::Mat& image) {
    cv::Mat result;
    if (image.channels() > 1) {
        cv::cvtColor(image, result, cv::COLOR_BGR2GRAY);
    } else {
        result = image.clone();
    }
    result.convertTo(result, CV_64F);

    cv::Mat kernel = MathUtils::gaussianKernel1D(5, 1.5);
    cv::Mat bg;
    cv::sepFilter2D(result, bg, -1, kernel, kernel);
    result = result - bg + 128.0;

    cv::normalize(result, result, 0, 255, cv::NORM_MINMAX);
    return result;
}

SpeckleProcessor::Result SpeckleProcessor::process(const cv::Mat& reference, const cv::Mat& deformed) {
    Result result;
    result.valid = false;

    if (reference.empty() || deformed.empty()) {
        result.errorMessage = "Empty image(s) provided";
        emit finished(result);
        return result;
    }

    cv::Mat ref = preprocessImage(reference);
    cv::Mat def = preprocessImage(deformed);

    emit progress(10);

    if (m_method == FFT_Phase) {
        result.phaseMap = computePhaseMapFFT(ref, def);
        emit progress(60);

        result.unwrappedPhase = MathUtils::unwrapPhaseSimple(result.phaseMap);
        emit progress(80);

        result.displacementX = MathUtils::gradientX(result.unwrappedPhase);
        result.displacementY = MathUtils::gradientY(result.unwrappedPhase);

        cv::magnitude(result.displacementX, result.displacementY, result.magnitude);

    } else {
        result.magnitude = computeDisplacementCorrelation(ref, def);
        emit progress(80);
        result.displacementX = result.magnitude.clone();
        result.displacementY = result.magnitude.clone();
    }

    result.valid = true;
    emit progress(100);
    emit finished(result);
    return result;
}

cv::Mat SpeckleProcessor::computePhaseMapFFT(const cv::Mat& reference, const cv::Mat& deformed) {
    int rows = reference.rows;
    int cols = reference.cols;

    cv::Mat ref64, def64;
    reference.convertTo(ref64, CV_64F);
    deformed.convertTo(def64, CV_64F);

    cv::Mat refFFT, defFFT;
    cv::dft(ref64, refFFT, cv::DFT_COMPLEX_OUTPUT);
    cv::dft(def64, defFFT, cv::DFT_COMPLEX_OUTPUT);

    cv::Mat planes[2];

    if (m_fftHighPass) {
        int cx = refFFT.cols / 2;
        int cy = refFFT.rows / 2;
        int radius = 5;
        cv::Mat mask = cv::Mat::ones(refFFT.size(), CV_64F);
        cv::circle(mask, cv::Point(cx, cy), radius, cv::Scalar(0), -1);
        cv::split(refFFT, planes);
        planes[0] = planes[0].mul(mask);
        planes[1] = planes[1].mul(mask);
        cv::merge(planes, 2, refFFT);
        cv::split(defFFT, planes);
        planes[0] = planes[0].mul(mask);
        planes[1] = planes[1].mul(mask);
        cv::merge(planes, 2, defFFT);
    }

    cv::split(refFFT, planes);
    planes[1] = -planes[1];
    cv::Mat conjRef;
    cv::merge(planes, 2, conjRef);

    cv::Mat crossSpectrum;
    cv::mulSpectrums(conjRef, defFFT, crossSpectrum, 0, false);

    cv::split(crossSpectrum, planes);
    cv::Mat magnitude;
    cv::magnitude(planes[0], planes[1], magnitude);
    for (int y = 0; y < magnitude.rows; ++y) {
        const double* magPtr = magnitude.ptr<double>(y);
        double* rPtr = planes[0].ptr<double>(y);
        double* iPtr = planes[1].ptr<double>(y);
        for (int x = 0; x < magnitude.cols; ++x) {
            double mag = magPtr[x];
            if (mag > 1e-10) {
                rPtr[x] /= mag;
                iPtr[x] /= mag;
            }
        }
    }
    cv::merge(planes, 2, crossSpectrum);

    if (m_fftLowPass) {
        cv::Mat shifted = MathUtils::fftshift(crossSpectrum);
        int cx = shifted.cols / 2;
        int cy = shifted.rows / 2;
        int radius = std::min(rows, cols) / 4;
        cv::split(shifted, planes);
        for (int y = 0; y < shifted.rows; ++y) {
            double* rPtr = planes[0].ptr<double>(y);
            double* iPtr = planes[1].ptr<double>(y);
            for (int x = 0; x < shifted.cols; ++x) {
                double dist = std::sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                if (dist > radius) {
                    rPtr[x] = 0;
                    iPtr[x] = 0;
                }
            }
        }
        cv::merge(planes, 2, shifted);
        crossSpectrum = MathUtils::ifftshift(shifted);
    }

    cv::Mat correlation;
    cv::idft(crossSpectrum, correlation, cv::DFT_COMPLEX_OUTPUT);

    cv::split(correlation, planes);
    cv::Mat phaseMap;
    cv::phase(planes[0], planes[1], phaseMap);

    if (phaseMap.rows != rows || phaseMap.cols != cols) {
        cv::resize(phaseMap, phaseMap, cv::Size(cols, rows));
    }

    return phaseMap;
}

cv::Mat SpeckleProcessor::computeDisplacementCorrelation(const cv::Mat& reference, const cv::Mat& deformed) {
    int rows = reference.rows;
    int cols = reference.cols;
    int step = m_windowSize / 2;

    cv::Mat magnitude = cv::Mat::zeros(rows / step, cols / step, CV_64F);

    for (int by = 0; by + m_windowSize < rows; by += step) {
        for (int bx = 0; bx + m_windowSize < cols; bx += step) {
            cv::Rect roiRef(bx, by, m_windowSize, m_windowSize);
            cv::Mat refPatch = reference(roiRef);

            cv::Rect roiSearch(
                std::max(0, bx - m_searchRange),
                std::max(0, by - m_searchRange),
                std::min(cols, bx + m_windowSize + m_searchRange) - std::max(0, bx - m_searchRange),
                std::min(rows, by + m_windowSize + m_searchRange) - std::max(0, by - m_searchRange)
            );
            cv::Mat defSearch = deformed(roiSearch);

            cv::Mat result;
            cv::matchTemplate(defSearch, refPatch, result, cv::TM_CCOEFF_NORMED);

            cv::Point maxLoc;
            cv::minMaxLoc(result, nullptr, nullptr, nullptr, &maxLoc);

            cv::Point2d subpixelLoc(maxLoc);
            if (m_subpixelEnabled) {
                cv::Rect subRoi(
                    std::max(0, maxLoc.x - 1),
                    std::max(0, maxLoc.y - 1),
                    std::min(3, result.cols - std::max(0, maxLoc.x - 1)),
                    std::min(3, result.rows - std::max(0, maxLoc.y - 1))
                );
                if (subRoi.width >= 3 && subRoi.height >= 3) {
                    cv::Mat subRegion = result(subRoi);
                    subpixelLoc = MathUtils::findSubpixelPeak(subRegion);
                    subpixelLoc.x += std::max(0, maxLoc.x - 1);
                    subpixelLoc.y += std::max(0, maxLoc.y - 1);
                }
            }

            double dx = subpixelLoc.x - roiSearch.x + roiRef.x;
            double dy = subpixelLoc.y - roiSearch.y + roiRef.y;
            double disp = std::sqrt(dx * dx + dy * dy);

            magnitude.at<double>(by / step, bx / step) = disp;
        }
        emit progress(static_cast<int>(30.0 + 50.0 * by / rows));
    }

    cv::resize(magnitude, magnitude, cv::Size(cols, rows), 0, 0, cv::INTER_CUBIC);
    return magnitude;
}
