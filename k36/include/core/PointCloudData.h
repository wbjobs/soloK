#pragma once

#include "core/typedefs.h"
#include <memory>
#include <string>
#include <vector>

namespace forest
{

class PointCloudData
{
public:
    using Ptr = std::shared_ptr<PointCloudData>;
    using ConstPtr = std::shared_ptr<const PointCloudData>;

    PointCloudData();
    ~PointCloudData();

    bool loadFromFile(const std::string& filename);
    bool saveToFile(const std::string& filename) const;

    PointCloudConstPtr getPointCloud() const { return cloud_; }
    PointCloudPtr getPointCloud() { return cloud_; }
    void setPointCloud(PointCloudPtr cloud) { cloud_ = cloud; }

    PointCloudConstPtr getGroundPoints() const { return ground_cloud_; }
    PointCloudPtr getGroundPoints() { return ground_cloud_; }

    PointCloudConstPtr getVegetationPoints() const { return vegetation_cloud_; }
    PointCloudPtr getVegetationPoints() { return vegetation_cloud_; }

    void separateGroundAndVegetation(float ground_label = 2.0f);

    const std::string& getFilename() const { return filename_; }
    void setFilename(const std::string& filename) { filename_ = filename; }

    size_t getTotalPoints() const { return cloud_ ? cloud_->size() : 0; }
    size_t getGroundPointCount() const { return ground_cloud_ ? ground_cloud_->size() : 0; }
    size_t getVegetationPointCount() const { return vegetation_cloud_ ? vegetation_cloud_->size() : 0; }

    Eigen::Vector3f getMinBounds() const { return min_bounds_; }
    Eigen::Vector3f getMaxBounds() const { return max_bounds_; }
    Eigen::Vector3f getCenter() const { return (min_bounds_ + max_bounds_) / 2.0f; }

    void computeBounds();

    void downsample(float leaf_size);
    void removeOutliers(float mean_k, float std_dev);

    void clear();

private:
    bool loadLAS(const std::string& filename);
    bool loadPLY(const std::string& filename);
    bool savePLY(const std::string& filename) const;

    PointCloudPtr cloud_;
    PointCloudPtr ground_cloud_;
    PointCloudPtr vegetation_cloud_;
    std::string filename_;
    Eigen::Vector3f min_bounds_;
    Eigen::Vector3f max_bounds_;
};

}
