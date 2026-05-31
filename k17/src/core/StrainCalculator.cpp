#include "core/StrainCalculator.h"
#include "utils/MathUtils.h"
#include <cmath>
#include <algorithm>

StrainCalculator::StrainCalculator(QObject* parent)
    : QObject(parent)
{
}

StrainCalculator::StrainResult StrainCalculator::compute(
    const cv::Mat& displacementX, const cv::Mat& displacementY, double pixelToPhysical)
{
    StrainResult result;
    result.valid = false;

    if (displacementX.empty() || displacementY.empty()) {
        result.errorMessage = "Empty displacement field(s)";
        emit finished(result);
        return result;
    }

    cv::Mat dispX, dispY;
    displacementX.convertTo(dispX, CV_64F);
    displacementY.convertTo(dispY, CV_64F);

    emit progress(10);

    // ---------- Boundary artifact fix: Reflection padding ----------
    // Sobel 算子为 3x3，高斯平滑为 5x5，综合边界影响约为 4 像素
    // 使用镜像填充 (BORDER_REFLECT_101) 消除零填充导致的虚假大应变
    const int BORDER = 4;
    cv::Mat paddedX, paddedY;
    cv::copyMakeBorder(dispX, paddedX, BORDER, BORDER, BORDER, BORDER,
                       cv::BORDER_REFLECT_101);
    cv::copyMakeBorder(dispY, paddedY, BORDER, BORDER, BORDER, BORDER,
                       cv::BORDER_REFLECT_101);

    cv::Mat smoothX = smoothField(paddedX, 5);
    cv::Mat smoothY = smoothField(paddedY, 5);

    emit progress(25);

    // Sobel 计算梯度，使用 BORDER_REFLECT_101 防止边界零填充
    cv::Mat dudx, dudy, dvdx, dvdy;
    cv::Sobel(smoothX, dudx, CV_64F, 1, 0, 3, 1.0, 0.0, cv::BORDER_REFLECT_101);
    cv::Sobel(smoothX, dudy, CV_64F, 0, 1, 3, 1.0, 0.0, cv::BORDER_REFLECT_101);
    cv::Sobel(smoothY, dvdx, CV_64F, 1, 0, 3, 1.0, 0.0, cv::BORDER_REFLECT_101);
    cv::Sobel(smoothY, dvdy, CV_64F, 0, 1, 3, 1.0, 0.0, cv::BORDER_REFLECT_101);

    // 裁剪回原始尺寸（去掉填充的边界）
    cv::Rect roi(BORDER, BORDER, dispX.cols, dispX.rows);
    dudx = dudx(roi).clone();
    dudy = dudy(roi).clone();
    dvdx = dvdx(roi).clone();
    dvdy = dvdy(roi).clone();

    emit progress(40);

    result.exx = dudx * pixelToPhysical;
    result.eyy = dvdy * pixelToPhysical;
    result.exy = (dudy + dvdx) * 0.5 * pixelToPhysical;

    emit progress(60);

    result.e1 = cv::Mat::zeros(result.exx.size(), CV_64F);
    result.e2 = cv::Mat::zeros(result.exx.size(), CV_64F);
    result.maxShear = cv::Mat::zeros(result.exx.size(), CV_64F);
    result.principalAngle = cv::Mat::zeros(result.exx.size(), CV_64F);
    result.vonMises = cv::Mat::zeros(result.exx.size(), CV_64F);

    // 用于边界异常值抑制的统计阈值：基于内部区域的标准差
    // 内部区域：距离边界至少 BORDER 像素
    int innerBorder = std::min(BORDER, std::min(result.exx.rows, result.exx.cols) / 6);
    cv::Rect innerRoi(innerBorder, innerBorder,
                      result.exx.cols - 2 * innerBorder,
                      result.exx.rows - 2 * innerBorder);
    if (innerRoi.width > 2 && innerRoi.height > 2) {
        cv::Scalar innerMean, innerStd;
        cv::meanStdDev(result.exx(innerRoi), innerMean, innerStd);
        double threshold = std::abs(innerMean[0]) + 5.0 * std::abs(innerStd[0]);

        // 边界区域：若应变值超过阈值，替换为内推值
        for (int y = 0; y < result.exx.rows; ++y) {
            for (int x = 0; x < result.exx.cols; ++x) {
                bool isBoundary = (x < innerBorder || x >= result.exx.cols - innerBorder
                                  || y < innerBorder || y >= result.exx.rows - innerBorder);
                if (isBoundary) {
                    if (std::abs(result.exx.at<double>(y, x)) > threshold) result.exx.at<double>(y, x) = 0.0;
                    if (std::abs(result.eyy.at<double>(y, x)) > threshold) result.eyy.at<double>(y, x) = 0.0;
                    if (std::abs(result.exy.at<double>(y, x)) > threshold) result.exy.at<double>(y, x) = 0.0;
                }
            }
        }

        // 对抑制后的边界再做一次轻度局部均值平滑，进一步消除不连续
        cv::Mat tmpExx = result.exx.clone();
        cv::Mat tmpEyy = result.eyy.clone();
        cv::Mat tmpExy = result.exy.clone();
        cv::blur(tmpExx, result.exx, cv::Size(3, 3), cv::Point(-1, -1), cv::BORDER_REFLECT_101);
        cv::blur(tmpEyy, result.eyy, cv::Size(3, 3), cv::Point(-1, -1), cv::BORDER_REFLECT_101);
        cv::blur(tmpExy, result.exy, cv::Size(3, 3), cv::Point(-1, -1), cv::BORDER_REFLECT_101);
    }

    for (int y = 0; y < result.exx.rows; ++y) {
        for (int x = 0; x < result.exx.cols; ++x) {
            double ex = result.exx.at<double>(y, x);
            double ey = result.eyy.at<double>(y, x);
            double gamma = 2.0 * result.exy.at<double>(y, x);

            double avg = 0.5 * (ex + ey);
            double diff = 0.5 * (ex - ey);
            double r = std::sqrt(diff * diff + (gamma * 0.5) * (gamma * 0.5));

            result.e1.at<double>(y, x) = avg + r;
            result.e2.at<double>(y, x) = avg - r;
            result.maxShear.at<double>(y, x) = 2.0 * r;

            if (std::abs(ex - ey) > 1e-12) {
                result.principalAngle.at<double>(y, x) = 0.5 * std::atan2(gamma, ex - ey) * 180.0 / M_PI;
            }

            double vm = std::sqrt(ex * ex - ex * ey + ey * ey + 3.0 * result.exy.at<double>(y, x) * result.exy.at<double>(y, x));
            result.vonMises.at<double>(y, x) = vm;
        }
    }

    emit progress(80);

    result.averageExx = cv::mean(result.exx)[0];
    result.averageEyy = cv::mean(result.eyy)[0];
    result.averageExy = cv::mean(result.exy)[0];
    result.averageVonMises = cv::mean(result.vonMises)[0];

    cv::minMaxLoc(result.e1, nullptr, &result.maxPrincipalStrain);
    cv::minMaxLoc(result.e2, &result.minPrincipalStrain, nullptr);
    cv::minMaxLoc(result.maxShear, nullptr, &result.maxShearStrain);

    result.valid = true;
    emit progress(100);
    emit finished(result);
    return result;
}

cv::Mat StrainCalculator::computeGradient(const cv::Mat& src, bool isX) {
    cv::Mat result;
    if (isX) {
        cv::Sobel(src, result, CV_64F, 1, 0, 3);
    } else {
        cv::Sobel(src, result, CV_64F, 0, 1, 3);
    }
    return result;
}

cv::Mat StrainCalculator::smoothField(const cv::Mat& field, int kernelSize) {
    cv::Mat result;
    cv::GaussianBlur(field, result, cv::Size(kernelSize, kernelSize), 0);
    return result;
}

StrainCalculator::ROIResult StrainCalculator::computeROIStatistics(
    const StrainResult& strain, cv::Rect roi)
{
    ROIResult result = {};

    if (roi.x < 0) roi.x = 0;
    if (roi.y < 0) roi.y = 0;
    if (roi.x + roi.width > strain.exx.cols) roi.width = strain.exx.cols - roi.x;
    if (roi.y + roi.height > strain.exx.rows) roi.height = strain.exx.rows - roi.y;

    if (roi.width <= 0 || roi.height <= 0) {
        result.numPixels = 0;
        return result;
    }

    cv::Mat exxRoi = strain.exx(roi);
    cv::Mat eyyRoi = strain.eyy(roi);
    cv::Mat exyRoi = strain.exy(roi);
    cv::Mat e1Roi = strain.e1(roi);
    cv::Mat e2Roi = strain.e2(roi);
    cv::Mat maxShearRoi = strain.maxShear(roi);
    cv::Mat vmRoi = strain.vonMises(roi);
    cv::Mat angleRoi = strain.principalAngle(roi);

    result.averageExx = cv::mean(exxRoi)[0];
    result.averageEyy = cv::mean(eyyRoi)[0];
    result.averageExy = cv::mean(exyRoi)[0];
    result.averageE1 = cv::mean(e1Roi)[0];
    result.averageE2 = cv::mean(e2Roi)[0];
    result.averageMaxShear = cv::mean(maxShearRoi)[0];
    result.averageVonMises = cv::mean(vmRoi)[0];
    result.principalDirection = cv::mean(angleRoi)[0];

    cv::minMaxLoc(exxRoi, &result.minExx, &result.maxExx);
    cv::minMaxLoc(eyyRoi, &result.minEyy, &result.maxEyy);

    result.numPixels = roi.width * roi.height;
    return result;
}
