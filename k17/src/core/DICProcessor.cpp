#include "core/DICProcessor.h"
#include "utils/MathUtils.h"
#include <cmath>
#include <algorithm>
#include <limits>

DICProcessor::DICProcessor(QObject* parent)
    : QObject(parent)
    , m_subsetSize(41)
    , m_stepX(8)
    , m_stepY(8)
    , m_searchRange(20)
    , m_correlationCriterion(ZeroMeanNormalizedCrossCorrelation)
    , m_subpixelMethod(NewtonRaphson)
    , m_maxIterations(30)
    , m_convergenceThreshold(1e-4)
{
}

void DICProcessor::setSubsetSize(int size) { m_subsetSize = (size % 2 == 0) ? size + 1 : size; }
int DICProcessor::subsetSize() const { return m_subsetSize; }

void DICProcessor::setStepSize(int stepX, int stepY) {
    m_stepX = stepX;
    m_stepY = stepY;
}
int DICProcessor::stepX() const { return m_stepX; }
int DICProcessor::stepY() const { return m_stepY; }

void DICProcessor::setSearchRange(int range) { m_searchRange = range; }
int DICProcessor::searchRange() const { return m_searchRange; }

void DICProcessor::setCorrelationCriterion(CorrelationCriterion type) { m_correlationCriterion = type; }
DICProcessor::CorrelationCriterion DICProcessor::correlationCriterion() const { return m_correlationCriterion; }

void DICProcessor::setSubpixelMethod(SubpixelMethod method) { m_subpixelMethod = method; }
DICProcessor::SubpixelMethod DICProcessor::subpixelMethod() const { return m_subpixelMethod; }

void DICProcessor::setMaxIterations(int iter) { m_maxIterations = iter; }
int DICProcessor::maxIterations() const { return m_maxIterations; }

void DICProcessor::setConvergenceThreshold(double threshold) { m_convergenceThreshold = threshold; }
double DICProcessor::convergenceThreshold() const { return m_convergenceThreshold; }

cv::Mat DICProcessor::interpolateSubset(const cv::Mat& image, const cv::Point2d& center,
                                          int halfSize, const cv::Mat& deltaP)
{
    int size = 2 * halfSize + 1;
    cv::Mat subset(size, size, CV_64F);

    double u = 0, v = 0, du_dx = 0, du_dy = 0, dv_dx = 0, dv_dy = 0;
    if (!deltaP.empty() && deltaP.total() >= 6) {
        u = deltaP.at<double>(0, 0);
        v = deltaP.at<double>(1, 0);
        du_dx = deltaP.at<double>(2, 0);
        du_dy = deltaP.at<double>(3, 0);
        dv_dx = deltaP.at<double>(4, 0);
        dv_dy = deltaP.at<double>(5, 0);
    }

    for (int dy = -halfSize; dy <= halfSize; ++dy) {
        for (int dx = -halfSize; dx <= halfSize; ++dx) {
            double xi = dx;
            double eta = dy;
            double xDef = center.x + xi + u + du_dx * xi + du_dy * eta;
            double yDef = center.y + eta + v + dv_dx * xi + dv_dy * eta;

            double val = 0.0;
            if (xDef >= 0 && xDef < image.cols - 1 && yDef >= 0 && yDef < image.rows - 1) {
                int x0 = static_cast<int>(std::floor(xDef));
                int y0 = static_cast<int>(std::floor(yDef));
                double fx = xDef - x0;
                double fy = yDef - y0;

                double v00 = image.at<double>(y0, x0);
                double v10 = image.at<double>(y0, x0 + 1);
                double v01 = image.at<double>(y0 + 1, x0);
                double v11 = image.at<double>(y0 + 1, x0 + 1);

                val = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy)
                    + v01 * (1 - fx) * fy + v11 * fx * fy;
            }
            subset.at<double>(dy + halfSize, dx + halfSize) = val;
        }
    }
    return subset;
}

double DICProcessor::computeZNCC(const cv::Mat& img1, const cv::Mat& img2) {
    if (img1.size() != img2.size() || img1.empty()) return 0.0;

    cv::Scalar mean1, mean2, std1, std2;
    cv::meanStdDev(img1, mean1, std1);
    cv::meanStdDev(img2, mean2, std2);

    double m1 = mean1[0], m2 = mean2[0];
    double s1 = std1[0], s2 = std2[0];

    if (s1 < 1e-10 || s2 < 1e-10) return 0.0;

    double zncc = 0.0;
    int n = img1.rows * img1.cols;
    for (int i = 0; i < img1.rows; ++i) {
        const double* p1 = img1.ptr<double>(i);
        const double* p2 = img2.ptr<double>(i);
        for (int j = 0; j < img1.cols; ++j) {
            zncc += (p1[j] - m1) * (p2[j] - m2);
        }
    }
    return zncc / (n * s1 * s2);
}

double DICProcessor::computeSSD(const cv::Mat& img1, const cv::Mat& img2) {
    if (img1.size() != img2.size() || img1.empty()) return std::numeric_limits<double>::max();
    double ssd = 0.0;
    for (int i = 0; i < img1.rows; ++i) {
        const double* p1 = img1.ptr<double>(i);
        const double* p2 = img2.ptr<double>(i);
        for (int j = 0; j < img1.cols; ++j) {
            double diff = p1[j] - p2[j];
            ssd += diff * diff;
        }
    }
    return ssd;
}

DICProcessor::SubsetResult DICProcessor::computeSubset(
    const cv::Mat& refPatch, const cv::Mat& defSearch,
    const cv::Point2i& refCenter,
    const cv::Point2i& initialGuess)
{
    SubsetResult result;
    result.u = 0;
    result.v = 0;
    result.correlation = 0;
    result.converged = false;

    int halfSize = m_subsetSize / 2;
    cv::Mat refFloat, defFloat;
    refPatch.convertTo(refFloat, CV_64F);
    defSearch.convertTo(defFloat, CV_64F);

    int searchW = defSearch.cols - m_subsetSize + 1;
    int searchH = defSearch.rows - m_subsetSize + 1;

    if (searchW <= 0 || searchH <= 0) {
        return result;
    }

    cv::Mat correlationMap(searchH, searchW, CV_64F);
    double bestCorr = -1e18;
    cv::Point bestLoc(0, 0);

    for (int y = 0; y < searchH; ++y) {
        for (int x = 0; x < searchW; ++x) {
            cv::Rect roi(x, y, m_subsetSize, m_subsetSize);
            cv::Mat defPatch = defFloat(roi);

            double corr;
            if (m_correlationCriterion == ZeroMeanNormalizedCrossCorrelation) {
                corr = computeZNCC(refFloat, defPatch);
            } else if (m_correlationCriterion == CrossCorrelation) {
                cv::matchTemplate(defPatch, refFloat, correlationMap, cv::TM_CCOEFF_NORMED);
                continue;
            } else {
                corr = -computeSSD(refFloat, defPatch);
            }

            correlationMap.at<double>(y, x) = corr;

            if (corr > bestCorr) {
                bestCorr = corr;
                bestLoc = cv::Point(x, y);
            }
        }
    }

    if (bestCorr < -1) return result;

    cv::Point2d subpixel(bestLoc);
    if (m_subpixelMethod == PolynomialFit || m_subpixelMethod == GaussianFit) {
        cv::Rect subRoi(
            std::max(0, bestLoc.x - 1),
            std::max(0, bestLoc.y - 1),
            std::min(3, searchW - std::max(0, bestLoc.x - 1)),
            std::min(3, searchH - std::max(0, bestLoc.y - 1))
        );
        if (subRoi.width >= 3 && subRoi.height >= 3) {
            cv::Mat subRegion = correlationMap(subRoi);
            cv::Point2d localPeak;
            if (m_subpixelMethod == PolynomialFit) {
                localPeak = subpixelPolynomial(subRegion, cv::Point(1, 1));
            } else {
                localPeak = subpixelGaussian(subRegion, cv::Point(1, 1));
            }
            subpixel = cv::Point2d(
                std::max(0, bestLoc.x - 1) + localPeak.x,
                std::max(0, bestLoc.y - 1) + localPeak.y
            );
        }
    } else if (m_subpixelMethod == NewtonRaphson) {
        // Newton-Raphson with shape function (affine: u, v, du/dx, du/dy, dv/dx, dv/dy)
        cv::Mat p = cv::Mat::zeros(6, 1, CV_64F);
        p.at<double>(0, 0) = bestLoc.x + initialGuess.x;
        p.at<double>(1, 0) = bestLoc.y + initialGuess.y;

        for (int iter = 0; iter < m_maxIterations; ++iter) {
            cv::Mat defSubset = interpolateSubset(defFloat, cv::Point2d(
                refCenter.x + p.at<double>(0, 0),
                refCenter.y + p.at<double>(1, 0)), halfSize, p);

            cv::Mat diff = refFloat - defSubset;

            cv::Mat gradX, gradY;
            cv::Sobel(defFloat, gradX, CV_64F, 1, 0, 3);
            cv::Sobel(defFloat, gradY, CV_64F, 0, 1, 3);

            cv::Mat hessian = cv::Mat::zeros(6, 6, CV_64F);
            cv::Mat gradient = cv::Mat::zeros(6, 1, CV_64F);

            for (int sy = 0; sy < m_subsetSize; ++sy) {
                for (int sx = 0; sx < m_subsetSize; ++sx) {
                    double xi = sx - halfSize;
                    double eta = sy - halfSize;
                    double d = diff.at<double>(sy, sx);

                    double px = refCenter.x + p.at<double>(0, 0) + p.at<double>(2, 0) * xi + p.at<double>(3, 0) * eta;
                    double py = refCenter.y + p.at<double>(1, 0) + p.at<double>(4, 0) * xi + p.at<double>(5, 0) * eta;

                    double gx = MathUtils::bilinearInterpolate(gradX, px, py);
                    double gy = MathUtils::bilinearInterpolate(gradY, px, py);

                    double dBdp[6] = { -gx, -gy, -gx * xi, -gx * eta, -gy * xi, -gy * eta };

                    for (int k = 0; k < 6; ++k) {
                        gradient.at<double>(k, 0) += d * dBdp[k];
                        for (int l = 0; l < 6; ++l) {
                            hessian.at<double>(k, l) += dBdp[k] * dBdp[l];
                        }
                    }
                }
            }

            cv::Mat deltaP;
            cv::solve(hessian, gradient, deltaP, cv::DECOMP_SVD);

            p += deltaP;

            double maxDelta = 0;
            for (int k = 0; k < 6; ++k) {
                maxDelta = std::max(maxDelta, std::abs(deltaP.at<double>(k, 0)));
            }
            if (maxDelta < m_convergenceThreshold) {
                break;
            }
        }

        subpixel = cv::Point2d(p.at<double>(0, 0), p.at<double>(1, 0));
    }

    result.u = subpixel.x - bestLoc.x;
    result.v = subpixel.y - bestLoc.y;
    result.correlation = bestCorr;
    result.converged = true;

    return result;
}

cv::Point2d DICProcessor::subpixelPolynomial(const cv::Mat& surface, const cv::Point& peak) {
    if (peak.x <= 0 || peak.x >= surface.cols - 1 ||
        peak.y <= 0 || peak.y >= surface.rows - 1) {
        return cv::Point2d(peak);
    }

    double v00 = surface.at<double>(peak.y - 1, peak.x - 1);
    double v10 = surface.at<double>(peak.y - 1, peak.x);
    double v20 = surface.at<double>(peak.y - 1, peak.x + 1);
    double v01 = surface.at<double>(peak.y, peak.x - 1);
    double v11 = surface.at<double>(peak.y, peak.x);
    double v21 = surface.at<double>(peak.y, peak.x + 1);
    double v02 = surface.at<double>(peak.y + 1, peak.x - 1);
    double v12 = surface.at<double>(peak.y + 1, peak.x);
    double v22 = surface.at<double>(peak.y + 1, peak.x + 1);

    double dx = (v21 - v01) / 2.0;
    double dy = (v12 - v10) / 2.0;
    double dxx = v21 - 2.0 * v11 + v01;
    double dyy = v12 - 2.0 * v11 + v10;
    double dxy = (v22 - v20 - v02 + v00) / 4.0;

    double denom = dxx * dyy - dxy * dxy;
    if (std::abs(denom) < 1e-10) {
        return cv::Point2d(peak);
    }

    double offsetX = (dxy * dy - dyy * dx) / denom;
    double offsetY = (dxy * dx - dxx * dy) / denom;

    return cv::Point2d(peak.x + offsetX, peak.y + offsetY);
}

cv::Point2d DICProcessor::subpixelGaussian(const cv::Mat& surface, const cv::Point& peak) {
    if (peak.x <= 0 || peak.x >= surface.cols - 1 ||
        peak.y <= 0 || peak.y >= surface.rows - 1) {
        return cv::Point2d(peak);
    }

    double c = std::log(std::max(surface.at<double>(peak.y, peak.x), 1e-12));
    double dx = 0, dy = 0;

    double left = surface.at<double>(peak.y, peak.x - 1);
    double right = surface.at<double>(peak.y, peak.x + 1);
    double up = surface.at<double>(peak.y - 1, peak.x);
    double down = surface.at<double>(peak.y + 1, peak.x);

    if (left > 1e-12 && right > 1e-12) {
        double l = std::log(left);
        double r = std::log(right);
        double denom = l - 2.0 * c + r;
        if (std::abs(denom) > 1e-12) {
            dx = 0.5 * (l - r) / denom;
        }
    }
    if (up > 1e-12 && down > 1e-12) {
        double u = std::log(up);
        double d = std::log(down);
        double denom = u - 2.0 * c + d;
        if (std::abs(denom) > 1e-12) {
            dy = 0.5 * (u - d) / denom;
        }
    }

    return cv::Point2d(peak.x + dx, peak.y + dy);
}

DICProcessor::DICResult DICProcessor::compute(const cv::Mat& reference, const cv::Mat& deformed) {
    DICResult result;
    result.valid = false;
    result.stepX = m_stepX;
    result.stepY = m_stepY;
    result.subsetSize = m_subsetSize;

    if (reference.empty() || deformed.empty()) {
        result.errorMessage = "Empty image(s)";
        emit finished(result);
        return result;
    }

    cv::Mat ref, def;
    if (reference.channels() > 1) cv::cvtColor(reference, ref, cv::COLOR_BGR2GRAY);
    else ref = reference.clone();
    if (deformed.channels() > 1) cv::cvtColor(deformed, def, cv::COLOR_BGR2GRAY);
    else def = deformed.clone();

    ref.convertTo(ref, CV_64F);
    def.convertTo(def, CV_64F);

    int halfSize = m_subsetSize / 2;
    int gridCols = (ref.cols - 2 * halfSize) / m_stepX + 1;
    int gridRows = (ref.rows - 2 * halfSize) / m_stepY + 1;

    if (gridCols <= 0 || gridRows <= 0) {
        result.errorMessage = "Image too small for subset size";
        emit finished(result);
        return result;
    }

    result.displacementX = cv::Mat::zeros(gridRows, gridCols, CV_64F);
    result.displacementY = cv::Mat::zeros(gridRows, gridCols, CV_64F);
    result.correlationMap = cv::Mat::zeros(gridRows, gridCols, CV_64F);
    result.convergenceMap = cv::Mat::ones(gridRows, gridCols, CV_8U);
    result.subsets.resize(gridRows);

    cv::Point2i prevDisp(0, 0);

    for (int gy = 0; gy < gridRows; ++gy) {
        result.subsets[gy].resize(gridCols);
        for (int gx = 0; gx < gridCols; ++gx) {
            int cx = halfSize + gx * m_stepX;
            int cy = halfSize + gy * m_stepY;

            cv::Rect refRoi(cx - halfSize, cy - halfSize, m_subsetSize, m_subsetSize);
            cv::Mat refPatch = ref(refRoi);

            int searchX = std::max(0, cx - halfSize - m_searchRange + prevDisp.x);
            int searchY = std::max(0, cy - halfSize - m_searchRange + prevDisp.y);
            int searchW = std::min(m_subsetSize + 2 * m_searchRange, def.cols - searchX);
            int searchH = std::min(m_subsetSize + 2 * m_searchRange, def.rows - searchY);

            if (searchW < m_subsetSize || searchH < m_subsetSize) {
                result.convergenceMap.at<uchar>(gy, gx) = 0;
                continue;
            }

            cv::Rect searchRoi(searchX, searchY, searchW, searchH);
            cv::Mat defSearch = def(searchRoi);

            SubsetResult sr = computeSubset(refPatch, defSearch,
                                           cv::Point2i(cx, cy), prevDisp);

            result.displacementX.at<double>(gy, gx) = sr.u;
            result.displacementY.at<double>(gy, gx) = sr.v;
            result.correlationMap.at<double>(gy, gx) = sr.correlation;
            result.convergenceMap.at<uchar>(gy, gx) = sr.converged ? 1 : 0;
            result.subsets[gy][gx] = sr;

            if (sr.converged) {
                prevDisp = cv::Point2i(static_cast<int>(sr.u), static_cast<int>(sr.v));
            }
        }
        emit progress(static_cast<int>(100.0 * (gy + 1) / gridRows));
    }

    // Upsample to full image resolution
    cv::resize(result.displacementX, result.displacementX,
               cv::Size(ref.cols, ref.rows), 0, 0, cv::INTER_CUBIC);
    cv::resize(result.displacementY, result.displacementY,
               cv::Size(ref.cols, ref.rows), 0, 0, cv::INTER_CUBIC);

    result.valid = true;
    emit finished(result);
    return result;
}
