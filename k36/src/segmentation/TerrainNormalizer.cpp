#include "segmentation/TerrainNormalizer.h"
#include <pcl/surface/gp3.h>
#include <pcl/surface/mls.h>
#include <pcl/common/common.h>
#include <pcl/kdtree/kdtree_flann.h>
#include <cmath>
#include <iostream>
#include <limits>

namespace forest
{

TerrainNormalizer::TerrainNormalizer()
    : dem_resolution_(1.0f)
    , dem_origin_(Eigen::Vector2f::Zero())
    , dem_size_(Eigen::Vector2f::Zero())
{
}

TerrainNormalizer::~TerrainNormalizer()
{
}

void TerrainNormalizer::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

bool TerrainNormalizer::process(const PointCloudData& input,
                                PointCloudHPtr& output_cloud,
                                DEMGrid& dem,
                                float& dem_resolution,
                                Eigen::Vector2f& dem_origin)
{
    if (!input.getPointCloud() || input.getPointCloud()->empty())
    {
        std::cerr << "输入点云为空" << std::endl;
        return false;
    }

    dem_resolution_ = params_.dem_resolution;

    if (progress_callback_)
    {
        progress_callback_(10, "正在构建DEM...");
    }

    if (!buildDEM(*input.getGroundPoints()))
    {
        std::cerr << "DEM构建失败" << std::endl;
        return false;
    }

    if (progress_callback_)
    {
        progress_callback_(40, "正在插值DEM...");
    }

    if (!interpolateDEM())
    {
        std::cerr << "DEM插值失败" << std::endl;
        return false;
    }

    if (params_.fill_holes)
    {
        if (progress_callback_)
        {
            progress_callback_(60, "正在填充DEM空洞...");
        }
        fillHoles();
    }

    if (progress_callback_)
    {
        progress_callback_(80, "正在计算归一化高度...");
    }

    if (!computeNormalizedHeights(*input.getPointCloud()))
    {
        std::cerr << "高度归一化失败" << std::endl;
        return false;
    }

    output_cloud = normalized_cloud_;
    dem = dem_;
    dem_resolution = dem_resolution_;
    dem_origin = dem_origin_;

    if (progress_callback_)
    {
        progress_callback_(100, "地形归一化完成");
    }

    return true;
}

bool TerrainNormalizer::buildDEM(const PointCloud& ground_cloud)
{
    if (ground_cloud.empty())
    {
        std::cerr << "地面点云为空，尝试从整体点云估计地面" << std::endl;
        return false;
    }

    Eigen::Vector4f min_pt, max_pt;
    pcl::getMinMax3D(ground_cloud, min_pt, max_pt);

    dem_origin_ = Eigen::Vector2f(min_pt.x(), min_pt.y());
    dem_size_ = Eigen::Vector2f(max_pt.x() - min_pt.x(), max_pt.y() - min_pt.y());

    int cols = static_cast<int>(std::ceil(dem_size_.x() / dem_resolution_)) + 1;
    int rows = static_cast<int>(std::ceil(dem_size_.y() / dem_resolution_)) + 1;

    dem_ = DEMGrid::Constant(rows, cols, std::numeric_limits<float>::quiet_NaN());

    std::vector<std::vector<std::vector<float>>> height_bins(rows, std::vector<std::vector<float>>(cols));

    for (const auto& point : ground_cloud.points)
    {
        int col = static_cast<int>((point.x - dem_origin_.x()) / dem_resolution_);
        int row = static_cast<int>((point.y - dem_origin_.y()) / dem_resolution_);

        if (row >= 0 && row < rows && col >= 0 && col < cols)
        {
            height_bins[row][col].push_back(point.z);
        }
    }

    for (int row = 0; row < rows; ++row)
    {
        for (int col = 0; col < cols; ++col)
        {
            if (!height_bins[row][col].empty())
            {
                float sum = 0.0f;
                for (float h : height_bins[row][col])
                {
                    sum += h;
                }
                dem_(row, col) = sum / static_cast<float>(height_bins[row][col].size());
            }
        }
    }

    return true;
}

bool TerrainNormalizer::interpolateDEM()
{
    if (dem_.size() == 0) return false;

    int rows = dem_.rows();
    int cols = dem_.cols();

    DEMGrid temp_dem = dem_;

    for (int row = 0; row < rows; ++row)
    {
        for (int col = 0; col < cols; ++col)
        {
            if (std::isnan(dem_(row, col)))
            {
                float x = dem_origin_.x() + col * dem_resolution_;
                float y = dem_origin_.y() + row * dem_resolution_;
                temp_dem(row, col) = bilinearInterpolate(x, y);
            }
        }
    }

    dem_ = temp_dem;
    return true;
}

bool TerrainNormalizer::fillHoles()
{
    if (dem_.size() == 0) return false;

    int rows = dem_.rows();
    int cols = dem_.cols();
    int radius = params_.hole_fill_radius;

    DEMGrid temp_dem = dem_;

    for (int row = 0; row < rows; ++row)
    {
        for (int col = 0; col < cols; ++col)
        {
            if (std::isnan(dem_(row, col)))
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
                            if (!std::isnan(dem_(r, c)))
                            {
                                sum += dem_(r, c);
                                count++;
                            }
                        }
                    }
                }

                if (count > 0)
                {
                    temp_dem(row, col) = sum / static_cast<float>(count);
                }
            }
        }
    }

    dem_ = temp_dem;

    for (int row = 0; row < rows; ++row)
    {
        for (int col = 0; col < cols; ++col)
        {
            if (std::isnan(dem_(row, col)))
            {
                dem_(row, col) = 0.0f;
            }
        }
    }

    return true;
}

float TerrainNormalizer::bilinearInterpolate(float x, float y) const
{
    float col_f = (x - dem_origin_.x()) / dem_resolution_;
    float row_f = (y - dem_origin_.y()) / dem_resolution_;

    int col0 = static_cast<int>(std::floor(col_f));
    int row0 = static_cast<int>(std::floor(row_f));
    int col1 = col0 + 1;
    int row1 = row0 + 1;

    if (col0 < 0 || col1 >= dem_.cols() || row0 < 0 || row1 >= dem_.rows())
    {
        return std::numeric_limits<float>::quiet_NaN();
    }

    float fx = col_f - col0;
    float fy = row_f - row0;

    float h00 = dem_(row0, col0);
    float h01 = dem_(row0, col1);
    float h10 = dem_(row1, col0);
    float h11 = dem_(row1, col1);

    if (std::isnan(h00) || std::isnan(h01) || std::isnan(h10) || std::isnan(h11))
    {
        float sum = 0.0f;
        int count = 0;
        if (!std::isnan(h00)) { sum += h00; count++; }
        if (!std::isnan(h01)) { sum += h01; count++; }
        if (!std::isnan(h10)) { sum += h10; count++; }
        if (!std::isnan(h11)) { sum += h11; count++; }
        return count > 0 ? sum / count : std::numeric_limits<float>::quiet_NaN();
    }

    float h0 = h00 * (1 - fx) + h01 * fx;
    float h1 = h10 * (1 - fx) + h11 * fx;
    float h = h0 * (1 - fy) + h1 * fy;

    return h;
}

float TerrainNormalizer::getGroundHeight(float x, float y) const
{
    if (dem_.size() == 0) return 0.0f;

    float col_f = (x - dem_origin_.x()) / dem_resolution_;
    float row_f = (y - dem_origin_.y()) / dem_resolution_;

    int col = static_cast<int>(std::round(col_f));
    int row = static_cast<int>(std::round(row_f));

    if (row >= 0 && row < dem_.rows() && col >= 0 && col < dem_.cols())
    {
        float h = dem_(row, col);
        if (!std::isnan(h))
        {
            return h;
        }
    }

    return bilinearInterpolate(x, y);
}

bool TerrainNormalizer::computeNormalizedHeights(const PointCloud& input_cloud)
{
    normalized_cloud_.reset(new PointCloudH);
    normalized_cloud_->reserve(input_cloud.size());
    normalized_cloud_->width = input_cloud.width;
    normalized_cloud_->height = input_cloud.height;
    normalized_cloud_->is_dense = input_cloud.is_dense;

    for (const auto& point : input_cloud.points)
    {
        PointXYZILH p;
        p.x = point.x;
        p.y = point.y;
        p.z = point.z;
        p.intensity = point.intensity;
        p.label = point.label;

        float ground_height = getGroundHeight(point.x, point.y);
        if (std::isnan(ground_height))
        {
            ground_height = 0.0f;
        }

        p.height = point.z - ground_height;

        if (p.height < params_.min_height)
        {
            p.height = params_.min_height;
        }
        if (p.height > params_.max_height)
        {
            p.height = params_.max_height;
        }

        normalized_cloud_->push_back(p);
    }

    return true;
}

}
