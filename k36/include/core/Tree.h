#pragma once

#include "core/typedefs.h"
#include <Eigen/Dense>
#include <memory>
#include <vector>

namespace forest
{

struct TreeParameters
{
    int tree_id = -1;
    float height = 0.0f;
    float crown_diameter_x = 0.0f;
    float crown_diameter_y = 0.0f;
    float crown_diameter_mean = 0.0f;
    float crown_area = 0.0f;
    float dbh = 0.0f;
    float dbh_corrected = 0.0f;
    float crown_volume = 0.0f;
    float trunk_volume = 0.0f;
    float total_volume = 0.0f;
    float basal_area = 0.0f;
    Eigen::Vector3f treetop = Eigen::Vector3f::Zero();
    Eigen::Vector3f trunk_base = Eigen::Vector3f::Zero();
    Eigen::Vector3f crown_center = Eigen::Vector3f::Zero();
    float slope_angle = 0.0f;
    float aspect_angle = 0.0f;
    pcl::PointIndices::Ptr point_indices;
    pcl::PointIndices::Ptr trunk_indices;
    pcl::PointIndices::Ptr crown_indices;

    TreeParameters()
        : point_indices(new pcl::PointIndices)
        , trunk_indices(new pcl::PointIndices)
        , crown_indices(new pcl::PointIndices)
    {
    }
};

class Tree
{
public:
    using Ptr = std::shared_ptr<Tree>;
    using ConstPtr = std::shared_ptr<const Tree>;

    Tree();
    explicit Tree(int id);
    ~Tree();

    int getId() const { return id_; }
    void setId(int id) { id_ = id; }

    const TreeParameters& getParameters() const { return params_; }
    TreeParameters& getParameters() { return params_; }
    void setParameters(const TreeParameters& params) { params_ = params; }

    PointCloudConstPtr getPointCloud() const { return cloud_; }
    PointCloudPtr getPointCloud() { return cloud_; }
    void setPointCloud(PointCloudPtr cloud) { cloud_ = cloud; }

    void addPoint(const PointXYZIL& point);
    size_t getPointCount() const { return cloud_ ? cloud_->size() : 0; }

    void clear();

private:
    int id_;
    TreeParameters params_;
    PointCloudPtr cloud_;
};

using TreePtr = Tree::Ptr;
using TreeConstPtr = Tree::ConstPtr;
using TreeList = std::vector<TreePtr>;

}
