#include "segmentation/TreeSegmenter.h"
#include <pcl/kdtree/kdtree_flann.h>
#include <pcl/common/centroid.h>
#include <queue>
#include <algorithm>
#include <limits>
#include <cmath>
#include <iostream>
#include <set>

namespace forest
{

TreeSegmenter::TreeSegmenter()
{
}

TreeSegmenter::~TreeSegmenter()
{
}

void TreeSegmenter::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

float TreeSegmenter::computeDistance(const PointXYZILH& p1, const PointXYZILH& p2)
{
    float dx = p1.x - p2.x;
    float dy = p1.y - p2.y;
    float dz = (p1.height - p2.height) * params_.vertical_weight;
    return std::sqrt(dx * dx + dy * dy + dz * dz);
}

bool TreeSegmenter::segment(const PointCloudH& normalized_cloud,
                            const std::vector<Eigen::Vector3f>& tree_tops,
                            const std::vector<int>& top_point_indices,
                            SegmentationResult::Ptr result)
{
    if (!result)
    {
        result = std::make_shared<SegmentationResult>();
    }

    if (normalized_cloud.empty() || tree_tops.empty())
    {
        std::cerr << "输入点云或树顶为空" << std::endl;
        return false;
    }

    if (progress_callback_)
    {
        progress_callback_(10, "开始单木分割...");
    }

    std::vector<int> point_labels(normalized_cloud.size(), -1);

    bool success = false;
    switch (params_.method)
    {
        case WATERSHED:
            success = segmentWatershed(normalized_cloud, tree_tops, top_point_indices, point_labels);
            break;
        case REGION_GROWING:
            success = segmentRegionGrowing(normalized_cloud, tree_tops, top_point_indices, point_labels);
            break;
        default:
            success = segmentWatershed(normalized_cloud, tree_tops, top_point_indices, point_labels);
            break;
    }

    if (!success)
    {
        std::cerr << "分割失败" << std::endl;
        return false;
    }

    if (progress_callback_)
    {
        progress_callback_(70, "构建树木聚类...");
    }

    if (params_.min_cluster_size > 0)
    {
        removeSmallClusters(point_labels, params_.min_cluster_size, static_cast<int>(tree_tops.size()));
    }

    PointCloudTreePtr cloud_tree(new PointCloudTree);
    cloud_tree->reserve(normalized_cloud.size());
    cloud_tree->width = normalized_cloud.width;
    cloud_tree->height = normalized_cloud.height;
    cloud_tree->is_dense = normalized_cloud.is_dense;

    for (size_t i = 0; i < normalized_cloud.size(); ++i)
    {
        const auto& p_in = normalized_cloud.points[i];
        PointXYZILHTree p_out;
        p_out.x = p_in.x;
        p_out.y = p_in.y;
        p_out.z = p_in.z;
        p_out.intensity = p_in.intensity;
        p_out.label = p_in.label;
        p_out.height = p_in.height;
        p_out.tree_id = point_labels[i];
        cloud_tree->push_back(p_out);
    }

    result->setPointCloud(cloud_tree);
    result->setTreeTops(tree_tops);

    if (progress_callback_)
    {
        progress_callback_(85, "构建树木对象...");
    }

    success = buildTreeClusters(normalized_cloud, point_labels, result);

    if (progress_callback_)
    {
        progress_callback_(100, "单木分割完成，共分割出 " +
                             std::to_string(result->getTrees().size()) + " 棵树");
    }

    return success;
}

bool TreeSegmenter::segmentWatershed(const PointCloudH& normalized_cloud,
                                     const std::vector<Eigen::Vector3f>& tree_tops,
                                     const std::vector<int>& top_point_indices,
                                     std::vector<int>& point_labels)
{
    int num_trees = static_cast<int>(tree_tops.size());
    int num_points = static_cast<int>(normalized_cloud.size());

    pcl::KdTreeFLANN<PointXYZILH> kdtree;
    auto cloud_ptr = boost::make_shared<PointCloudH>(normalized_cloud);
    kdtree.setInputCloud(cloud_ptr);

    std::vector<int> tree_start_indices;
    for (int idx : top_point_indices)
    {
        if (idx >= 0 && idx < num_points)
        {
            tree_start_indices.push_back(idx);
        }
        else
        {
            tree_start_indices.push_back(-1);
        }
    }

    for (int i = 0; i < num_trees; ++i)
    {
        if (tree_start_indices[i] < 0)
        {
            PointXYZILH search_point;
            search_point.x = tree_tops[i].x();
            search_point.y = tree_tops[i].y();
            search_point.z = tree_tops[i].z();
            search_point.height = tree_tops[i].z();

            std::vector<int> k_indices(1);
            std::vector<float> k_sqr_distances(1);
            if (kdtree.nearestKSearch(search_point, 1, k_indices, k_sqr_distances) > 0)
            {
                tree_start_indices[i] = k_indices[0];
            }
        }
    }

    std::vector<float> estimated_crown_radius(num_trees, params_.max_crown_radius);
    for (int i = 0; i < num_trees; ++i)
    {
        float tree_height = tree_tops[i].z();
        if (tree_height > 0)
        {
            float estimated_r = 0.15f * tree_height + 1.0f;
            estimated_crown_radius[i] = std::min(estimated_r, params_.max_crown_radius);
        }
    }

    std::vector<float> mid_line_distances(num_points, -1.0f);
    for (int i = 0; i < num_trees; ++i)
    {
        for (int j = i + 1; j < num_trees; ++j)
        {
            const auto& t1 = tree_tops[i];
            const auto& t2 = tree_tops[j];
            float dx = t2.x() - t1.x();
            float dy = t2.y() - t1.y();
            float dist_2d = std::sqrt(dx * dx + dy * dy);

            if (dist_2d < estimated_crown_radius[i] + estimated_crown_radius[j])
            {
                Eigen::Vector2f mid_point((t1.x() + t2.x()) / 2, (t1.y() + t2.y()) / 2);
                Eigen::Vector2f dir_normalized(dx / dist_2d, dy / dist_2d);
                Eigen::Vector2f perp_dir(-dir_normalized.y(), dir_normalized.x());

                float buffer_width = std::min(dist_2d * 0.15f, 1.0f);

                for (int p = 0; p < num_points; ++p)
                {
                    const auto& point = normalized_cloud.points[p];
                    Eigen::Vector2f pv(point.x - mid_point.x(), point.y - mid_point.y());
                    float perp_dist = std::abs(pv.dot(perp_dir));
                    float along_dist = pv.dot(dir_normalized);

                    if (perp_dist < buffer_width && std::abs(along_dist) < dist_2d * 0.4f)
                    {
                        mid_line_distances[p] = perp_dist;
                    }
                }
            }
        }
    }

    std::vector<float> distance_to_top(num_points, std::numeric_limits<float>::max());
    std::priority_queue<std::pair<float, int>,
                        std::vector<std::pair<float, int>>,
                        std::greater<std::pair<float, int>>> pq;

    for (int i = 0; i < num_trees; ++i)
    {
        if (tree_start_indices[i] >= 0 && tree_start_indices[i] < num_points)
        {
            int idx = tree_start_indices[i];
            distance_to_top[idx] = 0.0f;
            point_labels[idx] = i;
            pq.push({0.0f, idx});
        }
    }

    std::vector<bool> processed(num_points, false);
    std::vector<float> visit_height(num_points, -1.0f);
    int k = 16;

    while (!pq.empty())
    {
        auto [dist, idx] = pq.top();
        pq.pop();

        if (processed[idx]) continue;
        processed[idx] = true;

        int tree_id = point_labels[idx];
        if (tree_id < 0) continue;

        const auto& current_point = normalized_cloud.points[idx];
        const auto& treetop = tree_tops[tree_id];

        float dx = current_point.x - treetop.x();
        float dy = current_point.y - treetop.y();
        float dist_2d = std::sqrt(dx * dx + dy * dy);
        float crown_r = estimated_crown_radius[tree_id];

        float height_ratio = current_point.height / std::max(treetop.z(), 0.1f);
        float effective_radius = crown_r * (0.3f + 0.7f * std::pow(height_ratio, 0.5f));

        if (dist_2d > effective_radius * 1.5f)
        {
            continue;
        }

        std::vector<int> k_indices(k);
        std::vector<float> k_sqr_distances(k);
        if (kdtree.nearestKSearch(current_point, k, k_indices, k_sqr_distances) > 0)
        {
            for (size_t j = 0; j < k_indices.size(); ++j)
            {
                int neighbor_idx = k_indices[j];
                if (neighbor_idx < 0 || neighbor_idx >= num_points || processed[neighbor_idx])
                {
                    continue;
                }

                const auto& neighbor_point = normalized_cloud.points[neighbor_idx];

                if (neighbor_point.height < params_.min_tree_height &&
                    neighbor_point.label != LABEL_HIGH_VEGETATION &&
                    neighbor_point.label != LABEL_MEDIUM_VEGETATION)
                {
                    continue;
                }

                float spatial_dist = computeDistance(current_point, neighbor_point);

                float height_diff = neighbor_point.height - current_point.height;
                float height_penalty = 0.0f;
                if (height_diff > 0.5f)
                {
                    height_penalty = height_diff * 3.0f;
                }

                float boundary_penalty = 0.0f;
                if (mid_line_distances[neighbor_idx] >= 0)
                {
                    boundary_penalty = 5.0f * (1.0f - mid_line_distances[neighbor_idx]);
                }

                float radius_penalty = 0.0f;
                float n_dx = neighbor_point.x - treetop.x();
                float n_dy = neighbor_point.y - treetop.y();
                float n_dist_2d = std::sqrt(n_dx * n_dx + n_dy * n_dy);
                if (n_dist_2d > crown_r)
                {
                    radius_penalty = (n_dist_2d - crown_r) * 2.0f;
                }

                float step_dist = spatial_dist + height_penalty + boundary_penalty + radius_penalty;
                float new_dist = dist + step_dist;

                if (new_dist < distance_to_top[neighbor_idx])
                {
                    distance_to_top[neighbor_idx] = new_dist;
                    point_labels[neighbor_idx] = tree_id;
                    pq.push({new_dist, neighbor_idx});
                }
            }
        }
    }

    refineOverlapRegions(normalized_cloud, tree_tops, point_labels, estimated_crown_radius);

    if (progress_callback_)
    {
        progress_callback_(60, "分水岭分割完成");
    }

    return true;
}

bool TreeSegmenter::segmentRegionGrowing(const PointCloudH& normalized_cloud,
                                         const std::vector<Eigen::Vector3f>& tree_tops,
                                         const std::vector<int>& top_point_indices,
                                         std::vector<int>& point_labels)
{
    int num_trees = static_cast<int>(tree_tops.size());
    int num_points = static_cast<int>(normalized_cloud.size());

    pcl::KdTreeFLANN<PointXYZILH> kdtree;
    auto cloud_ptr = boost::make_shared<PointCloudH>(normalized_cloud);
    kdtree.setInputCloud(cloud_ptr);

    std::vector<bool> processed(num_points, false);
    int k = 15;

    for (int tree_id = 0; tree_id < num_trees; ++tree_id)
    {
        std::queue<int> growth_queue;
        int start_idx = top_point_indices[tree_id];

        if (start_idx < 0 || start_idx >= num_points)
        {
            PointXYZILH search_point;
            search_point.x = tree_tops[tree_id].x();
            search_point.y = tree_tops[tree_id].y();
            search_point.z = tree_tops[tree_id].z();
            search_point.height = tree_tops[tree_id].z();

            std::vector<int> k_indices(1);
            std::vector<float> k_sqr_distances(1);
            if (kdtree.nearestKSearch(search_point, 1, k_indices, k_sqr_distances) > 0)
            {
                start_idx = k_indices[0];
            }
            else
            {
                continue;
            }
        }

        if (processed[start_idx]) continue;

        growth_queue.push(start_idx);
        point_labels[start_idx] = tree_id;
        processed[start_idx] = true;

        const auto& treetop = tree_tops[tree_id];
        float max_radius_sq = params_.max_crown_radius * params_.max_crown_radius;

        while (!growth_queue.empty())
        {
            int current_idx = growth_queue.front();
            growth_queue.pop();

            const auto& current_point = normalized_cloud.points[current_idx];

            std::vector<int> k_indices(k);
            std::vector<float> k_sqr_distances(k);
            if (kdtree.nearestKSearch(current_point, k, k_indices, k_sqr_distances) > 0)
            {
                for (size_t j = 0; j < k_indices.size(); ++j)
                {
                    int neighbor_idx = k_indices[j];
                    if (neighbor_idx < 0 || neighbor_idx >= num_points || processed[neighbor_idx])
                    {
                        continue;
                    }

                    const auto& neighbor_point = normalized_cloud.points[neighbor_idx];

                    if (neighbor_point.height < params_.min_tree_height &&
                        neighbor_point.label != LABEL_HIGH_VEGETATION &&
                        neighbor_point.label != LABEL_MEDIUM_VEGETATION)
                    {
                        continue;
                    }

                    float dx = neighbor_point.x - treetop.x();
                    float dy = neighbor_point.y - treetop.y();
                    if (dx * dx + dy * dy > max_radius_sq)
                    {
                        continue;
                    }

                    float height_diff = std::abs(neighbor_point.height - current_point.height);
                    if (height_diff > params_.growing_threshold)
                    {
                        continue;
                    }

                    if (params_.use_height_priority && neighbor_point.height > current_point.height)
                    {
                        continue;
                    }

                    point_labels[neighbor_idx] = tree_id;
                    processed[neighbor_idx] = true;
                    growth_queue.push(neighbor_idx);
                }
            }
        }
    }

    if (progress_callback_)
    {
        progress_callback_(60, "区域生长分割完成");
    }

    return true;
}

void TreeSegmenter::removeSmallClusters(std::vector<int>& point_labels, int min_size, int num_trees)
{
    std::vector<int> cluster_size(num_trees, 0);
    for (int label : point_labels)
    {
        if (label >= 0 && label < num_trees)
        {
            cluster_size[label]++;
        }
    }

    for (size_t i = 0; i < point_labels.size(); ++i)
    {
        int label = point_labels[i];
        if (label >= 0 && label < num_trees && cluster_size[label] < min_size)
        {
            point_labels[i] = -1;
        }
    }
}

void TreeSegmenter::refineOverlapRegions(const PointCloudH& normalized_cloud,
                                        const std::vector<Eigen::Vector3f>& tree_tops,
                                        std::vector<int>& point_labels,
                                        const std::vector<float>& crown_radii)
{
    int num_points = static_cast<int>(normalized_cloud.size());
    int num_trees = static_cast<int>(tree_tops.size());

    std::vector<int> refined_labels = point_labels;
    std::vector<bool> is_boundary(num_points, false);

    pcl::KdTreeFLANN<PointXYZILH> kdtree;
    auto cloud_ptr = boost::make_shared<PointCloudH>(normalized_cloud);
    kdtree.setInputCloud(cloud_ptr);

    int k_neighbors = 20;
    for (int i = 0; i < num_points; ++i)
    {
        if (point_labels[i] < 0) continue;

        std::vector<int> k_indices(k_neighbors);
        std::vector<float> k_sqr_distances(k_neighbors);
        if (kdtree.nearestKSearch(normalized_cloud.points[i], k_neighbors, k_indices, k_sqr_distances) > 0)
        {
            int current_label = point_labels[i];
            bool has_different_label = false;
            for (int j = 0; j < k_indices.size(); ++j)
            {
                if (point_labels[k_indices[j]] >= 0 && point_labels[k_indices[j]] != current_label)
                {
                    has_different_label = true;
                    break;
                }
            }
            is_boundary[i] = has_different_label;
        }
    }

    int iterations = 3;
    for (int iter = 0; iter < iterations; ++iter)
    {
        for (int i = 0; i < num_points; ++i)
        {
            if (!is_boundary[i] || point_labels[i] < 0) continue;

            const auto& point = normalized_cloud.points[i];
            int current_label = point_labels[i];
            float point_height = point.height;

            std::map<int, float> label_scores;

            std::vector<int> k_indices(15);
            std::vector<float> k_sqr_distances(15);
            if (kdtree.nearestKSearch(point, 15, k_indices, k_sqr_distances) > 0)
            {
                for (int j = 0; j < k_indices.size(); ++j)
                {
                    int neighbor_label = point_labels[k_indices[j]];
                    if (neighbor_label < 0) continue;

                    float dist = std::sqrt(k_sqr_distances[j]);
                    float neighbor_height = normalized_cloud.points[k_indices[j]].height;
                    float height_sim = 1.0f - std::abs(point_height - neighbor_height) / std::max(point_height, 0.1f);
                    height_sim = std::max(0.0f, std::min(1.0f, height_sim));
                    float weight = (1.0f / (dist + 0.1f)) * height_sim;
                    label_scores[neighbor_label] += weight;
                }
            }

            for (int t = 0; t < num_trees; ++t)
            {
                const auto& treetop = tree_tops[t];
                float dx = point.x - treetop.x();
                float dy = point.y - treetop.y();
                float dist_2d = std::sqrt(dx * dx + dy * dy);
                float height_ratio = point_height / std::max(treetop.z(), 0.1f);
                float expected_r = crown_radii[t] * (0.3f + 0.7f * std::pow(height_ratio, 0.5f));

                if (dist_2d < expected_r * 1.2f)
                {
                    float score = 1.0f - (dist_2d / (expected_r * 1.2f));
                    label_scores[t] += score * 2.0f;
                }
            }

            int best_label = current_label;
            float best_score = -1.0f;
            for (const auto& [label, score] : label_scores)
            {
                if (score > best_score)
                {
                    best_score = score;
                    best_label = label;
                }
            }

            if (best_label != current_label && best_score > 0)
            {
                refined_labels[i] = best_label;
            }
        }
        point_labels = refined_labels;
    }
}

bool TreeSegmenter::buildTreeClusters(const PointCloudH& normalized_cloud,
                                      const std::vector<int>& point_labels,
                                      SegmentationResult::Ptr result)
{
    if (!result) return false;

    TreeList trees;
    std::map<int, int> tree_id_map;
    int next_tree_id = 0;

    for (size_t i = 0; i < point_labels.size(); ++i)
    {
        int label = point_labels[i];
        if (label < 0) continue;

        if (tree_id_map.find(label) == tree_id_map.end())
        {
            tree_id_map[label] = next_tree_id;
            auto tree = std::make_shared<Tree>(next_tree_id);
            tree->getParameters().tree_id = next_tree_id;
            trees.push_back(tree);
            next_tree_id++;
        }

        int tree_idx = tree_id_map[label];
        const auto& point = normalized_cloud.points[i];

        PointXYZIL p;
        p.x = point.x;
        p.y = point.y;
        p.z = point.z;
        p.intensity = point.intensity;
        p.label = point.label;
        trees[tree_idx]->addPoint(p);
        trees[tree_idx]->getParameters().point_indices->indices.push_back(static_cast<int>(i));
    }

    for (auto& tree : trees)
    {
        if (!tree->getPointCloud() || tree->getPointCloud()->empty()) continue;

        Eigen::Vector4f centroid;
        pcl::compute3DCentroid(*tree->getPointCloud(), centroid);
        tree->getParameters().crown_center = Eigen::Vector3f(centroid.x(), centroid.y(), centroid.z());

        float max_height = 0.0f;
        Eigen::Vector3f treetop = Eigen::Vector3f::Zero();
        for (const auto& p : tree->getPointCloud()->points)
        {
            if (p.z > max_height)
            {
                max_height = p.z;
                treetop = Eigen::Vector3f(p.x, p.y, p.z);
            }
        }
        tree->getParameters().treetop = treetop;
        tree->getParameters().height = max_height;
    }

    result->setTrees(trees);

    return true;
}

}
