#include "core/ImageRegistrar.h"
#include "utils/MathUtils.h"
#include <cmath>
#include <algorithm>

ImageRegistrar::ImageRegistrar(QObject* parent)
    : QObject(parent)
    , m_method(PhaseCorrelation)
    , m_maxIterations(200)
{
}

void ImageRegistrar::setMethod(Method method) { m_method = method; }
ImageRegistrar::Method ImageRegistrar::method() const { return m_method; }
void ImageRegistrar::setMaxIterations(int iterations) { m_maxIterations = iterations; }
int ImageRegistrar::maxIterations() const { return m_maxIterations; }

ImageRegistrar::RegistrationResult ImageRegistrar::registerImages(
    const cv::Mat& reference, const cv::Mat& moving)
{
    RegistrationResult result;
    result.success = false;

    if (reference.empty() || moving.empty()) {
        result.errorMessage = "Empty image(s)";
        emit finished(result);
        return result;
    }

    switch (m_method) {
        case PhaseCorrelation:
            result = registerPhaseCorrelation(reference, moving);
            break;
        case FeatureBased:
            result = registerFeature(reference, moving);
            break;
        case ECC:
            result = registerECC(reference, moving);
            break;
        case OpticalFlow:
            result = registerOpticalFlow(reference, moving);
            break;
    }

    if (result.success) {
        result.warped = applyTransform(moving, result.transformMatrix);
    }

    emit progress(100);
    emit finished(result);
    return result;
}

ImageRegistrar::RegistrationResult ImageRegistrar::registerPhaseCorrelation(
    const cv::Mat& reference, const cv::Mat& moving)
{
    RegistrationResult result;

    cv::Mat ref64, mov64;
    if (reference.channels() > 1) {
        cv::cvtColor(reference, ref64, cv::COLOR_BGR2GRAY);
    } else {
        ref64 = reference.clone();
    }
    if (moving.channels() > 1) {
        cv::cvtColor(moving, mov64, cv::COLOR_BGR2GRAY);
    } else {
        mov64 = moving.clone();
    }
    ref64.convertTo(ref64, CV_64F);
    mov64.convertTo(mov64, CV_64F);

    emit progress(10);

    cv::Mat refFFT = MathUtils::fft2(ref64);
    cv::Mat movFFT = MathUtils::fft2(mov64);

    emit progress(25);

    cv::Mat conjRef(refFFT.size(), CV_64FC2);
    for (int y = 0; y < refFFT.rows; ++y) {
        for (int x = 0; x < refFFT.cols; ++x) {
            conjRef.at<cv::Vec2d>(y, x)[0] = refFFT.at<cv::Vec2d>(y, x)[0];
            conjRef.at<cv::Vec2d>(y, x)[1] = -refFFT.at<cv::Vec2d>(y, x)[1];
        }
    }

    cv::Mat crossSpectrum(conjRef.size(), CV_64FC2);
    cv::mulSpectrums(conjRef, movFFT, crossSpectrum, 0, false);

    emit progress(40);

    cv::Mat correlation;
    cv::idft(crossSpectrum, correlation, cv::DFT_REAL_OUTPUT | cv::DFT_SCALE);

    cv::Mat corrShifted = MathUtils::fftshift(correlation);

    cv::Point maxLoc;
    double maxVal;
    cv::minMaxLoc(corrShifted, nullptr, &maxVal, nullptr, &maxLoc);

    int cx = corrShifted.cols / 2;
    int cy = corrShifted.rows / 2;

    result.dx = static_cast<double>(maxLoc.x - cx);
    result.dy = static_cast<double>(maxLoc.y - cy);
    result.rotationAngle = 0.0;
    result.scaleX = 1.0;
    result.scaleY = 1.0;

    result.transformMatrix = cv::Mat::eye(2, 3, CV_64F);
    result.transformMatrix.at<double>(0, 2) = result.dx;
    result.transformMatrix.at<double>(1, 2) = result.dy;

    result.success = true;
    emit progress(50);
    return result;
}

ImageRegistrar::RegistrationResult ImageRegistrar::registerECC(
    const cv::Mat& reference, const cv::Mat& moving)
{
    RegistrationResult result;

    cv::Mat refGray, movGray;
    if (reference.channels() > 1) {
        cv::cvtColor(reference, refGray, cv::COLOR_BGR2GRAY);
    } else {
        refGray = reference.clone();
    }
    if (moving.channels() > 1) {
        cv::cvtColor(moving, movGray, cv::COLOR_BGR2GRAY);
    } else {
        movGray = moving.clone();
    }

    cv::Mat warpMatrix = cv::Mat::eye(2, 3, CV_64F);

    try {
        cv::findTransformECC(refGray, movGray, warpMatrix, cv::MOTION_AFFINE,
                            cv::TermCriteria(cv::TermCriteria::COUNT + cv::TermCriteria::EPS,
                                           m_maxIterations, 1e-6));

        result.dx = warpMatrix.at<double>(0, 2);
        result.dy = warpMatrix.at<double>(1, 2);
        result.rotationAngle = std::atan2(warpMatrix.at<double>(1, 0),
                                          warpMatrix.at<double>(0, 0)) * 180.0 / M_PI;
        result.scaleX = std::sqrt(warpMatrix.at<double>(0, 0) * warpMatrix.at<double>(0, 0) +
                                  warpMatrix.at<double>(0, 1) * warpMatrix.at<double>(0, 1));
        result.scaleY = std::sqrt(warpMatrix.at<double>(1, 0) * warpMatrix.at<double>(1, 0) +
                                  warpMatrix.at<double>(1, 1) * warpMatrix.at<double>(1, 1));
        result.transformMatrix = warpMatrix.clone();
        result.success = true;
    } catch (cv::Exception& e) {
        result.errorMessage = QString::fromStdString(e.what());
        result.success = false;
    }

    emit progress(50);
    return result;
}

ImageRegistrar::RegistrationResult ImageRegistrar::registerFeature(
    const cv::Mat& reference, const cv::Mat& moving)
{
    RegistrationResult result;

    cv::Mat refGray, movGray;
    if (reference.channels() > 1) {
        cv::cvtColor(reference, refGray, cv::COLOR_BGR2GRAY);
    } else {
        refGray = reference.clone();
    }
    if (moving.channels() > 1) {
        cv::cvtColor(moving, movGray, cv::COLOR_BGR2GRAY);
    } else {
        movGray = moving.clone();
    }

    std::vector<cv::KeyPoint> kp1, kp2;
    cv::Mat desc1, desc2;

    cv::Ptr<cv::SIFT> sift = cv::SIFT::create(500);
    sift->detectAndCompute(refGray, cv::noArray(), kp1, desc1);
    sift->detectAndCompute(movGray, cv::noArray(), kp2, desc2);

    if (kp1.empty() || kp2.empty()) {
        result.errorMessage = "No features detected";
        result.success = false;
        return result;
    }

    cv::BFMatcher matcher(cv::NORM_L2);
    std::vector<cv::DMatch> matches;
    matcher.match(desc1, desc2, matches);

    if (matches.size() < 4) {
        result.errorMessage = "Not enough matches";
        result.success = false;
        return result;
    }

    std::sort(matches.begin(), matches.end());
    size_t numGood = std::min(matches.size(), size_t(100));

    std::vector<cv::Point2f> pts1, pts2;
    for (size_t i = 0; i < numGood; ++i) {
        pts1.push_back(kp1[matches[i].queryIdx].pt);
        pts2.push_back(kp2[matches[i].trainIdx].pt);
    }

    cv::Mat mask;
    cv::Mat H = cv::findHomography(pts2, pts1, cv::RANSAC, 3.0, mask);

    if (H.empty()) {
        result.errorMessage = "Homography estimation failed";
        result.success = false;
        return result;
    }

    result.transformMatrix = H(cv::Rect(0, 0, 3, 2)).clone();
    result.dx = result.transformMatrix.at<double>(0, 2);
    result.dy = result.transformMatrix.at<double>(1, 2);
    result.rotationAngle = std::atan2(result.transformMatrix.at<double>(1, 0),
                                      result.transformMatrix.at<double>(0, 0)) * 180.0 / M_PI;
    result.success = true;
    emit progress(50);
    return result;
}

ImageRegistrar::RegistrationResult ImageRegistrar::registerOpticalFlow(
    const cv::Mat& reference, const cv::Mat& moving)
{
    RegistrationResult result;

    cv::Mat refGray, movGray;
    if (reference.channels() > 1) {
        cv::cvtColor(reference, refGray, cv::COLOR_BGR2GRAY);
    } else {
        refGray = reference.clone();
    }
    if (moving.channels() > 1) {
        cv::cvtColor(moving, movGray, cv::COLOR_BGR2GRAY);
    } else {
        movGray = moving.clone();
    }

    refGray.convertTo(refGray, CV_8U);
    movGray.convertTo(movGray, CV_8U);

    cv::Mat flow;
    cv::calcOpticalFlowFarneback(refGray, movGray, flow, 0.5, 3, 15, 3, 5, 1.2, 0);

    cv::Scalar meanFlow = cv::mean(flow);
    result.dx = meanFlow[0];
    result.dy = meanFlow[1];
    result.rotationAngle = 0.0;
    result.scaleX = 1.0;
    result.scaleY = 1.0;

    result.transformMatrix = cv::Mat::eye(2, 3, CV_64F);
    result.transformMatrix.at<double>(0, 2) = result.dx;
    result.transformMatrix.at<double>(1, 2) = result.dy;

    result.success = true;
    emit progress(50);
    return result;
}

cv::Mat ImageRegistrar::applyTransform(const cv::Mat& image, const cv::Mat& transform) {
    if (transform.rows == 2 && transform.cols == 3) {
        cv::Mat result;
        cv::warpAffine(image, result, transform, image.size(),
                      cv::INTER_LINEAR | cv::WARP_INVERSE_MAP);
        return result;
    }
    return image.clone();
}

cv::Mat ImageRegistrar::removeRigidMotion(
    const cv::Mat& displacementX, const cv::Mat& displacementY, const cv::Mat& transform)
{
    cv::Mat correctedX = displacementX.clone();
    cv::Mat correctedY = displacementY.clone();

    if (transform.rows == 2 && transform.cols == 3) {
        double a00 = transform.at<double>(0, 0);
        double a01 = transform.at<double>(0, 1);
        double a02 = transform.at<double>(0, 2);
        double a10 = transform.at<double>(1, 0);
        double a11 = transform.at<double>(1, 1);
        double a12 = transform.at<double>(1, 2);

        for (int y = 0; y < displacementX.rows; ++y) {
            for (int x = 0; x < displacementX.cols; ++x) {
                double rigidX = a00 * x + a01 * y + a02 - x;
                double rigidY = a10 * x + a11 * y + a12 - y;

                correctedX.at<double>(y, x) -= rigidX;
                correctedY.at<double>(y, x) -= rigidY;
            }
        }
    }

    cv::Mat result(displacementX.size(), CV_64FC2);
    cv::merge(std::vector<cv::Mat>{correctedX, correctedY}, result);
    return result;
}
