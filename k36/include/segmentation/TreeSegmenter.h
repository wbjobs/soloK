#pragma once

#include "core/typedefs.h"
#include "core/SegmentationResult.h"
#include <Eigen/Dense>
#include <memory>
#include <vector>

namespace forest
{

class TreeSegmenter
{
public:
    TreeSegmenter();
    ~TreeSegmenter();

    void setParams(const TreeSegmentationParams& params) { params_ = params; }
    const TreeSegmentationParams& getParams() const { return params_; }

    bool segment(const PointCloudH& normalized_cloud,
                 const std::vector<Eigen::Vector3f>& tree_tops,
                 const std::vector<int>& top_point_indices,
                 SegmentationResult::Ptr result);

    void setProgressCallback(ProgressCallback callback);

private:
    bool segmentWatershed(const PointCloudH& normalized_cloud,
                          const std::vector<Eigen::Vector3f>& tree_tops,
                          const std::vector<int>& top_point_indices,
                          std::vector<int>& point_labels);

    bool segmentRegionGrowing(const PointCloudH& normalized_cloud,
                              const std::vector<Eigen::Vector3f>& tree_tops,
                              const std::vector<int>& top_point_indices,
                              std::vector<int>& point_labels);

    bool buildTreeClusters(const PointCloudH& normalized_cloud,
                           const std::vector<int>& point_labels,
                           SegmentationResult::Ptr result);

    void removeSmallClusters(std::vector<int>& point_labels, int min_size, int num_trees);
    void refineOverlapRegions(const PointCloudH& normalized_cloud,
                              const std::vector<Eigen::Vector3f>& tree_tops,
                              std::vector<int>& point_labels,
                              const std::vector<float>& crown_radii);

    float computeDistance(const PointXYZILH& p1, const PointXYZILH& p2);

    TreeSegmentationParams params_;
    ProgressCallback progress_callback_;
};

}
