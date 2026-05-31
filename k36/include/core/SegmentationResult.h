#pragma once

#include "core/typedefs.h"
#include "core/Tree.h"
#include <memory>
#include <vector>
#include <map>

namespace forest
{

struct PlotStatistics
{
    size_t total_points = 0;
    size_t ground_points = 0;
    size_t vegetation_points = 0;
    size_t tree_count = 0;
    float plot_area = 0.0f;
    float mean_height = 0.0f;
    float max_height = 0.0f;
    float mean_dbh = 0.0f;
    float mean_crown_diameter = 0.0f;
    float total_basal_area = 0.0f;
    float total_volume = 0.0f;
    float density = 0.0f;
    float mean_slope = 0.0f;
    float elevation_min = 0.0f;
    float elevation_max = 0.0f;
    float elevation_mean = 0.0f;
};

class SegmentationResult
{
public:
    using Ptr = std::shared_ptr<SegmentationResult>;
    using ConstPtr = std::shared_ptr<const SegmentationResult>;

    SegmentationResult();
    ~SegmentationResult();

    PointCloudTreeConstPtr getPointCloud() const { return cloud_; }
    PointCloudTreePtr getPointCloud() { return cloud_; }
    void setPointCloud(PointCloudTreePtr cloud) { cloud_ = cloud; }

    PointCloudConstPtr getGroundPoints() const { return ground_cloud_; }
    PointCloudPtr getGroundPoints() { return ground_cloud_; }
    void setGroundPoints(PointCloudPtr cloud) { ground_cloud_ = cloud; }

    const TreeList& getTrees() const { return trees_; }
    TreeList& getTrees() { return trees_; }
    void setTrees(const TreeList& trees) { trees_ = trees; }

    const std::vector<Eigen::Vector3f>& getTreeTops() const { return tree_tops_; }
    std::vector<Eigen::Vector3f>& getTreeTops() { return tree_tops_; }
    void setTreeTops(const std::vector<Eigen::Vector3f>& tops) { tree_tops_ = tops; }

    const DEMGrid& getDEM() const { return dem_; }
    DEMGrid& getDEM() { return dem_; }
    void setDEM(const DEMGrid& dem) { dem_ = dem; }

    float getDEMResolution() const { return dem_resolution_; }
    void setDEMResolution(float res) { dem_resolution_ = res; }

    const Eigen::Vector2f& getDEMOrigin() const { return dem_origin_; }
    void setDEMOrigin(const Eigen::Vector2f& origin) { dem_origin_ = origin; }

    const PlotStatistics& getStatistics() const { return stats_; }
    PlotStatistics& getStatistics() { return stats_; }
    void setStatistics(const PlotStatistics& stats) { stats_ = stats; }

    TreePtr getTreeById(int id);
    TreeConstPtr getTreeById(int id) const;

    bool removeTree(int id);
    bool mergeTrees(int id1, int id2);
    bool splitTree(int id, const std::vector<int>& point_indices, TreePtr& new_tree);

    void clear();

private:
    PointCloudTreePtr cloud_;
    PointCloudPtr ground_cloud_;
    TreeList trees_;
    std::vector<Eigen::Vector3f> tree_tops_;
    DEMGrid dem_;
    float dem_resolution_;
    Eigen::Vector2f dem_origin_;
    PlotStatistics stats_;
};

}
