#pragma once

#define _USE_MATH_DEFINES
#include <cmath>

#include <pcl/point_types.h>
#include <pcl/point_cloud.h>
#include <pcl/PointIndices.h>
#include <Eigen/Dense>
#include <memory>
#include <vector>
#include <map>
#include <string>
#include <limits>
#include <algorithm>
#include <functional>

struct PointXYZIL
{
    PCL_ADD_POINT4D;
    float intensity;
    uint32_t label;
    EIGEN_MAKE_ALIGNED_OPERATOR_NEW
} EIGEN_ALIGN16;

POINT_CLOUD_REGISTER_POINT_STRUCT(PointXYZIL,
    (float, x, x)
    (float, y, y)
    (float, z, z)
    (float, intensity, intensity)
    (uint32_t, label, label)
)

struct PointXYZILH
{
    PCL_ADD_POINT4D;
    float intensity;
    uint32_t label;
    float height;
    EIGEN_MAKE_ALIGNED_OPERATOR_NEW
} EIGEN_ALIGN16;

POINT_CLOUD_REGISTER_POINT_STRUCT(PointXYZILH,
    (float, x, x)
    (float, y, y)
    (float, z, z)
    (float, intensity, intensity)
    (uint32_t, label, label)
    (float, height, height)
)

struct PointXYZILHTree
{
    PCL_ADD_POINT4D;
    float intensity;
    uint32_t label;
    float height;
    int tree_id;
    EIGEN_MAKE_ALIGNED_OPERATOR_NEW
} EIGEN_ALIGN16;

POINT_CLOUD_REGISTER_POINT_STRUCT(PointXYZILHTree,
    (float, x, x)
    (float, y, y)
    (float, z, z)
    (float, intensity, intensity)
    (uint32_t, label, label)
    (float, height, height)
    (int, tree_id, tree_id)
)

namespace forest
{

using PointCloud = pcl::PointCloud<PointXYZIL>;
using PointCloudPtr = PointCloud::Ptr;
using PointCloudConstPtr = PointCloud::ConstPtr;

using PointCloudH = pcl::PointCloud<PointXYZILH>;
using PointCloudHPtr = PointCloudH::Ptr;
using PointCloudHConstPtr = PointCloudH::ConstPtr;

using PointCloudTree = pcl::PointCloud<PointXYZILHTree>;
using PointCloudTreePtr = PointCloudTree::Ptr;
using PointCloudTreeConstPtr = PointCloudTree::ConstPtr;

using PointCloudXYZ = pcl::PointCloud<pcl::PointXYZ>;
using PointCloudXYZPtr = PointCloudXYZ::Ptr;

using DEMGrid = Eigen::MatrixXf;

enum ClassificationLabel : uint32_t
{
    LABEL_UNCLASSIFIED = 0,
    LABEL_GROUND = 2,
    LABEL_LOW_VEGETATION = 3,
    LABEL_MEDIUM_VEGETATION = 4,
    LABEL_HIGH_VEGETATION = 5,
    LABEL_BUILDING = 6,
    LABEL_WATER = 9,
    LABEL_RAIL = 10,
    LABEL_ROAD = 11
};

enum TreeSegmentationMethod
{
    WATERSHED = 0,
    REGION_GROWING = 1
};

enum ColorMode
{
    COLOR_HEIGHT = 0,
    COLOR_TREE_ID = 1,
    COLOR_LABEL = 2,
    COLOR_INTENSITY = 3,
    COLOR_BY_HEIGHT = 0,
    COLOR_BY_TREE_ID = 1,
    COLOR_BY_LABEL = 2,
    COLOR_BY_INTENSITY = 3,
    COLOR_BY_CATEGORY = 4
};

enum VolumeMethod
{
    VOLUME_CONVEX_HULL = 0,
    VOLUME_VOXEL = 1,
    VOLUME_ELLIPSOID = 2
};

struct TerrainNormalizationParams
{
    float dem_resolution = 1.0f;
    int hole_fill_window = 3;
    bool use_classification = true;
};

struct TreeTopDetectionParams
{
    float window_size = 3.0f;
    float min_height = 2.0f;
    float gaussian_sigma = 0.5f;
};

struct TreeSegmentationParams
{
    TreeSegmentationMethod method = WATERSHED;
    int min_points_per_tree = 50;
    float max_distance = 5.0f;
    float height_weight = 0.5f;
};

struct FeatureExtractionParams
{
    float dbh_height = 1.3f;
    float dbh_tolerance = 0.2f;
    int min_dbh_points = 8;
    bool enable_slope_correction = true;
    VolumeMethod volume_method = VOLUME_CONVEX_HULL;
    float voxel_resolution = 0.2f;
};

struct ExportOptions
{
    bool export_csv = true;
    bool export_point_clouds = true;
    bool export_pdf = true;
    bool export_dem = true;
    bool export_projection = true;
    std::string point_cloud_format = "ply";
    bool downsample_points = false;
    float downsample_resolution = 0.05f;
};

using ProgressCallback = std::function<void(int, const std::string&)>;

}
