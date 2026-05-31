#include "core/AnimationAnalyzer.h"
#include <fstream>
#include <cmath>
#include <algorithm>
#include <numeric>
#include <opencv2/imgproc.hpp>

namespace Fossil3D {

ViewpointAnimator::ViewpointAnimator()
    : m_fps(30)
    , m_duration(10.0)
    , m_orbitRadius(0.0) {
}

ViewpointAnimator::~ViewpointAnimator() {
}

void ViewpointAnimator::setFps(int fps) {
    m_fps = fps;
}

void ViewpointAnimator::setDuration(double seconds) {
    m_duration = seconds;
}

void ViewpointAnimator::setOrbitRadius(double radius) {
    m_orbitRadius = radius;
}

Eigen::Vector3d ViewpointAnimator::computeModelCenter(PointCloudXYZRGB::ConstPtr cloud) {
    Eigen::Vector4f centroid;
    pcl::compute3DCentroid(*cloud, centroid);
    return Eigen::Vector3d(centroid[0], centroid[1], centroid[2]);
}

double ViewpointAnimator::computeModelRadius(PointCloudXYZRGB::ConstPtr cloud,
                                               const Eigen::Vector3d& center) {
    double maxDist = 0.0;
    for (const auto& pt : cloud->points) {
        Eigen::Vector3d p(pt.x, pt.y, pt.z);
        double dist = (p - center).norm();
        maxDist = std::max(maxDist, dist);
    }
    return maxDist;
}

std::vector<AnimationKeyframe> ViewpointAnimator::generateOrbitAnimation(
    PointCloudXYZRGB::ConstPtr cloud, const Eigen::Vector3d& axis) {
    
    Logger::info("Generating orbit animation...");
    
    Eigen::Vector3d center = computeModelCenter(cloud);
    double radius = computeModelRadius(cloud, center);
    
    if (m_orbitRadius <= 0) {
        m_orbitRadius = radius * 2.5;
    }
    
    Eigen::Vector3d normalizedAxis = axis.normalized();
    Eigen::Vector3d perpAxis;
    
    if (std::abs(normalizedAxis.dot(Eigen::Vector3d(1, 0, 0))) < 0.9) {
        perpAxis = normalizedAxis.cross(Eigen::Vector3d(1, 0, 0)).normalized();
    } else {
        perpAxis = normalizedAxis.cross(Eigen::Vector3d(0, 1, 0)).normalized();
    }
    
    Eigen::Vector3d upAxis = normalizedAxis.cross(perpAxis).normalized();
    
    int totalFrames = static_cast<int>(m_fps * m_duration);
    std::vector<AnimationKeyframe> keyframes;
    
    for (int i = 0; i < totalFrames; ++i) {
        double angle = (2.0 * M_PI * i) / totalFrames;
        
        Eigen::Vector3d position = center + 
            m_orbitRadius * (std::cos(angle) * perpAxis + std::sin(angle) * upAxis);
        
        AnimationKeyframe kf;
        kf.position = position;
        kf.focalPoint = center;
        kf.viewUp = normalizedAxis;
        kf.timestamp = static_cast<double>(i) / m_fps;
        
        keyframes.push_back(kf);
    }
    
    Logger::info("Generated " + std::to_string(keyframes.size()) + " animation frames");
    return keyframes;
}

std::vector<AnimationKeyframe> ViewpointAnimator::generateFlythroughAnimation(
    PointCloudXYZRGB::ConstPtr cloud, int numKeyframes) {
    
    Logger::info("Generating flythrough animation...");
    
    Eigen::Vector3d center = computeModelCenter(cloud);
    double radius = computeModelRadius(cloud, center);
    
    std::vector<AnimationKeyframe> keyframes;
    
    std::vector<Eigen::Vector3d> positions = {
        center + Eigen::Vector3d(radius * 3, 0, 0),
        center + Eigen::Vector3d(0, radius * 3, 0),
        center + Eigen::Vector3d(0, 0, radius * 3),
        center + Eigen::Vector3d(-radius * 1.5, radius * 1.5, radius * 1.5),
        center + Eigen::Vector3d(radius * 2, -radius, radius * 2)
    };
    
    for (size_t i = 0; i < positions.size(); ++i) {
        AnimationKeyframe kf;
        kf.position = positions[i];
        kf.focalPoint = center;
        kf.viewUp = Eigen::Vector3d(0, 1, 0);
        kf.timestamp = (m_duration * i) / (positions.size() - 1);
        keyframes.push_back(kf);
    }
    
    return interpolateKeyframes(keyframes, static_cast<int>(m_fps * m_duration));
}

std::vector<AnimationKeyframe> ViewpointAnimator::generateMainAxisAnimation(
    PointCloudXYZRGB::ConstPtr cloud) {
    
    Logger::info("Generating main axis animation...");
    
    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);
    pcl::PCA<pcl::PointXYZ> pca;
    pca.setInputCloud(xyzCloud);
    
    Eigen::Vector3f mainAxis = pca.getEigenVectors().col(0);
    Eigen::Vector4f centroid = pca.getMean();
    
    Eigen::Vector3d center(centroid[0], centroid[1], centroid[2]);
    Eigen::Vector3d axis(mainAxis[0], mainAxis[1], mainAxis[2]);
    axis.normalize();
    
    double radius = computeModelRadius(cloud, center);
    
    Eigen::Vector3d startPos = center + axis * radius * 2.5;
    Eigen::Vector3d endPos = center - axis * radius * 2.5;
    
    int totalFrames = static_cast<int>(m_fps * m_duration);
    std::vector<AnimationKeyframe> keyframes;
    
    for (int i = 0; i < totalFrames; ++i) {
        double t = static_cast<double>(i) / (totalFrames - 1);
        
        AnimationKeyframe kf;
        kf.position = startPos + t * (endPos - startPos);
        kf.focalPoint = center;
        kf.viewUp = Eigen::Vector3d(0, 1, 0);
        kf.timestamp = static_cast<double>(i) / m_fps;
        
        keyframes.push_back(kf);
    }
    
    Logger::info("Generated " + std::to_string(keyframes.size()) + 
                 " frames along main axis");
    return keyframes;
}

std::vector<AnimationKeyframe> ViewpointAnimator::interpolateKeyframes(
    const std::vector<AnimationKeyframe>& keyframes, int totalFrames) {
    
    if (keyframes.size() < 2) {
        return keyframes;
    }
    
    std::vector<AnimationKeyframe> interpolated;
    
    for (int i = 0; i < totalFrames; ++i) {
        double t = static_cast<double>(i) / (totalFrames - 1);
        double totalTime = keyframes.back().timestamp;
        double targetTime = t * totalTime;
        
        size_t idx = 0;
        while (idx < keyframes.size() - 1 && keyframes[idx + 1].timestamp < targetTime) {
            idx++;
        }
        
        double localT = 0.0;
        if (idx < keyframes.size() - 1) {
            double dt = keyframes[idx + 1].timestamp - keyframes[idx].timestamp;
            if (dt > 0) {
                localT = (targetTime - keyframes[idx].timestamp) / dt;
            }
        }
        
        AnimationKeyframe kf;
        kf.position = keyframes[idx].position + 
            localT * (keyframes[idx + 1].position - keyframes[idx].position);
        kf.focalPoint = keyframes[idx].focalPoint + 
            localT * (keyframes[idx + 1].focalPoint - keyframes[idx].focalPoint);
        kf.viewUp = keyframes[idx].viewUp + 
            localT * (keyframes[idx + 1].viewUp - keyframes[idx].viewUp);
        kf.viewUp.normalize();
        kf.timestamp = targetTime;
        
        interpolated.push_back(kf);
    }
    
    return interpolated;
}

AnimationKeyframe ViewpointAnimator::getFrameAtTime(
    const std::vector<AnimationKeyframe>& keyframes, double timestamp) {
    
    if (keyframes.empty()) {
        return AnimationKeyframe();
    }
    
    size_t idx = 0;
    while (idx < keyframes.size() - 1 && keyframes[idx + 1].timestamp < timestamp) {
        idx++;
    }
    
    if (idx >= keyframes.size() - 1) {
        return keyframes.back();
    }
    
    double dt = keyframes[idx + 1].timestamp - keyframes[idx].timestamp;
    double t = dt > 0 ? (timestamp - keyframes[idx].timestamp) / dt : 0.0;
    
    AnimationKeyframe kf;
    kf.position = keyframes[idx].position + 
        t * (keyframes[idx + 1].position - keyframes[idx].position);
    kf.focalPoint = keyframes[idx].focalPoint + 
        t * (keyframes[idx + 1].focalPoint - keyframes[idx].focalPoint);
    kf.viewUp = keyframes[idx].viewUp + 
        t * (keyframes[idx + 1].viewUp - keyframes[idx].viewUp);
    kf.viewUp.normalize();
    kf.timestamp = timestamp;
    
    return kf;
}

void ViewpointAnimator::saveAnimationPath(const std::vector<AnimationKeyframe>& keyframes,
                                             const std::string& filename) {
    std::ofstream file(filename);
    if (!file.is_open()) {
        Logger::error("Failed to open file for writing: " + filename);
        return;
    }
    
    file << "# Animation Path\n";
    file << "# Time PositionX PositionY PositionZ FocalX FocalY FocalZ UpX UpY UpZ\n";
    
    for (const auto& kf : keyframes) {
        file << kf.timestamp << " "
             << kf.position.x() << " " << kf.position.y() << " " << kf.position.z() << " "
             << kf.focalPoint.x() << " " << kf.focalPoint.y() << " " << kf.focalPoint.z() << " "
             << kf.viewUp.x() << " " << kf.viewUp.y() << " " << kf.viewUp.z() << "\n";
    }
    
    file.close();
    Logger::info("Animation path saved to: " + filename);
}

GrowthRingAnalyzer::GrowthRingAnalyzer()
    : m_sectionAxis(0, 1, 0)
    , m_smoothingSigma(2.0)
    , m_ringThreshold(0.1)
    , m_minRingWidth(5)
    , m_lastCount(0)
    , m_lastMeanWidth(0.0) {
}

GrowthRingAnalyzer::~GrowthRingAnalyzer() {
}

void GrowthRingAnalyzer::setSectionAxis(const Eigen::Vector3d& axis) {
    m_sectionAxis = axis.normalized();
}

void GrowthRingAnalyzer::setSmoothingSigma(double sigma) {
    m_smoothingSigma = sigma;
}

void GrowthRingAnalyzer::setRingThreshold(double threshold) {
    m_ringThreshold = threshold;
}

void GrowthRingAnalyzer::setMinRingWidth(double minWidth) {
    m_minRingWidth = minWidth;
}

std::vector<double> GrowthRingAnalyzer::extractSectionProfile(
    PointCloudXYZRGB::ConstPtr cloud, const Eigen::Vector3d& sectionPoint) {
    
    std::vector<double> profile;
    
    Eigen::Vector3d axis = m_sectionAxis.normalized();
    Eigen::Vector3d perp1, perp2;
    
    if (std::abs(axis.x()) < 0.9) {
        perp1 = axis.cross(Eigen::Vector3d(1, 0, 0)).normalized();
    } else {
        perp1 = axis.cross(Eigen::Vector3d(0, 1, 0)).normalized();
    }
    perp2 = axis.cross(perp1).normalized();
    
    double sectionThickness = 0.01;
    int resolution = 500;
    profile.resize(resolution, 0.0);
    std::vector<int> counts(resolution, 0);
    
    for (const auto& pt : cloud->points) {
        Eigen::Vector3d p(pt.x, pt.y, pt.z);
        Eigen::Vector3d rel = p - sectionPoint;
        
        double axisDist = std::abs(rel.dot(axis));
        if (axisDist < sectionThickness) {
            double x = rel.dot(perp1);
            double y = rel.dot(perp2);
            double r = std::sqrt(x * x + y * y);
            
            int idx = static_cast<int>(r * resolution / 0.1);
            if (idx >= 0 && idx < resolution) {
                profile[idx] += rel.dot(axis);
                counts[idx]++;
            }
        }
    }
    
    for (int i = 0; i < resolution; ++i) {
        if (counts[i] > 0) {
            profile[i] /= counts[i];
        } else if (i > 0) {
            profile[i] = profile[i - 1];
        }
    }
    
    return profile;
}

std::vector<double> GrowthRingAnalyzer::smoothProfile(
    const std::vector<double>& profile, double sigma) {
    
    std::vector<double> smoothed = profile;
    int radius = static_cast<int>(sigma * 3);
    
    for (int iter = 0; iter < 3; ++iter) {
        std::vector<double> temp = smoothed;
        for (size_t i = radius; i < profile.size() - radius; ++i) {
            double sum = 0.0;
            double weight = 0.0;
            for (int j = -radius; j <= radius; ++j) {
                double w = std::exp(-(j * j) / (2 * sigma * sigma));
                sum += temp[i + j] * w;
                weight += w;
            }
            smoothed[i] = sum / weight;
        }
    }
    
    return smoothed;
}

std::vector<double> GrowthRingAnalyzer::computeCurvature(
    const std::vector<double>& profile) {
    
    std::vector<double> curvature(profile.size(), 0.0);
    
    for (size_t i = 2; i < profile.size() - 2; ++i) {
        double d1 = profile[i + 1] - profile[i - 1];
        double d2 = profile[i + 2] - 2 * profile[i] + profile[i - 2];
        curvature[i] = d2 / (1 + d1 * d1);
    }
    
    return curvature;
}

std::vector<int> GrowthRingAnalyzer::findLocalPeaks(
    const std::vector<double>& signal, double threshold) {
    
    std::vector<int> peaks;
    
    for (size_t i = 3; i < signal.size() - 3; ++i) {
        if (signal[i] > threshold && 
            signal[i] > signal[i - 1] && signal[i] > signal[i - 2] &&
            signal[i] > signal[i + 1] && signal[i] > signal[i + 2]) {
            peaks.push_back(static_cast<int>(i));
        }
    }
    
    return peaks;
}

std::vector<int> GrowthRingAnalyzer::findLocalValleys(
    const std::vector<double>& signal, double threshold) {
    
    std::vector<int> valleys;
    
    for (size_t i = 3; i < signal.size() - 3; ++i) {
        if (signal[i] < -threshold && 
            signal[i] < signal[i - 1] && signal[i] < signal[i - 2] &&
            signal[i] < signal[i + 1] && signal[i] < signal[i + 2]) {
            valleys.push_back(static_cast<int>(i));
        }
    }
    
    return valleys;
}

std::vector<int> GrowthRingAnalyzer::detectRingPositions(
    const std::vector<double>& profile) {
    
    std::vector<double> smoothed = smoothProfile(profile, m_smoothingSigma);
    std::vector<double> curvature = computeCurvature(smoothed);
    
    double maxCurv = 0.0;
    for (double c : curvature) {
        maxCurv = std::max(maxCurv, std::abs(c));
    }
    
    std::vector<int> peaks = findLocalPeaks(curvature, m_ringThreshold * maxCurv);
    std::vector<int> filteredPeaks;
    
    for (size_t i = 1; i < peaks.size(); ++i) {
        if (peaks[i] - peaks[i - 1] >= m_minRingWidth) {
            filteredPeaks.push_back(peaks[i]);
        }
    }
    
    return filteredPeaks;
}

GrowthRingResult GrowthRingAnalyzer::analyzeGrowthRings(
    PointCloudXYZRGB::ConstPtr cloud, const std::string& name) {
    
    Logger::info("Analyzing growth rings...");
    Timer timer;
    
    Eigen::Vector3d center;
    Eigen::Vector4f centroid;
    pcl::compute3DCentroid(*cloud, centroid);
    center = Eigen::Vector3d(centroid[0], centroid[1], centroid[2]);
    
    std::vector<double> profile = extractSectionProfile(cloud, center);
    std::vector<int> ringPositions = detectRingPositions(profile);
    
    GrowthRingResult result;
    result.count = ringPositions.size();
    result.ringPositions = ringPositions;
    
    for (size_t i = 1; i < ringPositions.size(); ++i) {
        result.ringWidths.push_back(ringPositions[i] - ringPositions[i - 1]);
    }
    
    if (!result.ringWidths.empty()) {
        result.meanWidth = std::accumulate(result.ringWidths.begin(), 
                                            result.ringWidths.end(), 0.0) / 
                           result.ringWidths.size();
    }
    
    m_lastCount = result.count;
    m_lastMeanWidth = result.meanWidth;
    
    Logger::info("Growth ring analysis completed in " + timer.elapsedString());
    Logger::info("Detected " + std::to_string(result.count) + " growth rings");
    Logger::info("Mean ring width: " + std::to_string(result.meanWidth));
    
    return result;
}

cv::Mat GrowthRingAnalyzer::preprocessImage(const cv::Mat& image) {
    cv::Mat gray;
    if (image.channels() == 3) {
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
    } else {
        gray = image.clone();
    }
    
    cv::Mat blurred;
    cv::GaussianBlur(gray, blurred, cv::Size(5, 5), 0);
    
    cv::Mat equalized;
    cv::equalizeHist(blurred, equalized);
    
    return equalized;
}

cv::Mat GrowthRingAnalyzer::detectEdges(const cv::Mat& image) {
    cv::Mat edges;
    cv::Canny(image, edges, 50, 150);
    return edges;
}

std::vector<cv::Vec2f> GrowthRingAnalyzer::detectCircularPatterns(const cv::Mat& image) {
    std::vector<cv::Vec2f> circles;
    
    cv::Mat gray = preprocessImage(image);
    
    cv::HoughCircles(gray, circles, cv::HOUGH_GRADIENT, 1, gray.rows / 8,
                     200, 100, 0, 0);
    
    return circles;
}

GrowthRingResult GrowthRingAnalyzer::countRingsFromImage(const cv::Mat& image) {
    Logger::info("Counting growth rings from image...");
    Timer timer;
    
    cv::Mat gray = preprocessImage(image);
    cv::Mat edges = detectEdges(gray);
    
    cv::Mat polarTransform;
    cv::Point2f center(gray.cols / 2.0f, gray.rows / 2.0f);
    double maxRadius = std::min(gray.cols, gray.rows) / 2.0;
    
    cv::linearPolar(gray, polarTransform, center, maxRadius, 
                    cv::WARP_FILL_OUTLIERS | cv::INTER_LINEAR);
    
    cv::Mat profile;
    cv::reduce(polarTransform, profile, 0, cv::REDUCE_AVG);
    
    std::vector<double> profileVec;
    for (int i = 0; i < profile.cols; ++i) {
        profileVec.push_back(profile.at<uchar>(0, i));
    }
    
    std::vector<int> ringPositions = detectRingPositions(profileVec);
    
    GrowthRingResult result;
    result.count = ringPositions.size();
    result.ringPositions = ringPositions;
    
    for (size_t i = 1; i < ringPositions.size(); ++i) {
        result.ringWidths.push_back(ringPositions[i] - ringPositions[i - 1]);
    }
    
    if (!result.ringWidths.empty()) {
        result.meanWidth = std::accumulate(result.ringWidths.begin(), 
                                            result.ringWidths.end(), 0.0) / 
                           result.ringWidths.size();
    }
    
    m_lastCount = result.count;
    m_lastMeanWidth = result.meanWidth;
    
    Logger::info("Image-based ring counting completed in " + timer.elapsedString());
    Logger::info("Detected " + std::to_string(result.count) + " rings in image");
    
    return result;
}

}
