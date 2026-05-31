#include "features/TreeParameterExtractor.h"
#include "features/SlopeCorrector.h"
#include <pcl/common/common.h>
#include <pcl/common/centroid.h>
#include <pcl/common/geometry.h>
#include <pcl/surface/convex_hull.h>
#include <pcl/segmentation/extract_clusters.h>
#include <pcl/kdtree/kdtree_flann.h>
#include <Eigen/Geometry>
#include <cmath>
#include <limits>
#include <iostream>
#include <algorithm>

namespace forest
{

TreeParameterExtractor::TreeParameterExtractor()
{
}

TreeParameterExtractor::~TreeParameterExtractor()
{
}

void TreeParameterExtractor::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

bool TreeParameterExtractor::extractAll(TreeList& trees, const DEMGrid& dem,
                                        float dem_resolution, const Eigen::Vector2f& dem_origin)
{
    if (trees.empty())
    {
        std::cerr << "没有树木可提取参数" << std::endl;
        return false;
    }

    SlopeCorrector slope_corrector;

    for (size_t i = 0; i < trees.size(); ++i)
    {
        if (!trees[i]) continue;

        if (progress_callback_)
        {
            int progress = static_cast<int>((i * 100) / trees.size());
            progress_callback_(progress, "正在提取树木 " + std::to_string(trees[i]->getId()) +
                                 " 的参数...");
        }

        extractSingle(*trees[i], dem, dem_resolution, dem_origin);

        slope_corrector.correctTreeParameters(*trees[i], dem, dem_resolution, dem_origin);
    }

    if (progress_callback_)
    {
        progress_callback_(100, "参数提取完成，共处理 " +
                             std::to_string(trees.size()) + " 棵树");
    }

    return true;
}

bool TreeParameterExtractor::extractSingle(Tree& tree, const DEMGrid& dem,
                                           float dem_resolution, const Eigen::Vector2f& dem_origin)
{
    if (!tree.getPointCloud() || tree.getPointCloud()->empty())
    {
        return false;
    }

    separateTrunkAndCrown(tree);

    float height = extractTreeHeight(tree);
    tree.getParameters().height = height;

    extractCrownDiameter(tree);

    float dbh = extractDBH(tree);
    tree.getParameters().dbh = dbh;
    tree.getParameters().basal_area = M_PI * (dbh / 2.0f) * (dbh / 2.0f);

    float crown_volume = extractCrownVolume(tree);
    tree.getParameters().crown_volume = crown_volume;

    tree.getParameters().trunk_volume = tree.getParameters().basal_area * height * 0.45f;
    tree.getParameters().total_volume = tree.getParameters().crown_volume + tree.getParameters().trunk_volume;

    return true;
}

float TreeParameterExtractor::extractTreeHeight(const Tree& tree)
{
    if (!tree.getPointCloud() || tree.getPointCloud()->empty())
    {
        return 0.0f;
    }

    float max_height = 0.0f;
    float min_height = std::numeric_limits<float>::max();

    for (const auto& point : tree.getPointCloud()->points)
    {
        if (point.z > max_height)
        {
            max_height = point.z;
        }
        if (point.z < min_height)
        {
            min_height = point.z;
        }
    }

    return max_height - min_height;
}

void TreeParameterExtractor::extractCrownDiameter(Tree& tree)
{
    if (!tree.getPointCloud() || tree.getPointCloud()->empty())
    {
        return;
    }

    float min_x = std::numeric_limits<float>::max();
    float max_x = -std::numeric_limits<float>::max();
    float min_y = std::numeric_limits<float>::max();
    float max_y = -std::numeric_limits<float>::max();

    float height = tree.getParameters().height;
    float crown_start_height = tree.getParameters().treetop.z() - height * params_.crown_height_threshold;

    for (const auto& point : tree.getPointCloud()->points)
    {
        if (point.z >= crown_start_height)
        {
            if (point.x < min_x) min_x = point.x;
            if (point.x > max_x) max_x = point.x;
            if (point.y < min_y) min_y = point.y;
            if (point.y > max_y) max_y = point.y;
        }
    }

    float diameter_x = max_x - min_x;
    float diameter_y = max_y - min_y;

    tree.getParameters().crown_diameter_x = diameter_x;
    tree.getParameters().crown_diameter_y = diameter_y;
    tree.getParameters().crown_diameter_mean = (diameter_x + diameter_y) / 2.0f;
    tree.getParameters().crown_area = M_PI * (diameter_x / 2.0f) * (diameter_y / 2.0f);
}

void TreeParameterExtractor::separateTrunkAndCrown(Tree& tree)
{
    if (!tree.getPointCloud() || tree.getPointCloud()->empty())
    {
        return;
    }

    auto& params = tree.getParameters();
    params.trunk_indices->indices.clear();
    params.crown_indices->indices.clear();

    float height = params.height;
    if (height <= 0)
    {
        height = extractTreeHeight(tree);
    }

    float trunk_max_height = params_.trunk_min_height;
    if (height > 5.0f)
    {
        trunk_max_height = height * params_.crown_height_threshold;
    }

    float min_z = std::numeric_limits<float>::max();
    for (const auto& point : tree.getPointCloud()->points)
    {
        if (point.z < min_z) min_z = point.z;
    }

    for (size_t i = 0; i < tree.getPointCloud()->size(); ++i)
    {
        const auto& point = tree.getPointCloud()->points[i];
        float rel_height = point.z - min_z;

        if (rel_height <= trunk_max_height)
        {
            params.trunk_indices->indices.push_back(static_cast<int>(i));
        }
        else
        {
            params.crown_indices->indices.push_back(static_cast<int>(i));
        }
    }

    if (!params.trunk_indices->indices.empty())
    {
        float sum_x = 0.0f, sum_y = 0.0f, sum_z = 0.0f;
        for (int idx : params.trunk_indices->indices)
        {
            const auto& p = tree.getPointCloud()->points[idx];
            sum_x += p.x;
            sum_y += p.y;
            sum_z += p.z;
        }
        int n = static_cast<int>(params.trunk_indices->indices.size());
        params.trunk_base = Eigen::Vector3f(sum_x / n, sum_y / n, min_z);
    }
}

float TreeParameterExtractor::extractDBH(Tree& tree)
{
    if (!tree.getPointCloud() || tree.getPointCloud()->empty())
    {
        return 0.0f;
    }

    auto& params = tree.getParameters();
    float min_z = std::numeric_limits<float>::max();

    for (const auto& point : tree.getPointCloud()->points)
    {
        if (point.z < min_z) min_z = point.z;
    }

    std::vector<std::vector<Eigen::Vector2f>> multi_layer_points;
    std::vector<float> layer_heights;

    for (float offset = -0.3f; offset <= 0.5f; offset += 0.1f)
    {
        float layer_height = min_z + params_.dbh_height + offset;
        float tolerance = 0.08f;
        std::vector<Eigen::Vector2f> layer_points;

        for (const auto& point : tree.getPointCloud()->points)
        {
            if (std::abs(point.z - layer_height) < tolerance)
            {
                layer_points.push_back(Eigen::Vector2f(point.x, point.y));
            }
        }

        if (layer_points.size() >= 5)
        {
            multi_layer_points.push_back(layer_points);
            layer_heights.push_back(layer_height);
        }
    }

    if (multi_layer_points.empty())
    {
        float search_radius = params_.dbh_search_radius;
        float dbh_height_abs = min_z + params_.dbh_height;
        Eigen::Vector3f trunk_base = params.trunk_base;

        std::vector<Eigen::Vector2f> dbh_points;

        if (trunk_base.norm() == 0 && !params.trunk_indices->indices.empty())
        {
            for (int idx : params.trunk_indices->indices)
            {
                const auto& p = tree.getPointCloud()->points[idx];
                if (std::abs(p.z - dbh_height_abs) < 1.0f)
                {
                    dbh_points.push_back(Eigen::Vector2f(p.x, p.y));
                }
            }
        }
        else
        {
            for (const auto& point : tree.getPointCloud()->points)
            {
                float dx = point.x - trunk_base.x();
                float dy = point.y - trunk_base.y();
                float dist = std::sqrt(dx * dx + dy * dy);
                if (dist < search_radius && std::abs(point.z - dbh_height_abs) < 1.0f)
                {
                    dbh_points.push_back(Eigen::Vector2f(point.x, point.y));
                }
            }
        }

        if (dbh_points.size() >= 5)
        {
            multi_layer_points.push_back(dbh_points);
            layer_heights.push_back(dbh_height_abs);
        }
    }

    if (multi_layer_points.empty())
    {
        return params_.crown_diameter_mean * 0.15f;
    }

    std::vector<float> radii;
    std::vector<float> fit_qualities;
    std::vector<Eigen::Vector2f> centers;

    for (size_t i = 0; i < multi_layer_points.size(); ++i)
    {
        Eigen::Vector2f center;
        float radius;
        float quality = fitCircleRobust(multi_layer_points[i], center, radius);

        if (radius > 0.02f && radius < 1.5f)
        {
            radii.push_back(radius);
            fit_qualities.push_back(quality);
            centers.push_back(center);
        }
    }

    if (radii.empty())
    {
        return params_.crown_diameter_mean * 0.15f;
    }

    float total_weight = 0.0f;
    float weighted_radius = 0.0f;

    for (size_t i = 0; i < radii.size(); ++i)
    {
        float weight = fit_qualities[i];
        if (weight > 0)
        {
            weighted_radius += radii[i] * weight;
            total_weight += weight;
        }
    }

    if (total_weight > 0)
    {
        return 2.0f * (weighted_radius / total_weight);
    }
    else
    {
        float mean_radius = 0.0f;
        for (float r : radii) mean_radius += r;
        return 2.0f * (mean_radius / radii.size());
    }
}

float TreeParameterExtractor::fitCircleToPoints(const std::vector<Eigen::Vector2f>& points,
                                                 Eigen::Vector2f& center, float& radius)
{
    if (points.size() < 3)
    {
        center = Eigen::Vector2f::Zero();
        radius = 0.0f;
        return 0.0f;
    }

    float sum_x = 0.0f, sum_y = 0.0f;
    for (const auto& p : points)
    {
        sum_x += p.x();
        sum_y += p.y();
    }
    center.x() = sum_x / points.size();
    center.y() = sum_y / points.size();

    for (int iter = 0; iter < 10; ++iter)
    {
        float sum_r = 0.0f;
        float sum_rr = 0.0f;
        float sum_rx = 0.0f;
        float sum_ry = 0.0f;

        for (const auto& p : points)
        {
            float dx = p.x() - center.x();
            float dy = p.y() - center.y();
            float r = std::sqrt(dx * dx + dy * dy);
            if (r > 0.001f)
            {
                sum_r += r;
                sum_rr += r * r;
                sum_rx += (dx * dx) / r;
                sum_ry += (dy * dy) / r;
            }
        }

        if (sum_r > 0)
        {
            radius = sum_r / points.size();
        }

        float update_x = 0.0f, update_y = 0.0f;
        for (const auto& p : points)
        {
            float dx = p.x() - center.x();
            float dy = p.y() - center.y();
            float r = std::sqrt(dx * dx + dy * dy);
            if (r > 0.001f)
            {
                update_x += (dx / r) * (r - radius);
                update_y += (dy / r) * (r - radius);
            }
        }

        center.x() += update_x / points.size() * 0.5f;
        center.y() += update_y / points.size() * 0.5f;
    }

    float mean_sq_error = 0.0f;
    for (const auto& p : points)
    {
        float dx = p.x() - center.x();
        float dy = p.y() - center.y();
        float r = std::sqrt(dx * dx + dy * dy);
        mean_sq_error += (r - radius) * (r - radius);
    }
    mean_sq_error /= points.size();

    return std::sqrt(mean_sq_error);
}

float TreeParameterExtractor::computeArcCoverage(const std::vector<Eigen::Vector2f>& points,
                                                  const Eigen::Vector2f& center)
{
    if (points.size() < 2)
    {
        return 0.0f;
    }

    std::vector<float> angles;
    for (const auto& p : points)
    {
        float dx = p.x() - center.x();
        float dy = p.y() - center.y();
        float angle = std::atan2(dy, dx);
        if (angle < 0) angle += 2 * M_PI;
        angles.push_back(angle);
    }

    std::sort(angles.begin(), angles.end());

    float max_gap = 0.0f;
    for (size_t i = 1; i < angles.size(); ++i)
    {
        float gap = angles[i] - angles[i-1];
        if (gap > max_gap) max_gap = gap;
    }

    float wrap_gap = (angles[0] + 2 * M_PI) - angles.back();
    if (wrap_gap > max_gap) max_gap = wrap_gap;

    float coverage = 2 * M_PI - max_gap;
    return coverage;
}

float TreeParameterExtractor::fitCircleRobust(const std::vector<Eigen::Vector2f>& points,
                                               Eigen::Vector2f& center, float& radius)
{
    size_t n = points.size();
    if (n < 3)
    {
        center = Eigen::Vector2f::Zero();
        radius = 0.0f;
        return 0.0f;
    }

    std::vector<float> residuals(n);
    std::vector<bool> is_inlier(n, true);

    float initial_error = fitCircleToPoints(points, center, radius);
    float arc_coverage = computeArcCoverage(points, center);
    float coverage_ratio = arc_coverage / (2 * M_PI);

    for (size_t i = 0; i < n; ++i)
    {
        float dx = points[i].x() - center.x();
        float dy = points[i].y() - center.y();
        float r = std::sqrt(dx * dx + dy * dy);
        residuals[i] = std::abs(r - radius);
    }

    if (coverage_ratio < 0.5f)
    {
        Eigen::Vector2f centroid(0, 0);
        for (const auto& p : points)
        {
            centroid += p;
        }
        centroid /= static_cast<float>(n);

        Eigen::Vector2f direction_sum(0, 0);
        for (const auto& p : points)
        {
            Eigen::Vector2f dir = p - centroid;
            if (dir.norm() > 0.001f)
            {
                dir.normalize();
                direction_sum += dir;
            }
        }

        float direction_strength = direction_sum.norm() / static_cast<float>(n);

        if (direction_strength > 0.1f)
        {
            Eigen::Vector2f open_direction = direction_sum.normalized();

            float median_dist = 0.0f;
            std::vector<float> distances;
            for (const auto& p : points)
            {
                float dx = p.x() - centroid.x();
                float dy = p.y() - centroid.y();
                distances.push_back(std::sqrt(dx * dx + dy * dy));
            }
            std::sort(distances.begin(), distances.end());
            median_dist = distances[n / 2];

            Eigen::Vector2f estimated_center = centroid - open_direction * median_dist;

            float total_r = 0.0f;
            for (const auto& p : points)
            {
                float dx = p.x() - estimated_center.x();
                float dy = p.y() - estimated_center.y();
                total_r += std::sqrt(dx * dx + dy * dy);
            }
            float estimated_radius = total_r / static_cast<float>(n);

            center = estimated_center;
            radius = estimated_radius;

            int iterations = 20;
            for (int iter = 0; iter < iterations; ++iter)
            {
                float weight_sum = 0.0f;
                float x_sum = 0.0f, y_sum = 0.0f, r_sum = 0.0f;

                for (size_t i = 0; i < n; ++i)
                {
                    float dx = points[i].x() - center.x();
                    float dy = points[i].y() - center.y();
                    float r = std::sqrt(dx * dx + dy * dy);
                    float error = std::abs(r - radius);

                    float weight = 1.0f / (1.0f + error * 10.0f);
                    weight_sum += weight;
                    x_sum += points[i].x() * weight;
                    y_sum += points[i].y() * weight;
                    r_sum += r * weight;
                }

                if (weight_sum > 0)
                {
                    Eigen::Vector2f new_center(x_sum / weight_sum, y_sum / weight_sum);
                    float new_radius = r_sum / weight_sum;

                    float center_diff = (new_center - center).norm();
                    float radius_diff = std::abs(new_radius - radius);

                    center = new_center;
                    radius = new_radius;

                    if (center_diff < 0.001f && radius_diff < 0.001f)
                    {
                        break;
                    }
                }
            }
        }
    }
    else
    {
        float threshold = 2.0f * initial_error + 0.01f;
        for (size_t i = 0; i < n; ++i)
        {
            is_inlier[i] = (residuals[i] < threshold);
        }

        std::vector<Eigen::Vector2f> inliers;
        for (size_t i = 0; i < n; ++i)
        {
            if (is_inlier[i])
            {
                inliers.push_back(points[i]);
            }
        }

        if (inliers.size() >= 5)
        {
            fitCircleToPoints(inliers, center, radius);
        }
    }

    float mean_error = 0.0f;
    for (const auto& p : points)
    {
        float dx = p.x() - center.x();
        float dy = p.y() - center.y();
        float r = std::sqrt(dx * dx + dy * dy);
        mean_error += (r - radius) * (r - radius);
    }
    mean_error = std::sqrt(mean_error / static_cast<float>(n));

    float quality = 0.0f;
    if (radius > 0.01f)
    {
        float error_ratio = mean_error / radius;
        float coverage_score = std::min(coverage_ratio * 2.0f, 1.0f);
        quality = coverage_score * (1.0f - std::min(error_ratio * 5.0f, 0.8f));
        quality = std::max(0.1f, quality);
    }

    return quality;
}

float TreeParameterExtractor::extractCrownVolume(Tree& tree)
{
    if (!tree.getPointCloud() || tree.getPointCloud()->empty())
    {
        return 0.0f;
    }

    if (params_.use_convex_hull)
    {
        computeConvexHullVolume(tree);
    }
    else
    {
        computeVoxelVolume(tree);
    }

    return tree.getParameters().crown_volume;
}

void TreeParameterExtractor::computeConvexHullVolume(Tree& tree)
{
    if (tree.getParameters().crown_indices->indices.empty())
    {
        separateTrunkAndCrown(tree);
    }

    const auto& crown_indices = tree.getParameters().crown_indices;
    if (crown_indices->indices.size() < 4)
    {
        tree.getParameters().crown_volume = 0.0f;
        return;
    }

    pcl::PointCloud<pcl::PointXYZ>::Ptr crown_cloud(new pcl::PointCloud<pcl::PointXYZ>);
    crown_cloud->reserve(crown_indices->indices.size());

    for (int idx : crown_indices->indices)
    {
        const auto& p = tree.getPointCloud()->points[idx];
        crown_cloud->push_back(pcl::PointXYZ(p.x, p.y, p.z));
    }

    try
    {
        pcl::ConvexHull<pcl::PointXYZ> hull;
        hull.setInputCloud(crown_cloud);
        hull.setComputeAreaVolume(true);

        pcl::PointCloud<pcl::PointXYZ>::Ptr hull_points(new pcl::PointCloud<pcl::PointXYZ>);
        pcl::PolygonMesh triangles;
        hull.reconstruct(*hull_points, triangles);

        tree.getParameters().crown_volume = static_cast<float>(hull.getTotalVolume());
    }
    catch (const std::exception& e)
    {
        std::cerr << "凸包计算失败: " << e.what() << std::endl;
        float mean_d = tree.getParameters().crown_diameter_mean;
        float h = tree.getParameters().height * (1 - params_.crown_height_threshold);
        tree.getParameters().crown_volume = static_cast<float>(M_PI * (mean_d / 2.0) * (mean_d / 2.0) * h * 0.6);
    }
}

void TreeParameterExtractor::computeVoxelVolume(Tree& tree)
{
    if (tree.getParameters().crown_indices->indices.empty())
    {
        separateTrunkAndCrown(tree);
    }

    const auto& crown_indices = tree.getParameters().crown_indices;
    if (crown_indices->indices.empty())
    {
        tree.getParameters().crown_volume = 0.0f;
        return;
    }

    float min_x = std::numeric_limits<float>::max();
    float max_x = -std::numeric_limits<float>::max();
    float min_y = std::numeric_limits<float>::max();
    float max_y = -std::numeric_limits<float>::max();
    float min_z = std::numeric_limits<float>::max();
    float max_z = -std::numeric_limits<float>::max();

    for (int idx : crown_indices->indices)
    {
        const auto& p = tree.getPointCloud()->points[idx];
        min_x = std::min(min_x, p.x);
        max_x = std::max(max_x, p.x);
        min_y = std::min(min_y, p.y);
        max_y = std::max(max_y, p.y);
        min_z = std::min(min_z, p.z);
        max_z = std::max(max_z, p.z);
    }

    float range_x = max_x - min_x;
    float range_y = max_y - min_y;
    float range_z = max_z - min_z;
    float max_range = std::max({range_x, range_y, range_z});
    float voxel_size = max_range / params_.voxel_grid_resolution;

    if (voxel_size <= 0) voxel_size = 0.1f;

    int res_x = static_cast<int>(std::ceil(range_x / voxel_size)) + 1;
    int res_y = static_cast<int>(std::ceil(range_y / voxel_size)) + 1;
    int res_z = static_cast<int>(std::ceil(range_z / voxel_size)) + 1;

    std::vector<std::vector<std::vector<bool>>> voxel_grid(
        res_x, std::vector<std::vector<bool>>(res_y, std::vector<bool>(res_z, false)));

    for (int idx : crown_indices->indices)
    {
        const auto& p = tree.getPointCloud()->points[idx];
        int ix = static_cast<int>((p.x - min_x) / voxel_size);
        int iy = static_cast<int>((p.y - min_y) / voxel_size);
        int iz = static_cast<int>((p.z - min_z) / voxel_size);

        if (ix >= 0 && ix < res_x && iy >= 0 && iy < res_y && iz >= 0 && iz < res_z)
        {
            voxel_grid[ix][iy][iz] = true;
        }
    }

    int filled_voxels = 0;
    for (int ix = 0; ix < res_x; ++ix)
    {
        for (int iy = 0; iy < res_y; ++iy)
        {
            for (int iz = 0; iz < res_z; ++iz)
            {
                if (voxel_grid[ix][iy][iz])
                {
                    filled_voxels++;
                }
            }
        }
    }

    float voxel_volume = voxel_size * voxel_size * voxel_size;
    tree.getParameters().crown_volume = filled_voxels * voxel_volume;
}

}
