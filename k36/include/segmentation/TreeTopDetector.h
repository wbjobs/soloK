#pragma once

#include "core/typedefs.h"
#include <Eigen/Dense>
#include <memory>
#include <vector>

namespace forest
{

class TreeTopDetector
{
public:
    TreeTopDetector();
    ~TreeTopDetector();

    void setParams(const TreeTopDetectionParams& params) { params_ = params; }
    const TreeTopDetectionParams& getParams() const { return params_; }

    bool detect(const PointCloudH& normalized_cloud,
                std::vector<Eigen::Vector3f>& tree_tops,
                std::vector<int>& top_point_indices);

    const std::vector<Eigen::Vector3f>& getTreeTops() const { return tree_tops_; }
    const std::vector<int>& getTopPointIndices() const { return top_indices_; }

    void setProgressCallback(ProgressCallback callback);

private:
    void computeHeightDensityImage(const PointCloudH& cloud,
                                   Eigen::MatrixXf& height_image,
                                   Eigen::MatrixXi& count_image,
                                   float& resolution,
                                   Eigen::Vector2f& origin);

    void smoothHeightImage(Eigen::MatrixXf& height_image, int radius);

    void findLocalMaxima(const Eigen::MatrixXf& height_image,
                         const Eigen::MatrixXi& count_image,
                         float resolution,
                         const Eigen::Vector2f& origin,
                         std::vector<std::pair<int, int>>& maxima_coords);

    void nonMaximumSuppression(const PointCloudH& cloud,
                               const std::vector<std::pair<int, int>>& maxima_coords,
                               const Eigen::MatrixXf& height_image,
                               float resolution,
                               const Eigen::Vector2f& origin,
                               std::vector<Eigen::Vector3f>& tree_tops,
                               std::vector<int>& top_point_indices);

    int findNearestPointIndex(const PointCloudH& cloud, float x, float y, float z);

    TreeTopDetectionParams params_;
    std::vector<Eigen::Vector3f> tree_tops_;
    std::vector<int> top_indices_;
    ProgressCallback progress_callback_;
};

}
