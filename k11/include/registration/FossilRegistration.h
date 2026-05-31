#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <pcl/registration/icp.h>
#include <pcl/registration/ia_ransac.h>
#include <pcl/registration/ndt.h>
#include <pcl/features/fpfh.h>
#include <pcl/features/normal_3d.h>
#include <pcl/search/kdtree.h>
#include <pcl/filters/voxel_grid.h>
#include <memory>
#include <vector>
#include <map>

namespace Fossil3D {

struct CorrespondencePair {
    Eigen::Vector3d sourcePoint;
    Eigen::Vector3d targetPoint;
    double weight;
};

class FossilRegistration {
public:
    FossilRegistration();
    ~FossilRegistration();

    void setMaxIterations(int iterations);
    void setTransformationEpsilon(double epsilon);
    void setMaxCorrespondenceDistance(double distance);
    void setVoxelGridSize(double size);

    Eigen::Matrix4d manualRegistration(const std::vector<CorrespondencePair>& correspondences);

    Eigen::Matrix4d automaticRegistration(PointCloudXYZRGB::ConstPtr source,
                                           PointCloudXYZRGB::ConstPtr target,
                                           const std::string& method = "icp");

    Eigen::Matrix4d curvatureBasedRegistration(PointCloudXYZRGB::ConstPtr source,
                                                 PointCloudXYZRGB::ConstPtr target);

    PointCloudXYZRGB::Ptr transformCloud(PointCloudXYZRGB::ConstPtr cloud,
                                           const Eigen::Matrix4d& transform);

    pcl::PolygonMesh::Ptr transformMesh(pcl::PolygonMesh::ConstPtr mesh,
                                          const Eigen::Matrix4d& transform);

    PointCloudXYZRGB::Ptr fusePointClouds(const std::vector<PointCloudXYZRGB::Ptr>& clouds,
                                            const std::vector<Eigen::Matrix4d>& transforms);

    double computeFitnessScore(PointCloudXYZRGB::ConstPtr source,
                                PointCloudXYZRGB::ConstPtr target,
                                double maxDistance = 0.01);

    void addManualCorrespondence(const Eigen::Vector3d& sourcePoint,
                                  const Eigen::Vector3d& targetPoint);
    void clearManualCorrespondences();
    const std::vector<CorrespondencePair>& getManualCorrespondences() const;

private:
    int m_maxIterations;
    double m_transformationEpsilon;
    double m_maxCorrespondenceDistance;
    double m_voxelGridSize;

    std::vector<CorrespondencePair> m_manualCorrespondences;

    pcl::PointCloud<pcl::FPFHSignature33>::Ptr computeFPFHFeatures(PointCloudXYZRGB::ConstPtr cloud,
                                                                    double normalRadius,
                                                                    double featureRadius);

    Eigen::Matrix4d computeRigidTransform(const std::vector<Eigen::Vector3d>& source,
                                            const std::vector<Eigen::Vector3d>& target);
};

}
