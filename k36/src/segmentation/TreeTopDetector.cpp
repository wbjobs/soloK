#include "segmentation/TreeTopDetector.h"
#include <pcl/common/common.h>
#include <pcl/kdtree/kdtree_flann.h>
#include <cmath>
#include <algorithm>
#include <queue>
#include <limits>
#include <iostream>

namespace forest
{

TreeTopDetector::TreeTopDetector()
{
}

TreeTopDetector::~TreeTopDetector()
{
}

void TreeTopDetector::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

bool TreeTopDetector::detect(const PointCloudH& normalized_cloud,
                             std::vector<Eigen::Vector3f>& tree_tops,
                             std::vector<int>& top_point_indices)
{
    if (normalized_cloud.empty())
    {
        std::cerr << "归一化点云为空" << std::endl;
        return false;
    }

    tree_tops.clear();
    top_point_indices.clear();
    tree_tops_.clear();
    top_indices_.clear();

    if (progress_callback_)
    {
        progress_callback_(10, "正在生成高度密度图像...");
    }

    Eigen::MatrixXf height_image;
    Eigen::MatrixXi count_image;
    float resolution;
    Eigen::Vector2f origin;

    computeHeightDensityImage(normalized_cloud, height_image, count_image, resolution, origin);

    if (progress_callback_)
    {
        progress_callback_(30, "正在平滑高度图像...");
    }

    if (params_.smoothing_radius > 0)
    {
        smoothHeightImage(height_image, params_.smoothing_radius);
    }

    if (progress_callback_)
    {
        progress_callback_(50, "正在检测局部最大值...");
    }

    std::vector<std::pair<int, int>> maxima_coords;
    findLocalMaxima(height_image, count_image, resolution, origin, maxima_coords);

    if (progress_callback_)
    {
        progress_callback_(80, "正在执行非最大值抑制...");
    }

    nonMaximumSuppression(normalized_cloud, maxima_coords, height_image,
                          resolution, origin, tree_tops, top_point_indices);

    tree_tops_ = tree_tops;
    top_indices_ = top_point_indices;

    if (progress_callback_)
    {
        progress_callback_(100, "树顶检测完成，共检测到 " +
                             std::to_string(tree_tops.size()) + " 个树顶");
    }

    return !tree_tops.empty();
}

void TreeTopDetector::computeHeightDensityImage(const PointCloudH& cloud,
                                                Eigen::MatrixXf& height_image,
                                                Eigen::MatrixXi& count_image,
                                                float& resolution,
                                                Eigen::Vector2f& origin)
{
    resolution = params_.window_size / 3.0f;

    Eigen::Vector4f min_pt, max_pt;
    pcl::getMinMax3D(cloud, min_pt, max_pt);

    origin = Eigen::Vector2f(min_pt.x(), min_pt.y());
    Eigen::Vector2f size(max_pt.x() - min_pt.x(), max_pt.y() - min_pt.y());

    int cols = static_cast<int>(std::ceil(size.x() / resolution)) + 1;
    int rows = static_cast<int>(std::ceil(size.y() / resolution)) + 1;

    height_image = Eigen::MatrixXf::Constant(rows, cols, std::numeric_limits<float>::lowest());
    count_image = Eigen::MatrixXi::Zero(rows, cols);

    for (const auto& point : cloud.points)
    {
        if (point.height < params_.min_height) continue;

        int col = static_cast<int>((point.x - origin.x()) / resolution);
        int row = static_cast<int>((point.y - origin.y()) / resolution);

        if (row >= 0 && row < rows && col >= 0 && col < cols)
        {
            if (point.height > height_image(row, col))
            {
                height_image(row, col) = point.height;
            }
            count_image(row, col)++;
        }
    }

    for (int row = 0; row < rows; ++row)
    {
        for (int col = 0; col < cols; ++col)
        {
            if (height_image(row, col) == std::numeric_limits<float>::lowest())
            {
                height_image(row, col) = 0.0f;
            }
        }
    }
}

void TreeTopDetector::smoothHeightImage(Eigen::MatrixXf& height_image, int radius)
{
    int rows = height_image.rows();
    int cols = height_image.cols();

    Eigen::MatrixXf temp = height_image;
    int kernel_size = 2 * radius + 1;

    if (params_.use_gaussian)
    {
        float sigma = params_.gaussian_sigma;
        std::vector<float> kernel(kernel_size);
        float sum = 0.0f;

        for (int i = -radius; i <= radius; ++i)
        {
            kernel[i + radius] = std::exp(-(i * i) / (2 * sigma * sigma));
            sum += kernel[i + radius];
        }

        for (int i = 0; i < kernel_size; ++i)
        {
            kernel[i] /= sum;
        }

        Eigen::MatrixXf smoothed_x = height_image;
        for (int row = 0; row < rows; ++row)
        {
            for (int col = 0; col < cols; ++col)
            {
                float val = 0.0f;
                for (int dc = -radius; dc <= radius; ++dc)
                {
                    int c = std::max(0, std::min(cols - 1, col + dc));
                    val += height_image(row, c) * kernel[dc + radius];
                }
                smoothed_x(row, col) = val;
            }
        }

        temp = smoothed_x;
        for (int col = 0; col < cols; ++col)
        {
            for (int row = 0; row < rows; ++row)
            {
                float val = 0.0f;
                for (int dr = -radius; dr <= radius; ++dr)
                {
                    int r = std::max(0, std::min(rows - 1, row + dr));
                    val += smoothed_x(r, col) * kernel[dr + radius];
                }
                temp(row, col) = val;
            }
        }
    }
    else
    {
        for (int row = 0; row < rows; ++row)
        {
            for (int col = 0; col < cols; ++col)
            {
                float sum = 0.0f;
                int count = 0;

                for (int dr = -radius; dr <= radius; ++dr)
                {
                    for (int dc = -radius; dc <= radius; ++dc)
                    {
                        int r = row + dr;
                        int c = col + dc;
                        if (r >= 0 && r < rows && c >= 0 && c < cols)
                        {
                            sum += height_image(r, c);
                            count++;
                        }
                    }
                }

                if (count > 0)
                {
                    temp(row, col) = sum / count;
                }
            }
        }
    }

    height_image = temp;
}

void TreeTopDetector::findLocalMaxima(const Eigen::MatrixXf& height_image,
                                      const Eigen::MatrixXi& count_image,
                                      float resolution,
                                      const Eigen::Vector2f& origin,
                                      std::vector<std::pair<int, int>>& maxima_coords)
{
    int rows = height_image.rows();
    int cols = height_image.cols();
    int window_half = static_cast<int>(std::ceil(params_.window_size / resolution / 2.0f));

    maxima_coords.clear();

    for (int row = window_half; row < rows - window_half; ++row)
    {
        for (int col = window_half; col < cols - window_half; ++col)
        {
            float current_height = height_image(row, col);

            if (current_height < params_.min_height) continue;
            if (count_image(row, col) == 0) continue;

            bool is_max = true;
            for (int dr = -window_half; dr <= window_half && is_max; ++dr)
            {
                for (int dc = -window_half; dc <= window_half && is_max; ++dc)
                {
                    if (dr == 0 && dc == 0) continue;

                    int r = row + dr;
                    int c = col + dc;
                    if (r >= 0 && r < rows && c >= 0 && c < cols)
                    {
                        if (height_image(r, c) > current_height + params_.height_threshold)
                        {
                            is_max = false;
                        }
                    }
                }
            }

            if (is_max)
            {
                maxima_coords.push_back({row, col});
            }
        }
    }

    std::sort(maxima_coords.begin(), maxima_coords.end(),
              [&height_image](const std::pair<int, int>& a, const std::pair<int, int>& b) {
                  return height_image(a.first, a.second) > height_image(b.first, b.second);
              });
}

void TreeTopDetector::nonMaximumSuppression(const PointCloudH& cloud,
                                            const std::vector<std::pair<int, int>>& maxima_coords,
                                            const Eigen::MatrixXf& height_image,
                                            float resolution,
                                            const Eigen::Vector2f& origin,
                                            std::vector<Eigen::Vector3f>& tree_tops,
                                            std::vector<int>& top_point_indices)
{
    std::vector<bool> suppressed(maxima_coords.size(), false);
    float min_dist_sq = params_.min_distance * params_.min_distance;

    for (size_t i = 0; i < maxima_coords.size(); ++i)
    {
        if (suppressed[i]) continue;

        int row1 = maxima_coords[i].first;
        int col1 = maxima_coords[i].second;
        float x1 = origin.x() + col1 * resolution;
        float y1 = origin.y() + row1 * resolution;
        float z1 = height_image(row1, col1);

        for (size_t j = i + 1; j < maxima_coords.size(); ++j)
        {
            if (suppressed[j]) continue;

            int row2 = maxima_coords[j].first;
            int col2 = maxima_coords[j].second;
            float x2 = origin.x() + col2 * resolution;
            float y2 = origin.y() + row2 * resolution;

            float dist_sq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);

            if (dist_sq < min_dist_sq)
            {
                suppressed[j] = true;
            }
        }

        int point_idx = findNearestPointIndex(cloud, x1, y1, z1);
        if (point_idx >= 0)
        {
            Eigen::Vector3f top(cloud.points[point_idx].x,
                                cloud.points[point_idx].y,
                                cloud.points[point_idx].z);
            tree_tops.push_back(top);
            top_point_indices.push_back(point_idx);
        }
        else
        {
            Eigen::Vector3f top(x1, y1, z1);
            tree_tops.push_back(top);
            top_point_indices.push_back(-1);
        }
    }
}

int TreeTopDetector::findNearestPointIndex(const PointCloudH& cloud, float x, float y, float z)
{
    int best_idx = -1;
    float min_dist_sq = std::numeric_limits<float>::max();
    float search_radius = 2.0f;
    float search_radius_sq = search_radius * search_radius;

    for (size_t i = 0; i < cloud.size(); ++i)
    {
        const auto& p = cloud.points[i];
        float dx = p.x - x;
        float dy = p.y - y;
        float dz = p.height - z;
        float dist_sq = dx * dx + dy * dy + dz * dz;

        if (dist_sq < min_dist_sq && dist_sq < search_radius_sq)
        {
            min_dist_sq = dist_sq;
            best_idx = static_cast<int>(i);
        }
    }

    return best_idx;
}

}
