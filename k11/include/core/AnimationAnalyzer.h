#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <pcl/common/pca.h>
#include <pcl/search/kdtree.h>
#include <Eigen/Geometry>
#include <memory>
#include <vector>

namespace Fossil3D {

class ViewpointAnimator {
public:
    ViewpointAnimator();
    ~ViewpointAnimator();

    void setFps(int fps);
    void setDuration(double seconds);
    void setOrbitRadius(double radius);

    std::vector<AnimationKeyframe> generateOrbitAnimation(PointCloudXYZRGB::ConstPtr cloud,
                                                           const Eigen::Vector3d& axis = Eigen::Vector3d(0, 1, 0));

    std::vector<AnimationKeyframe> generateFlythroughAnimation(PointCloudXYZRGB::ConstPtr cloud,
                                                                int numKeyframes = 10);

    std::vector<AnimationKeyframe> generateMainAxisAnimation(PointCloudXYZRGB::ConstPtr cloud);

    std::vector<AnimationKeyframe> interpolateKeyframes(const std::vector<AnimationKeyframe>& keyframes,
                                                          int totalFrames);

    AnimationKeyframe getFrameAtTime(const std::vector<AnimationKeyframe>& keyframes,
                                      double timestamp);

    void saveAnimationPath(const std::vector<AnimationKeyframe>& keyframes,
                            const std::string& filename);

private:
    int m_fps;
    double m_duration;
    double m_orbitRadius;

    Eigen::Vector3d computeModelCenter(PointCloudXYZRGB::ConstPtr cloud);
    double computeModelRadius(PointCloudXYZRGB::ConstPtr cloud, const Eigen::Vector3d& center);
};

class GrowthRingAnalyzer {
public:
    GrowthRingAnalyzer();
    ~GrowthRingAnalyzer();

    void setSectionAxis(const Eigen::Vector3d& axis);
    void setSmoothingSigma(double sigma);
    void setRingThreshold(double threshold);
    void setMinRingWidth(double minWidth);

    GrowthRingResult analyzeGrowthRings(PointCloudXYZRGB::ConstPtr cloud,
                                          const std::string& name = "Growth Rings");

    std::vector<double> extractSectionProfile(PointCloudXYZRGB::ConstPtr cloud,
                                               const Eigen::Vector3d& sectionPoint);

    std::vector<int> detectRingPositions(const std::vector<double>& profile);

    GrowthRingResult countRingsFromImage(const cv::Mat& image);

    int getRingCount() const { return m_lastCount; }
    double getMeanRingWidth() const { return m_lastMeanWidth; }

private:
    Eigen::Vector3d m_sectionAxis;
    double m_smoothingSigma;
    double m_ringThreshold;
    double m_minRingWidth;
    int m_lastCount;
    double m_lastMeanWidth;

    std::vector<double> smoothProfile(const std::vector<double>& profile, double sigma);
    std::vector<double> computeCurvature(const std::vector<double>& profile);
    std::vector<int> findLocalPeaks(const std::vector<double>& signal, double threshold);
    std::vector<int> findLocalValleys(const std::vector<double>& signal, double threshold);

    cv::Mat preprocessImage(const cv::Mat& image);
    cv::Mat detectEdges(const cv::Mat& image);
    std::vector<cv::Vec2f> detectCircularPatterns(const cv::Mat& image);
};

}
