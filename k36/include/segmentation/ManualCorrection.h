#pragma once

#include "core/SegmentationResult.h"
#include <memory>
#include <vector>
#include <functional>

namespace forest
{

class ManualCorrection
{
public:
    ManualCorrection();
    ~ManualCorrection();

    bool mergeTrees(SegmentationResult& result, int tree_id1, int tree_id2);
    bool splitTree(SegmentationResult& result, int tree_id,
                   const std::vector<int>& point_indices,
                   TreePtr& new_tree);
    bool removeTree(SegmentationResult& result, int tree_id);

    void setSelectedPoints(const std::vector<int>& indices) { selected_points_ = indices; }
    const std::vector<int>& getSelectedPoints() const { return selected_points_; }
    void clearSelection() { selected_points_.clear(); }

    void setProgressCallback(std::function<void(int, const std::string&)> callback);

private:
    std::vector<int> selected_points_;
    std::function<void(int, const std::string&)> progress_callback_;
};

}
