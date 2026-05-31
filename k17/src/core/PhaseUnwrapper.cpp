#include "core/PhaseUnwrapper.h"
#include "utils/MathUtils.h"
#include <cmath>
#include <queue>
#include <algorithm>
#include <limits>
#include <vector>

PhaseUnwrapper::PhaseUnwrapper(QObject* parent)
    : QObject(parent)
    , m_method(LeastSquares)
    , m_maxIterations(1000)
{
}

void PhaseUnwrapper::setMethod(Method method) { m_method = method; }
PhaseUnwrapper::Method PhaseUnwrapper::method() const { return m_method; }
void PhaseUnwrapper::setMaxIterations(int iterations) { m_maxIterations = iterations; }
int PhaseUnwrapper::maxIterations() const { return m_maxIterations; }

double PhaseUnwrapper::wrapToPi(double value) {
    while (value > M_PI) value -= 2.0 * M_PI;
    while (value < -M_PI) value += 2.0 * M_PI;
    return value;
}

PhaseUnwrapper::Result PhaseUnwrapper::unwrap(const cv::Mat& wrapped) {
    Result result;
    result.valid = false;

    if (wrapped.empty()) {
        result.errorMessage = "Empty phase map";
        emit finished(result);
        return result;
    }

    switch (m_method) {
        case SimpleRowColumn:
            result.unwrapped = unwrapSimple(wrapped);
            break;
        case LeastSquares:
            result.unwrapped = unwrapLeastSquares(wrapped);
            break;
        case BranchCut:
            result.unwrapped = unwrapBranchCut(wrapped);
            break;
        case QualityGuided:
            result.unwrapped = unwrapQualityGuided(wrapped);
            break;
    }

    result.valid = true;
    emit progress(100);
    emit finished(result);
    return result;
}

cv::Mat PhaseUnwrapper::unwrapSimple(const cv::Mat& wrapped) {
    cv::Mat unwrapped = wrapped.clone();
    double threshold = M_PI * 0.8;

    for (int y = 0; y < unwrapped.rows; ++y) {
        for (int x = 1; x < unwrapped.cols; ++x) {
            double diff = wrapToPi(unwrapped.at<double>(y, x) - unwrapped.at<double>(y, x - 1));
            if (diff > threshold) {
                for (int k = x; k < unwrapped.cols; ++k)
                    unwrapped.at<double>(y, k) -= 2.0 * M_PI;
            } else if (diff < -threshold) {
                for (int k = x; k < unwrapped.cols; ++k)
                    unwrapped.at<double>(y, k) += 2.0 * M_PI;
            }
        }
    }

    for (int x = 0; x < unwrapped.cols; ++x) {
        for (int y = 1; y < unwrapped.rows; ++y) {
            double diff = wrapToPi(unwrapped.at<double>(y, x) - unwrapped.at<double>(y - 1, x));
            if (diff > threshold) {
                for (int k = y; k < unwrapped.rows; ++k)
                    unwrapped.at<double>(k, x) -= 2.0 * M_PI;
            } else if (diff < -threshold) {
                for (int k = y; k < unwrapped.rows; ++k)
                    unwrapped.at<double>(k, x) += 2.0 * M_PI;
            }
        }
    }

    emit progress(100);
    return unwrapped;
}

cv::Mat PhaseUnwrapper::unwrapLeastSquares(const cv::Mat& wrapped) {
    int rows = wrapped.rows;
    int cols = wrapped.cols;

    cv::Mat dx(rows, cols, CV_64F, cv::Scalar(0));
    cv::Mat dy(rows, cols, CV_64F, cv::Scalar(0));

    for (int y = 0; y < rows; ++y) {
        for (int x = 1; x < cols; ++x) {
            dx.at<double>(y, x) = wrapToPi(wrapped.at<double>(y, x) - wrapped.at<double>(y, x - 1));
        }
    }
    for (int x = 0; x < cols; ++x) {
        for (int y = 1; y < rows; ++y) {
            dy.at<double>(y, x) = wrapToPi(wrapped.at<double>(y, x) - wrapped.at<double>(y - 1, x));
        }
    }

    cv::Mat rho(rows, cols, CV_64F, cv::Scalar(0));
    for (int y = 1; y < rows; ++y) {
        for (int x = 1; x < cols; ++x) {
            rho.at<double>(y, x) = dx.at<double>(y, x) - dx.at<double>(y, x - 1)
                                + dy.at<double>(y, x) - dy.at<double>(y - 1, x);
        }
    }

    cv::Mat phi = cv::Mat::zeros(rows, cols, CV_64F);

    for (int iter = 0; iter < m_maxIterations; ++iter) {
        double maxChange = 0;
        for (int y = 1; y < rows - 1; ++y) {
            for (int x = 1; x < cols - 1; ++x) {
                double old = phi.at<double>(y, x);
                phi.at<double>(y, x) = 0.25 * (phi.at<double>(y, x - 1) + phi.at<double>(y, x + 1)
                                              + phi.at<double>(y - 1, x) + phi.at<double>(y + 1, x)
                                              - rho.at<double>(y, x));
                maxChange = std::max(maxChange, std::abs(phi.at<double>(y, x) - old));
            }
        }
        emit progress(static_cast<int>(100.0 * iter / m_maxIterations));
        if (maxChange < 1e-6) break;
    }

    double avgWrapped = cv::mean(wrapped)[0];
    double avgPhi = cv::mean(phi)[0];
    phi += (avgWrapped - avgPhi);

    return phi;
}

cv::Mat PhaseUnwrapper::unwrapBranchCut(const cv::Mat& wrapped) {
    int rows = wrapped.rows;
    int cols = wrapped.cols;
    int total = rows * cols;

    cv::Mat quality = computeQualityMap(wrapped);

    // ---------- Step 1: 检测残差点 (Residue Detection) ----------
    // 残差点位于 2x2 单元的右上角像素处
    // 正残差 (+1)：2x2 单元相位环绕和 > 0 (顺时针包裹)
    // 负残差 (-1)：2x2 单元相位环绕和 < 0 (逆时针包裹)
    cv::Mat residue = cv::Mat::zeros(rows, cols, CV_8S); // signed char: +1, -1, 0
    std::vector<cv::Point> posResidues, negResidues;

    for (int y = 0; y < rows - 1; ++y) {
        for (int x = 0; x < cols - 1; ++x) {
            double p1 = wrapped.at<double>(y, x);             // TL
            double p2 = wrapped.at<double>(y, x + 1);         // TR
            double p3 = wrapped.at<double>(y + 1, x + 1);     // BR
            double p4 = wrapped.at<double>(y + 1, x);         // BL

            double wrapSum = wrapToPi(p2 - p1) + wrapToPi(p3 - p2)
                            + wrapToPi(p4 - p3) + wrapToPi(p1 - p4);

            if (wrapSum > M_PI * 0.5) {
                residue.at<schar>(y, x + 1) = +1;
                posResidues.emplace_back(x + 1, y);
            } else if (wrapSum < -M_PI * 0.5) {
                residue.at<schar>(y, x + 1) = -1;
                negResidues.emplace_back(x + 1, y);
            }
        }
    }

    // ---------- Step 2: 构建枝切线 (Branch Cut Construction) ----------
    // 使用局部贪心配对：将每个正残差与最近的负残差配对，绘制枝切线
    // 枝切线：像素标记为不可穿越，解包裹泛洪遇到时停止
    cv::Mat branchMask = cv::Mat::zeros(rows, cols, CV_8U); // 1 = branch cut

    // 配对残差：近邻优先
    std::vector<bool> posPaired(posResidues.size(), false);
    std::vector<bool> negPaired(negResidues.size(), false);
    double maxPairDist = std::max(rows, cols) * 0.25;

    for (size_t i = 0; i < posResidues.size(); ++i) {
        if (posPaired[i]) continue;
        double bestDist = std::numeric_limits<double>::max();
        int bestJ = -1;
        for (size_t j = 0; j < negResidues.size(); ++j) {
            if (negPaired[j]) continue;
            double dx = posResidues[i].x - negResidues[j].x;
            double dy = posResidues[i].y - negResidues[j].y;
            double dist = std::sqrt(dx * dx + dy * dy);
            if (dist < bestDist && dist < maxPairDist) {
                bestDist = dist;
                bestJ = static_cast<int>(j);
            }
        }
        if (bestJ >= 0) {
            posPaired[i] = true;
            negPaired[bestJ] = true;
            // 绘制枝切线（连接两个残差点的直线）
            cv::Point a = posResidues[i];
            cv::Point b = negResidues[bestJ];
            int nSteps = static_cast<int>(cv::norm(b - a)) + 1;
            for (int k = 0; k <= nSteps; ++k) {
                double t = static_cast<double>(k) / nSteps;
                int px = static_cast<int>(a.x + (b.x - a.x) * t);
                int py = static_cast<int>(a.y + (b.y - a.y) * t);
                if (px >= 0 && px < cols && py >= 0 && py < rows) {
                    branchMask.at<uchar>(py, px) = 1;
                }
            }
        } else {
            // 未配对的正残差 -> 连接到边界
            cv::Point a = posResidues[i];
            cv::Point b(a.x, 0);
            for (int y = a.y; y >= 0; --y) branchMask.at<uchar>(y, a.x) = 1;
        }
    }
    // 未配对的负残差 -> 连接到边界
    for (size_t j = 0; j < negResidues.size(); ++j) {
        if (!negPaired[j]) {
            cv::Point a = negResidues[j];
            for (int y = a.y; y < rows; ++y) branchMask.at<uchar>(y, a.x) = 1;
        }
    }

    // 将残差点本身也标记为枝切线
    for (const auto& p : posResidues) branchMask.at<uchar>(p) = 1;
    for (const auto& p : negResidues) branchMask.at<uchar>(p) = 1;

    // ---------- Step 3: 质量引导泛洪解包裹 (Quality-Guided Flood Fill) ----------
    // 从高质量像素开始，使用优先队列按质量降序展开
    // 遇到枝切线或低质量像素时不跨越，从而避免孤岛效应
    cv::Mat unwrapped = cv::Mat::zeros(rows, cols, CV_64F);
    cv::Mat visited = cv::Mat::zeros(rows, cols, CV_8U);
    cv::Mat qualityMask = cv::Mat::ones(rows, cols, CV_8U); // 0 = invalid / low quality

    // 标记极低质量像素为无效（信噪比<3dB 对应的梯度阈值）
    double qualityThreshold = 0.15;
    for (int y = 0; y < rows; ++y) {
        for (int x = 0; x < cols; ++x) {
            if (quality.at<double>(y, x) < qualityThreshold) {
                qualityMask.at<uchar>(y, x) = 0;
            }
        }
    }

    // 使用优先队列（最大堆）：按质量值排序
    using PQElement = std::pair<double, cv::Point>;
    std::priority_queue<PQElement> pq;

    // 寻找最佳起点（质量最高、非残差、非枝切线的像素）
    cv::Point bestPoint(-1, -1);
    double bestQuality = -1;
    for (int y = 0; y < rows; ++y) {
        for (int x = 0; x < cols; ++x) {
            if (branchMask.at<uchar>(y, x)) continue;
            if (!qualityMask.at<uchar>(y, x)) continue;
            double q = quality.at<double>(y, x);
            if (q > bestQuality) {
                bestQuality = q;
                bestPoint = cv::Point(x, y);
            }
        }
    }

    if (bestPoint.x < 0) {
        // 找不到有效起点，退回质量引导法
        return unwrapQualityGuided(wrapped);
    }

    visited.at<uchar>(bestPoint) = 1;
    unwrapped.at<double>(bestPoint) = wrapped.at<double>(bestPoint);
    pq.push({bestQuality, bestPoint});

    int count = 1;

    while (!pq.empty()) {
        auto top = pq.top();
        pq.pop();
        cv::Point current = top.second;

        std::vector<cv::Point> neighbors = {
            {current.x + 1, current.y},
            {current.x - 1, current.y},
            {current.x, current.y + 1},
            {current.x, current.y - 1}
        };

        for (const auto& neighbor : neighbors) {
            int nx = neighbor.x, ny = neighbor.y;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            if (visited.at<uchar>(ny, nx)) continue;
            // 不穿越枝切线
            if (branchMask.at<uchar>(ny, nx)) continue;

            double diff = wrapToPi(wrapped.at<double>(ny, nx)
                                    - wrapped.at<double>(current.y, current.x));
            unwrapped.at<double>(ny, nx) = unwrapped.at<double>(current.y, current.x) + diff;
            visited.at<uchar>(ny, nx) = 1;
            pq.push({quality.at<double>(ny, nx), neighbor});
            count++;
        }
        emit progress(static_cast<int>(100.0 * count / total));
    }

    // ---------- Step 4: 处理未访问的孤岛区域 ----------
    // 对于未访问的像素，使用局部邻域均值估计（最小化孤岛不连续）
    cv::Mat finalUnwrapped = unwrapped.clone();
    for (int y = 0; y < rows; ++y) {
        for (int x = 0; x < cols; ++x) {
            if (!visited.at<uchar>(y, x)) {
                // 寻找最近的已访问邻域
                double sumVal = 0.0;
                int nCnt = 0;
                for (int dy = -1; dy <= 1; ++dy) {
                    for (int dx = -1; dx <= 1; ++dx) {
                        int nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows
                            && visited.at<uchar>(ny, nx)) {
                            sumVal += unwrapped.at<double>(ny, nx)
                                    + wrapToPi(wrapped.at<double>(y, x)
                                               - wrapped.at<double>(ny, nx));
                            nCnt++;
                        }
                    }
                }
                if (nCnt > 0) {
                    finalUnwrapped.at<double>(y, x) = sumVal / nCnt;
                } else {
                    finalUnwrapped.at<double>(y, x) = wrapped.at<double>(y, x);
                }
                visited.at<uchar>(y, x) = 1;
            }
        }
    }

    return finalUnwrapped;
}

cv::Mat PhaseUnwrapper::unwrapQualityGuided(const cv::Mat& wrapped) {
    int rows = wrapped.rows;
    int cols = wrapped.cols;

    cv::Mat quality = computeQualityMap(wrapped);
    cv::Mat unwrapped = cv::Mat::zeros(rows, cols, CV_64F);
    cv::Mat processed = cv::Mat::zeros(rows, cols, CV_8U);

    std::vector<cv::Point> points;
    for (int y = 0; y < rows; ++y) {
        for (int x = 0; x < cols; ++x) {
            points.emplace_back(x, y);
        }
    }

    std::sort(points.begin(), points.end(), [&](const cv::Point& a, const cv::Point& b) {
        return quality.at<double>(a) > quality.at<double>(b);
    });

    unwrapped.at<double>(points[0]) = wrapped.at<double>(points[0]);
    processed.at<uchar>(points[0]) = 1;

    for (size_t i = 1; i < points.size(); ++i) {
        cv::Point p = points[i];

        double bestVal = unwrapped.at<double>(p);
        bool foundNeighbor = false;

        std::vector<cv::Point> neighbors = {
            {p.x + 1, p.y}, {p.x - 1, p.y},
            {p.x, p.y + 1}, {p.x, p.y - 1}
        };

        for (const auto& n : neighbors) {
            if (n.x < 0 || n.x >= cols || n.y < 0 || n.y >= rows) continue;
            if (!processed.at<uchar>(n)) continue;

            double diff = wrapToPi(wrapped.at<double>(p) - wrapped.at<double>(n));
            double candidate = unwrapped.at<double>(n) + diff;
            if (!foundNeighbor) {
                bestVal = candidate;
                foundNeighbor = true;
            } else {
                while (candidate - bestVal > M_PI) candidate -= 2.0 * M_PI;
                while (bestVal - candidate > M_PI) candidate += 2.0 * M_PI;
                bestVal = 0.5 * (bestVal + candidate);
            }
        }

        unwrapped.at<double>(p) = bestVal;
        processed.at<uchar>(p) = 1;

        emit progress(static_cast<int>(100.0 * i / points.size()));
    }

    return unwrapped;
}

cv::Mat PhaseUnwrapper::computeQualityMap(const cv::Mat& wrapped) {
    cv::Mat quality(wrapped.size(), CV_64F);
    cv::Mat dx = MathUtils::gradientX(wrapped);
    cv::Mat dy = MathUtils::gradientY(wrapped);

    for (int y = 0; y < wrapped.rows; ++y) {
        for (int x = 0; x < wrapped.cols; ++x) {
            double gx = dx.at<double>(y, x);
            double gy = dy.at<double>(y, x);
            double gradientMag = std::sqrt(gx * gx + gy * gy);
            quality.at<double>(y, x) = 1.0 / (1.0 + gradientMag);
        }
    }

    cv::GaussianBlur(quality, quality, cv::Size(5, 5), 1.0);
    return quality;
}
