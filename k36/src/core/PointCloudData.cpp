#include "core/PointCloudData.h"
#include "io/PointCloudLoader.h"
#include <pcl/filters/voxel_grid.h>
#include <pcl/filters/statistical_outlier_removal.h>
#include <pcl/common/common.h>
#include <iostream>

namespace forest
{

PointCloudData::PointCloudData()
    : cloud_(new PointCloud)
    , ground_cloud_(new PointCloud)
    , vegetation_cloud_(new PointCloud)
    , min_bounds_(Eigen::Vector3f::Zero())
    , max_bounds_(Eigen::Vector3f::Zero())
{
}

PointCloudData::~PointCloudData()
{
}

bool PointCloudData::loadFromFile(const std::string& filename)
{
    PointCloudLoader loader;
    auto data = loader.load(filename);
    if (data && data->getPointCloud())
    {
        cloud_ = data->getPointCloud();
        filename_ = filename;
        computeBounds();
        separateGroundAndVegetation();
        return true;
    }
    return false;
}

bool PointCloudData::saveToFile(const std::string& filename) const
{
    PointCloudLoader loader;
    return loader.save(*this, filename);
}

void PointCloudData::separateGroundAndVegetation(float ground_label)
{
    if (!cloud_) return;

    ground_cloud_.reset(new PointCloud);
    vegetation_cloud_.reset(new PointCloud);

    for (const auto& point : cloud_->points)
    {
        if (point.label == static_cast<uint32_t>(ground_label))
        {
            ground_cloud_->push_back(point);
        }
        else if (point.label >= 3 && point.label <= 5)
        {
            vegetation_cloud_->push_back(point);
        }
    }

    ground_cloud_->width = ground_cloud_->size();
    ground_cloud_->height = 1;
    ground_cloud_->is_dense = true;

    vegetation_cloud_->width = vegetation_cloud_->size();
    vegetation_cloud_->height = 1;
    vegetation_cloud_->is_dense = true;
}

void PointCloudData::computeBounds()
{
    if (!cloud_ || cloud_->empty())
    {
        min_bounds_ = Eigen::Vector3f::Zero();
        max_bounds_ = Eigen::Vector3f::Zero();
        return;
    }

    pcl::getMinMax3D(*cloud_, min_bounds_, max_bounds_);
}

void PointCloudData::downsample(float leaf_size)
{
    if (!cloud_ || cloud_->empty()) return;

    pcl::VoxelGrid<PointXYZIL> voxel_grid;
    voxel_grid.setInputCloud(cloud_);
    voxel_grid.setLeafSize(leaf_size, leaf_size, leaf_size);

    PointCloudPtr filtered(new PointCloud);
    voxel_grid.filter(*filtered);
    cloud_ = filtered;

    computeBounds();
    separateGroundAndVegetation();
}

void PointCloudData::removeOutliers(float mean_k, float std_dev)
{
    if (!cloud_ || cloud_->empty()) return;

    pcl::StatisticalOutlierRemoval<PointXYZIL> sor;
    sor.setInputCloud(cloud_);
    sor.setMeanK(static_cast<int>(mean_k));
    sor.setStddevMulThresh(std_dev);

    PointCloudPtr filtered(new PointCloud);
    sor.filter(*filtered);
    cloud_ = filtered;

    computeBounds();
    separateGroundAndVegetation();
}

void PointCloudData::clear()
{
    if (cloud_) cloud_->clear();
    if (ground_cloud_) ground_cloud_->clear();
    if (vegetation_cloud_) vegetation_cloud_->clear();
    filename_.clear();
    min_bounds_ = Eigen::Vector3f::Zero();
    max_bounds_ = Eigen::Vector3f::Zero();
}

bool PointCloudData::loadLAS(const std::string& filename)
{
    PointCloudLoader loader;
    if (cloud_) cloud_->clear();
    return loader.loadLAS(filename, *cloud_);
}

bool PointCloudData::loadPLY(const std::string& filename)
{
    PointCloudLoader loader;
    if (cloud_) cloud_->clear();
    return loader.loadPLY(filename, *cloud_);
}

bool PointCloudData::savePLY(const std::string& filename) const
{
    PointCloudLoader loader;
    return loader.savePLY(*cloud_, filename);
}

}
