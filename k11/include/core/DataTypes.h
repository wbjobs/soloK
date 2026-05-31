#pragma once

#include <opencv2/opencv.hpp>
#include <pcl/point_types.h>
#include <pcl/point_cloud.h>
#include <Eigen/Core>
#include <vector>
#include <string>
#include <memory>

namespace Fossil3D {

struct CameraParams {
    cv::Mat K;
    cv::Mat distCoeffs;
    cv::Mat R;
    cv::Mat t;
    double focalLength;
    cv::Size imageSize;
};

struct ImageData {
    std::string filename;
    cv::Mat image;
    cv::Mat descriptors;
    std::vector<cv::KeyPoint> keypoints;
    CameraParams camera;
    int id;
};

struct MatchPair {
    int imageId1;
    int imageId2;
    std::vector<cv::DMatch> matches;
    std::vector<cv::Point2f> points1;
    std::vector<cv::Point2f> points2;
};

using PointCloudXYZ = pcl::PointCloud<pcl::PointXYZ>;
using PointCloudXYZRGB = pcl::PointCloud<pcl::PointXYZRGB>;
using PointCloudNormal = pcl::PointCloud<pcl::Normal>;
using PointXYZ = pcl::PointXYZ;
using PointXYZRGB = pcl::PointXYZRGB;

struct PointCloudData {
    PointCloudXYZRGB::Ptr cloud;
    PointCloudNormal::Ptr normals;
    std::string name;
    bool hasNormals;
};

struct MeshData {
    pcl::PolygonMesh::Ptr mesh;
    PointCloudXYZRGB::Ptr coloredCloud;
    std::string name;
    bool hasTexture;
};

struct MeasurementResult {
    std::string type;
    std::string name;
    double value;
    double uncertainty;
    std::string unit;
    std::vector<Eigen::Vector3d> points;
    cv::Mat screenshot;
};

struct SymmetryResult {
    std::vector<double> deviations;
    double meanDeviation;
    double maxDeviation;
    double rmse;
    PointCloudXYZRGB::Ptr heatmapCloud;
};

struct GrowthRingResult {
    int count;
    std::vector<double> ringWidths;
    double meanWidth;
    std::vector<int> ringPositions;
};

struct AnimationKeyframe {
    Eigen::Vector3d position;
    Eigen::Vector3d focalPoint;
    Eigen::Vector3d viewUp;
    double timestamp;
};

}
