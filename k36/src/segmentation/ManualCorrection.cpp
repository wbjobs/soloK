#include "segmentation/ManualCorrection.h"
#include <iostream>

namespace forest
{

ManualCorrection::ManualCorrection()
{
}

ManualCorrection::~ManualCorrection()
{
}

void ManualCorrection::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

bool ManualCorrection::mergeTrees(SegmentationResult& result, int tree_id1, int tree_id2)
{
    if (progress_callback_)
    {
        progress_callback_(0, "正在合并树木 " + std::to_string(tree_id1) +
                             " 和 " + std::to_string(tree_id2));
    }

    bool success = result.mergeTrees(tree_id1, tree_id2);

    if (progress_callback_)
    {
        if (success)
        {
            progress_callback_(100, "树木合并成功");
        }
        else
        {
            progress_callback_(100, "树木合并失败");
        }
    }

    return success;
}

bool ManualCorrection::splitTree(SegmentationResult& result, int tree_id,
                                 const std::vector<int>& point_indices,
                                 TreePtr& new_tree)
{
    if (progress_callback_)
    {
        progress_callback_(0, "正在分割树木 " + std::to_string(tree_id));
    }

    bool success = result.splitTree(tree_id, point_indices, new_tree);

    if (progress_callback_)
    {
        if (success)
        {
            progress_callback_(100, "树木分割成功，新树木ID: " +
                                 std::to_string(new_tree->getId()));
        }
        else
        {
            progress_callback_(100, "树木分割失败");
        }
    }

    return success;
}

bool ManualCorrection::removeTree(SegmentationResult& result, int tree_id)
{
    if (progress_callback_)
    {
        progress_callback_(0, "正在删除树木 " + std::to_string(tree_id));
    }

    bool success = result.removeTree(tree_id);

    if (progress_callback_)
    {
        if (success)
        {
            progress_callback_(100, "树木删除成功");
        }
        else
        {
            progress_callback_(100, "树木删除失败");
        }
    }

    return success;
}

}
