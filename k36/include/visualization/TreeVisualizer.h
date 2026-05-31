#pragma once

#include "core/typedefs.h"
#include "core/Tree.h"
#include "core/SegmentationResult.h"
#include "core/PointCloudData.h"
#include <vtkSmartPointer.h>
#include <vtkRenderer.h>
#include <vtkActor.h>
#include <vtkPolyDataMapper.h>
#include <vtkImageData.h>
#include <vtkRenderWindow.h>
#include <Eigen/Dense>
#include <memory>
#include <vector>

namespace forest
{

class TreeVisualizer
{
public:
    TreeVisualizer();
    ~TreeVisualizer();

    void setRenderer(vtkSmartPointer<vtkRenderer> renderer) { renderer_ = renderer; }
    void setRenderWindow(vtkSmartPointer<vtkRenderWindow> win) { render_window_ = win; }

    void setSegmentationResult(SegmentationResult::ConstPtr result) { segmentation_result_ = result; }
    void setCloudData(PointCloudData::ConstPtr data) { cloud_data_ = data; }
    void setSelectedTreeId(int id) { selected_tree_id_ = id; highlightTree(id); }
    int getSelectedTreeId() const { return selected_tree_id_; }

    void setShowTrunks(bool show) { show_trunks_ = show; updateVisibility(); }
    void setShowCrowns(bool show) { show_crowns_ = show; updateVisibility(); }
    void setShowTreetops(bool show) { show_treetops_ = show; updateVisibility(); }

    void visualize(const SegmentationResult& result, PointCloudData::ConstPtr data);
    void highlightTree(int tree_id);
    void updateVisibility();

    void update();
    void clear();

    vtkSmartPointer<vtkImageData> createTopViewProjection(bool use_pseudocolor = true);

    void setProgressCallback(ProgressCallback callback);

private:
    void createTrunkActor(const Tree& tree, vtkSmartPointer<vtkActor>& actor);
    void createCrownActor(const Tree& tree, vtkSmartPointer<vtkActor>& actor);
    void createTreetopActor(const Tree& tree, vtkSmartPointer<vtkActor>& actor);

    vtkSmartPointer<vtkRenderer> renderer_;
    vtkSmartPointer<vtkRenderWindow> render_window_;
    SegmentationResult::ConstPtr segmentation_result_;
    PointCloudData::ConstPtr cloud_data_;

    std::vector<vtkSmartPointer<vtkActor>> trunk_actors_;
    std::vector<vtkSmartPointer<vtkActor>> crown_actors_;
    std::vector<vtkSmartPointer<vtkActor>> treetop_actors_;
    std::vector<vtkSmartPointer<vtkActor>> label_actors_;

    int selected_tree_id_;
    bool show_trunks_;
    bool show_crowns_;
    bool show_treetops_;
    bool show_labels_;

    ProgressCallback progress_callback_;
};

}
