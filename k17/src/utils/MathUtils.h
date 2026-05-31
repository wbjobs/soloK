#ifndef MATHUTILS_H
#define MATHUTILS_H

#include <opencv2/opencv.hpp>
#include <complex>
#include <vector>

namespace MathUtils {

constexpr double PI = 3.14159265358979323846;

cv::Mat gaussianKernel1D(int size, double sigma);
cv::Mat gaussianKernel2D(int size, double sigmaX, double sigmaY);
cv::Mat sobelX();
cv::Mat sobelY();
cv::Mat laplacianKernel();

cv::Mat matToFFTWComplex(const cv::Mat& src);
cv::Mat fftwComplexToMat(const cv::Mat& src);

cv::Mat fft2(const cv::Mat& src);
cv::Mat ifft2(const cv::Mat& src);
cv::Mat fftshift(const cv::Mat& src);
cv::Mat ifftshift(const cv::Mat& src);

cv::Mat gradientX(const cv::Mat& src);
cv::Mat gradientY(const cv::Mat& src);
cv::Mat laplacian(const cv::Mat& src);

double bilinearInterpolate(const cv::Mat& src, double x, double y);

cv::Mat unwrapPhaseSimple(const cv::Mat& wrapped);

cv::Mat medianFilter(const cv::Mat& src, int kernelSize);
cv::Mat gaussianFilter(const cv::Mat& src, int kernelSize, double sigma);

cv::Point2d findSubpixelPeak(const cv::Mat& roi);

std::vector<double> linspace(double start, double end, int num);
std::vector<cv::Point2f> generateCheckerboardPoints(int cols, int rows, double squareSize);

double computeRMSE(const cv::Mat& a, const cv::Mat& b);
double computePSNR(const cv::Mat& a, const cv::Mat& b);

}

#endif
