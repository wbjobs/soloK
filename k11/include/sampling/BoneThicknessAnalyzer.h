#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <pcl/PolygonMesh.h>
#include <pcl/search/kdtree.h>
#include <Eigen/Geometry>
#include <vector>
#include <memory>

namespace Fossil3D {

struct ThicknessResult {
    PointCloudXYZRGB::Ptr thicknessCloud;
    std::vector<double> thicknessValues;
    double meanThickness;
    double maxThickness;
    double minThickness;
    double stdThickness;
};

struct DenseRegion {
    int id;
    Eigen::Vector3d center;
    double thickness;
    double densityScore;
    double boneQuality;
    std::vector<int> pointIndices;
    double area;
};

class BoneThicknessAnalyzer {
public:
    BoneThicknessAnalyzer();
    ~BoneThicknessAnalyzer();

    void setSearchRadius(double radius);
    void setThicknessThreshold(double minThresh);
    void setDensityWeight(double weight);

    ThicknessResult computeLocalThickness(PointCloudXYZRGB::ConstPtr cloud);
    ThicknessResult computeMeshThickness(pcl::PolygonMesh::ConstPtr mesh);

    std::vector<DenseRegion> detectDenseRegions(PointCloudXYZRGB::ConstPtr cloud,
                                                    const ThicknessResult& thicknessResult,
                                                    int minRegionSize = 50);

    PointCloudXYZRGB::Ptr generateThicknessHeatmap(PointCloudXYZRGB::ConstPtr cloud,
                                               const std::vector<double>& thicknessValues);

    double getBoneQualityScore(double thickness, double curvature = 0.5);

private:
    double m_searchRadius;
    double m_thicknessThreshold;
    double m_densityWeight;

    double estimatePointThickness(PointCloudXYZRGB::ConstPtr cloud,
                                int index,
                                pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree);

    double computeOppositeDistance(PointCloudXYZRGB::ConstPtr cloud,
                                  const Eigen::Vector3d& point,
                                  const Eigen::Vector3d& normal);

    void regionGrowing(PointCloudXYZRGB::ConstPtr cloud,
                       const std::vector<double>& thickness,
                       std::vector<DenseRegion>& regions);

    bool isDenseRegion(double thickness, double localDensity);
};

}
