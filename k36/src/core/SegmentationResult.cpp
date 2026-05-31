#include "core/SegmentationResult.h"
#include <algorithm>
#include <pcl/common/centroid.h>

namespace forest
{

SegmentationResult::SegmentationResult()
    : cloud_(new PointCloudTree)
    , ground_cloud_(new PointCloud)
    , dem_resolution_(1.0f)
    , dem_origin_(Eigen::Vector2f::Zero())
{
}

SegmentationResult::~SegmentationResult()
{
}

TreePtr SegmentationResult::getTreeById(int id)
{
    for (auto& tree : trees_)
    {
        if (tree && tree->getId() == id)
        {
            return tree;
        }
    }
    return nullptr;
}

TreeConstPtr SegmentationResult::getTreeById(int id) const
{
    for (const auto& tree : trees_)
    {
        if (tree && tree->getId() == id)
        {
            return tree;
        }
    }
    return nullptr;
}

bool SegmentationResult::removeTree(int id)
{
    auto it = std::find_if(trees_.begin(), trees_.end(),
        [id](const TreePtr& tree) { return tree && tree->getId() == id; });

    if (it != trees_.end())
    {
        if (cloud_)
        {
            for (auto& point : cloud_->points)
            {
                if (point.tree_id == id)
                {
                    point.tree_id = -1;
                }
            }
        }

        trees_.erase(it);
        return true;
    }
    return false;
}

bool SegmentationResult::mergeTrees(int id1, int id2)
{
    TreePtr tree1 = getTreeById(id1);
    TreePtr tree2 = getTreeById(id2);

    if (!tree1 || !tree2 || id1 == id2)
    {
        return false;
    }

    if (tree1->getPointCloud() && tree2->getPointCloud())
    {
        for (const auto& point : tree2->getPointCloud()->points)
        {
            tree1->addPoint(point);
        }

        if (cloud_)
        {
            for (auto& point : cloud_->points)
            {
                if (point.tree_id == id2)
                {
                    point.tree_id = id1;
                }
            }
        }

        if (tree1->getParameters().point_indices && tree2->getParameters().point_indices)
        {
            tree1->getParameters().point_indices->indices.insert(
                tree1->getParameters().point_indices->indices.end(),
                tree2->getParameters().point_indices->indices.begin(),
                tree2->getParameters().point_indices->indices.end()
            );
        }

        if (tree1->getParameters().crown_indices && tree2->getParameters().crown_indices)
        {
            tree1->getParameters().crown_indices->indices.insert(
                tree1->getParameters().crown_indices->indices.end(),
                tree2->getParameters().crown_indices->indices.begin(),
                tree2->getParameters().crown_indices->indices.end()
            );
        }
    }

    removeTree(id2);
    return true;
}

bool SegmentationResult::splitTree(int id, const std::vector<int>& point_indices, TreePtr& new_tree)
{
    TreePtr tree = getTreeById(id);
    if (!tree)
    {
        return false;
    }

    int new_id = 0;
    for (const auto& t : trees_)
    {
        if (t && t->getId() >= new_id)
        {
            new_id = t->getId() + 1;
        }
    }

    new_tree = std::make_shared<Tree>(new_id);

    std::set<int> indices_set(point_indices.begin(), point_indices.end());

    PointCloudPtr remaining_points(new PointCloud);
    PointCloudPtr new_points(new PointCloud);

    pcl::PointIndices::Ptr remaining_point_indices(new pcl::PointIndices);
    pcl::PointIndices::Ptr new_point_indices(new pcl::PointIndices);

    for (size_t i = 0; i < tree->getPointCloud()->size(); ++i)
    {
        if (indices_set.count(static_cast<int>(i)))
        {
            new_points->push_back(tree->getPointCloud()->at(i));
            new_point_indices->indices.push_back(
                tree->getParameters().point_indices->indices[i]
            );
        }
        else
        {
            remaining_points->push_back(tree->getPointCloud()->at(i));
            remaining_point_indices->indices.push_back(
                tree->getParameters().point_indices->indices[i]
            );
        }
    }

    tree->setPointCloud(remaining_points);
    tree->getParameters().point_indices = remaining_point_indices;

    new_tree->setPointCloud(new_points);
    new_tree->getParameters().point_indices = new_point_indices;

    if (cloud_)
    {
        for (int idx : point_indices)
        {
            if (idx >= 0 && idx < static_cast<int>(tree->getParameters().point_indices->indices.size()))
            {
                int cloud_idx = tree->getParameters().point_indices->indices[idx];
                if (cloud_idx >= 0 && cloud_idx < static_cast<int>(cloud_->size()))
                {
                    cloud_->at(cloud_idx).tree_id = new_id;
                }
            }
        }
    }

    trees_.push_back(new_tree);
    return true;
}

void SegmentationResult::clear()
{
    if (cloud_) cloud_->clear();
    if (ground_cloud_) ground_cloud_->clear();
    trees_.clear();
    tree_tops_.clear();
    dem_.resize(0, 0);
    dem_resolution_ = 1.0f;
    dem_origin_ = Eigen::Vector2f::Zero();
    stats_ = PlotStatistics();
}

}
