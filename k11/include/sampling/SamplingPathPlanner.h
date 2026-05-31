#pragma once

#include "core/DataTypes.h"
#include "sampling/BoneThicknessAnalyzer.h"
#include <pcl/PolygonMesh.h>
#include <Eigen/Geometry>
#include <vector>
#include <memory>

namespace Fossil3D {

struct SamplingPoint {
    int id;
    Eigen::Vector3d position;
    Eigen::Vector3d normal;
    double boneQuality;
    double thickness;
    double drillDepth;
    double drillAngle;
    bool isEntryPoint;
};

struct DrillPath {
    int id;
    SamplingPoint entryPoint;
    SamplingPoint exitPoint;
    double length;
    double boneVolumeRemoved;
    double damageScore;
    std::vector<Eigen::Vector3d> trajectory;
};

struct SamplingPlan {
    std::vector<DrillPath> drillPaths;
    std::vector<SamplingPoint> optimalSamplingPoints;
    double totalDamage;
    double totalPathLength;
    double averageBoneQuality;
    std::vector<int> tspOrder;
};

class SamplingPathPlanner {
public:
    SamplingPathPlanner();
    ~SamplingPathPlanner();

    void setMaxSamplingPoints(int count);
    void setMinBoneQuality(double quality);
    void setDrillDiameter(double diameter);
    void setSafeMargin(double margin);
    void setMaxDrillDepth(double maxDepth);

    SamplingPlan planSamplingPath(PointCloudXYZRGB::ConstPtr cloud,
                                   const std::vector<DenseRegion>& denseRegions);

    std::vector<SamplingPoint> selectOptimalPoints(PointCloudXYZRGB::ConstPtr cloud,
                                                    const std::vector<DenseRegion>& regions);

    std::vector<int> solveTSP(const std::vector<SamplingPoint>& points);

    DrillPath generateDrillPath(PointCloudXYZRGB::ConstPtr cloud,
                                const SamplingPoint& point);

    std::vector<Eigen::Vector3d> generateDrillTrajectory(const Eigen::Vector3d& entry,
                                                          const Eigen::Vector3d& exit,
                                                          int segments = 20);

    double computeDamageScore(const DrillPath& path);

    PointCloudXYZRGB::Ptr generateSamplingVisualization(PointCloudXYZRGB::ConstPtr cloud,
                                                          const SamplingPlan& plan);

private:
    int m_maxSamplingPoints;
    double m_minBoneQuality;
    double m_drillDiameter;
    double m_safeMargin;
    double m_maxDrillDepth;

    Eigen::Vector3d estimateSurfaceNormal(PointCloudXYZRGB::ConstPtr cloud,
                                          const Eigen::Vector3d& point);

    double twoOptImprove(std::vector<int>& tour,
                         const std::vector<std::vector<double>>& distanceMatrix);

    double computePathDistance(const std::vector<int>& tour,
                               const std::vector<std::vector<double>>& distanceMatrix);

    bool isSafeDrillPath(PointCloudXYZRGB::ConstPtr cloud,
                         const Eigen::Vector3d& entry,
                         const Eigen::Vector3d& exit);

    double computeDrillDepth(PointCloudXYZRGB::ConstPtr cloud,
                            const Eigen::Vector3d& entry,
                            const Eigen::Vector3d& direction);
};

}
