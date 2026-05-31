#include "core/Tree.h"
#include <pcl/common/centroid.h>

namespace forest
{

Tree::Tree()
    : id_(-1)
    , cloud_(new PointCloud)
{
}

Tree::Tree(int id)
    : id_(id)
    , cloud_(new PointCloud)
{
    params_.tree_id = id;
}

Tree::~Tree()
{
}

void Tree::addPoint(const PointXYZIL& point)
{
    if (cloud_)
    {
        cloud_->push_back(point);
    }
}

void Tree::clear()
{
    if (cloud_)
    {
        cloud_->clear();
    }
    params_ = TreeParameters();
    params_.tree_id = id_;
}

}
