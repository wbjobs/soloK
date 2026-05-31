#include "utils/MathUtils.h"
#include <fftw3.h>
#include <cmath>
#include <algorithm>
#include <numeric>

namespace MathUtils {

cv::Mat gaussianKernel1D(int size, double sigma) {
    cv::Mat kernel(1, size, CV_64F);
    double sum = 0.0;
    int half = size / 2;
    for (int i = 0; i < size; ++i) {
        double x = i - half;
        double val = std::exp(-(x * x) / (2.0 * sigma * sigma));
        kernel.at<double>(0, i) = val;
        sum += val;
    }
    kernel /= sum;
    return kernel;
}

cv::Mat gaussianKernel2D(int size, double sigmaX, double sigmaY) {
    cv::Mat kernel(size, size, CV_64F);
    double sum = 0.0;
    int half = size / 2;
    for (int y = 0; y < size; ++y) {
        for (int x = 0; x < size; ++x) {
            double dx = x - half;
            double dy = y - half;
            double val = std::exp(-(dx * dx) / (2.0 * sigmaX * sigmaX)
                                  - (dy * dy) / (2.0 * sigmaY * sigmaY));
            kernel.at<double>(y, x) = val;
            sum += val;
        }
    }
    kernel /= sum;
    return kernel;
}

cv::Mat sobelX() {
    return (cv::Mat_<double>(3, 3) <<
            -1, 0, 1,
            -2, 0, 2,
            -1, 0, 1) / 8.0;
}

cv::Mat sobelY() {
    return (cv::Mat_<double>(3, 3) <<
            -1, -2, -1,
             0,  0,  0,
             1,  2,  1) / 8.0;
}

cv::Mat laplacianKernel() {
    return (cv::Mat_<double>(3, 3) <<
            0,  1, 0,
            1, -4, 1,
            0,  1, 0);
}

cv::Mat fft2(const cv::Mat& src) {
    cv::Mat padded;
    int optRows = cv::getOptimalDFTSize(src.rows);
    int optCols = cv::getOptimalDFTSize(src.cols);
    cv::copyMakeBorder(src, padded, 0, optRows - src.rows,
                       0, optCols - src.cols, cv::BORDER_CONSTANT, cv::Scalar::all(0));

    cv::Mat complex;
    cv::dft(padded, complex, cv::DFT_COMPLEX_OUTPUT);
    return complex;
}

cv::Mat ifft2(const cv::Mat& src) {
    cv::Mat result;
    cv::idft(src, result, cv::DFT_REAL_OUTPUT | cv::DFT_SCALE);
    return result;
}

cv::Mat fftshift(const cv::Mat& src) {
    cv::Mat result = src.clone();
    int cx = result.cols / 2;
    int cy = result.rows / 2;
    cv::Mat q0(result, cv::Rect(0, 0, cx, cy));
    cv::Mat q1(result, cv::Rect(cx, 0, cx, cy));
    cv::Mat q2(result, cv::Rect(0, cy, cx, cy));
    cv::Mat q3(result, cv::Rect(cx, cy, cx, cy));
    cv::Mat tmp;
    q0.copyTo(tmp); q3.copyTo(q0); tmp.copyTo(q3);
    q1.copyTo(tmp); q2.copyTo(q1); tmp.copyTo(q2);
    return result;
}

cv::Mat ifftshift(const cv::Mat& src) {
    return fftshift(src);
}

cv::Mat gradientX(const cv::Mat& src) {
    cv::Mat kernel = sobelX();
    cv::Mat result;
    cv::filter2D(src, result, CV_64F, kernel);
    return result;
}

cv::Mat gradientY(const cv::Mat& src) {
    cv::Mat kernel = sobelY();
    cv::Mat result;
    cv::filter2D(src, result, CV_64F, kernel);
    return result;
}

cv::Mat laplacian(const cv::Mat& src) {
    cv::Mat kernel = laplacianKernel();
    cv::Mat result;
    cv::filter2D(src, result, CV_64F, kernel);
    return result;
}

double bilinearInterpolate(const cv::Mat& src, double x, double y) {
    int x0 = static_cast<int>(std::floor(x));
    int y0 = static_cast<int>(std::floor(y));
    int x1 = std::min(x0 + 1, src.cols - 1);
    int y1 = std::min(y0 + 1, src.rows - 1);
    x0 = std::max(x0, 0);
    y0 = std::max(y0, 0);

    double dx = x - x0;
    double dy = y - y0;

    double v00 = src.at<double>(y0, x0);
    double v10 = src.at<double>(y0, x1);
    double v01 = src.at<double>(y1, x0);
    double v11 = src.at<double>(y1, x1);

    double v0 = v00 * (1 - dx) + v10 * dx;
    double v1 = v01 * (1 - dx) + v11 * dx;
    return v0 * (1 - dy) + v1 * dy;
}

cv::Mat unwrapPhaseSimple(const cv::Mat& wrapped) {
    cv::Mat unwrapped = wrapped.clone();
    double threshold = PI * 0.8;

    for (int y = 0; y < unwrapped.rows; ++y) {
        for (int x = 1; x < unwrapped.cols; ++x) {
            double diff = unwrapped.at<double>(y, x) - unwrapped.at<double>(y, x - 1);
            if (diff > threshold) {
                for (int k = x; k < unwrapped.cols; ++k)
                    unwrapped.at<double>(y, k) -= 2.0 * PI;
            } else if (diff < -threshold) {
                for (int k = x; k < unwrapped.cols; ++k)
                    unwrapped.at<double>(y, k) += 2.0 * PI;
            }
        }
    }

    for (int x = 0; x < unwrapped.cols; ++x) {
        for (int y = 1; y < unwrapped.rows; ++y) {
            double diff = unwrapped.at<double>(y, x) - unwrapped.at<double>(y - 1, x);
            if (diff > threshold) {
                for (int k = y; k < unwrapped.rows; ++k)
                    unwrapped.at<double>(k, x) -= 2.0 * PI;
            } else if (diff < -threshold) {
                for (int k = y; k < unwrapped.rows; ++k)
                    unwrapped.at<double>(k, x) += 2.0 * PI;
            }
        }
    }

    return unwrapped;
}

cv::Mat medianFilter(const cv::Mat& src, int kernelSize) {
    cv::Mat result;
    cv::medianBlur(src, result, kernelSize);
    return result;
}

cv::Mat gaussianFilter(const cv::Mat& src, int kernelSize, double sigma) {
    cv::Mat result;
    cv::GaussianBlur(src, result, cv::Size(kernelSize, kernelSize), sigma);
    return result;
}

cv::Point2d findSubpixelPeak(const cv::Mat& roi) {
    cv::Point maxLoc;
    double maxVal;
    cv::minMaxLoc(roi, nullptr, &maxVal, nullptr, &maxLoc);

    if (maxLoc.x <= 0 || maxLoc.x >= roi.cols - 1 ||
        maxLoc.y <= 0 || maxLoc.y >= roi.rows - 1) {
        return cv::Point2d(maxLoc);
    }

    double v00 = roi.at<double>(maxLoc.y - 1, maxLoc.x - 1);
    double v10 = roi.at<double>(maxLoc.y - 1, maxLoc.x);
    double v20 = roi.at<double>(maxLoc.y - 1, maxLoc.x + 1);
    double v01 = roi.at<double>(maxLoc.y, maxLoc.x - 1);
    double v11 = roi.at<double>(maxLoc.y, maxLoc.x);
    double v21 = roi.at<double>(maxLoc.y, maxLoc.x + 1);
    double v02 = roi.at<double>(maxLoc.y + 1, maxLoc.x - 1);
    double v12 = roi.at<double>(maxLoc.y + 1, maxLoc.x);
    double v22 = roi.at<double>(maxLoc.y + 1, maxLoc.x + 1);

    double dx = (v21 - v01) / 2.0;
    double dy = (v12 - v10) / 2.0;
    double dxx = v21 - 2.0 * v11 + v01;
    double dyy = v12 - 2.0 * v11 + v10;
    double dxy = (v22 - v20 - v02 + v00) / 4.0;

    double denom = dxx * dyy - dxy * dxy;
    if (std::abs(denom) < 1e-10) {
        return cv::Point2d(maxLoc);
    }

    double offsetX = (dxy * dy - dyy * dx) / denom;
    double offsetY = (dxy * dx - dxx * dy) / denom;

    return cv::Point2d(maxLoc.x + offsetX, maxLoc.y + offsetY);
}

std::vector<double> linspace(double start, double end, int num) {
    std::vector<double> result(num);
    if (num <= 1) {
        result[0] = start;
        return result;
    }
    double step = (end - start) / (num - 1);
    for (int i = 0; i < num; ++i) {
        result[i] = start + i * step;
    }
    return result;
}

std::vector<cv::Point2f> generateCheckerboardPoints(int cols, int rows, double squareSize) {
    std::vector<cv::Point2f> points;
    for (int r = 0; r < rows; ++r) {
        for (int c = 0; c < cols; ++c) {
            points.emplace_back(c * squareSize, r * squareSize);
        }
    }
    return points;
}

double computeRMSE(const cv::Mat& a, const cv::Mat& b) {
    cv::Mat diff;
    cv::absdiff(a, b, diff);
    diff = diff.mul(diff);
    double mse = cv::mean(diff)[0];
    return std::sqrt(mse);
}

double computePSNR(const cv::Mat& a, const cv::Mat& b) {
    double rmse = computeRMSE(a, b);
    if (rmse < 1e-10) return 100.0;
    return 20.0 * std::log10(255.0 / rmse);
}

}
