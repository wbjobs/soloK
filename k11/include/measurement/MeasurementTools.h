#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <pcl/PolygonMesh.h>
#include <pcl/features/normal_3d.h>
#include <pcl/search/kdtree.h>
#include <Eigen/Geometry>
#include <memory>
#include <vector>
#include <unordered_set>

namespace Fossil3D {

class CurveMeasurement {
public:
    CurveMeasurement();
    ~CurveMeasurement();

    void setSearchRadius(double radius);
    void setSmoothingIterations(int iterations);

    MeasurementResult measureLength(const std::vector<Eigen::Vector3d>& points,
                                     const std::string& name = "Curve");

    MeasurementResult measureAlongSurface(PointCloudXYZRGB::ConstPtr cloud,
                                           const Eigen::Vector3d& start,
                                           const Eigen::Vector3d& end,
                                           const std::string& name = "Surface Curve");

    std::vector<Eigen::Vector3d> samplePathOnSurface(PointCloudXYZRGB::ConstPtr cloud,
                                                       const Eigen::Vector3d& start,
                                                       const Eigen::Vector3d& end);

private:
    double m_searchRadius;
    int m_smoothingIterations;
};

class AngleMeasurement {
public:
    AngleMeasurement();
    ~AngleMeasurement();

    MeasurementResult measureThreePointAngle(const Eigen::Vector3d& p1,
                                               const Eigen::Vector3d& vertex,
                                               const Eigen::Vector3d& p2,
                                               const std::string& name = "Angle");

    MeasurementResult measureTwoLineAngle(const Eigen::Vector3d& line1Start,
                                           const Eigen::Vector3d& line1End,
                                           const Eigen::Vector3d& line2Start,
                                           const Eigen::Vector3d& line2End,
                                           const std::string& name = "Line Angle");

    MeasurementResult measureSurfaceAngle(PointCloudXYZRGB::ConstPtr cloud,
                                           const Eigen::Vector3d& p1,
                                           const Eigen::Vector3d& p2,
                                           const Eigen::Vector3d& p3,
                                           const std::string& name = "Surface Angle");

private:
    Eigen::Vector3d estimateSurfaceNormal(PointCloudXYZRGB::ConstPtr cloud,
                                           const Eigen::Vector3d& point,
                                           double radius = 0.01);
};

class VolumeMeasurement {
public:
    VolumeMeasurement();
    ~VolumeMeasurement();

    void setResolution(double resolution);
    void setVoxelResolution(double resolution);
    void setMinHoleSize(int edgeCount);

    MeasurementResult measureMeshVolume(pcl::PolygonMesh::ConstPtr mesh,
                                         const std::string& name = "Volume");

    MeasurementResult measurePointCloudVolume(PointCloudXYZRGB::ConstPtr cloud,
                                               const std::string& name = "Point Cloud Volume");

    double computeConvexHullVolume(PointCloudXYZRGB::ConstPtr cloud);
    double computeVoxelVolume(pcl::PolygonMesh::ConstPtr mesh);

    bool isWatertight(pcl::PolygonMesh::ConstPtr mesh);
    int countHoles(pcl::PolygonMesh::ConstPtr mesh);

    Eigen::Vector3d getCenterOfMass() const { return m_centerOfMass; }
    bool isWatertight() const { return m_isWatertight; }
    int getHoleCount() const { return m_holeCount; }

private:
    double m_resolution;
    double m_voxelResolution;
    int m_minHoleSize;
    Eigen::Vector3d m_centerOfMass;
    bool m_isWatertight;
    int m_holeCount;

    double computeSignedVolumeWatertight(pcl::PolygonMesh::ConstPtr mesh);
    double computeTetrahedronVolume(const Eigen::Vector3d& a,
                                     const Eigen::Vector3d& b,
                                     const Eigen::Vector3d& c,
                                     const Eigen::Vector3d& d);
    Eigen::Vector3d computeFaceNormal(const Eigen::Vector3d& p0,
                                       const Eigen::Vector3d& p1,
                                       const Eigen::Vector3d& p2);
    bool checkFaceOrientation(pcl::PolygonMesh::ConstPtr mesh);
    void fixFaceOrientation(pcl::PolygonMesh::Ptr mesh);

    struct EdgeKey {
        int a, b;
        EdgeKey(int _a, int _b) : a(std::min(_a, _b)), b(std::max(_a, _b)) {}
        bool operator==(const EdgeKey& other) const {
            return a == other.a && b == other.b;
        }
    };
    
    struct EdgeKeyHash {
        size_t operator()(const EdgeKey& k) const {
            return std::hash<int>()(k.a) ^ (std::hash<int>()(k.b) << 1);
        }
    };
};

class SymmetryAnalyzer {
public:
    SymmetryAnalyzer();
    ~SymmetryAnalyzer();

    void setSymmetryAxis(const Eigen::Vector3d& axis);
    void autoDetectSymmetryAxis(PointCloudXYZRGB::ConstPtr cloud);

    SymmetryResult analyzeSymmetry(PointCloudXYZRGB::ConstPtr cloud,
                                    const std::string& name = "Symmetry");

    Eigen::Vector3d getSymmetryAxis() const { return m_symmetryAxis; }
    Eigen::Vector3d getSymmetryCenter() const { return m_symmetryCenter; }

    PointCloudXYZRGB::Ptr generateHeatmapCloud(PointCloudXYZRGB::ConstPtr cloud,
                                                 const std::vector<double>& deviations);

private:
    Eigen::Vector3d m_symmetryAxis;
    Eigen::Vector3d m_symmetryCenter;

    Eigen::Vector3d mirrorPoint(const Eigen::Vector3d& point);
    void colorCodeDeviation(double deviation, double maxDev,
                             uint8_t& r, uint8_t& g, uint8_t& b);
};

}
