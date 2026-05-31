#pragma once

#include "core/typedefs.h"
#include "core/PointCloudData.h"
#include "core/SegmentationResult.h"
#include <vtkSmartPointer.h>
#include <vtkRenderer.h>
#include <vtkRenderWindow.h>
#include <vtkActor.h>
#include <vtkPointData.h>
#include <vtkUnsignedCharArray.h>
#include <memory>
#include <vector>

class QVTKOpenGLWidget;

namespace forest
{

class PointCloudVisualizer
{
public:
    PointCloudVisualizer();
    ~PointCloudVisualizer();

    void setRenderer(vtkSmartPointer<vtkRenderer> renderer) { renderer_ = renderer; }
    vtkSmartPointer<vtkRenderer> getRenderer() { return renderer_; }

    void setPointCloud(PointCloudConstPtr cloud);
    void setNormalizedCloud(PointCloudHConstPtr cloud);
    void setSegmentationResult(SegmentationResult::ConstPtr result);

    void setColorMode(ColorMode mode) { color_mode_ = mode; }
    ColorMode getColorMode() const { return color_mode_; }

    void setPointSize(float size) { point_size_ = size; }
    float getPointSize() const { return point_size_; }

    void showGroundPoints(bool show) { show_ground_ = show; }
    void showVegetationPoints(bool show) { show_vegetation_ = show; }
    void showTreeTops(bool show) { show_tree_tops_ = show; }

    void update();
    void clear();

    void setProgressCallback(ProgressCallback callback);

    vtkSmartPointer<vtkActor> getPointCloudActor() { return point_cloud_actor_; }
    vtkSmartPointer<vtkActor> getGroundActor() { return ground_actor_; }
    vtkSmartPointer<vtkActor> getTreeTopActor() { return tree_top_actor_; }

    void setRenderWindow(vtkSmartPointer<vtkRenderWindow> win) { render_window_ = win; }
    void setEnablePointPicking(bool enable) { enable_picking_ = enable; }
    void setPointPickingCallback(std::function<void(double, double, double)> cb) { point_picking_callback_ = cb; }
    void setShowGroundPoints(bool show) { show_ground_ = show; }
    void setTopView(bool top_view);
    void visualize(PointCloudData::Ptr data);
    void updateTreeIds(const SegmentationResult& result);
    void addPickedPoint(double x, double y, double z);
    void clearPickedPoints();

private:
    void createColoring(vtkSmartPointer<vtkUnsignedCharArray> colors);
    void createHeightColoring(vtkSmartPointer<vtkUnsignedCharArray> colors);
    void createTreeIdColoring(vtkSmartPointer<vtkUnsignedCharArray> colors);
    void createLabelColoring(vtkSmartPointer<vtkUnsignedCharArray> colors);
    void createIntensityColoring(vtkSmartPointer<vtkUnsignedCharArray> colors);

    void getColorForId(int id, unsigned char& r, unsigned char& g, unsigned char& b);

    PointCloudConstPtr cloud_;
    PointCloudHConstPtr normalized_cloud_;
    SegmentationResult::ConstPtr segmentation_result_;

    vtkSmartPointer<vtkRenderer> renderer_;
    vtkSmartPointer<vtkRenderWindow> render_window_;
    vtkSmartPointer<vtkActor> point_cloud_actor_;
    vtkSmartPointer<vtkActor> ground_actor_;
    vtkSmartPointer<vtkActor> tree_top_actor_;
    vtkSmartPointer<vtkActor> picked_points_actor_;

    ColorMode color_mode_;
    float point_size_;
    bool show_ground_;
    bool show_vegetation_;
    bool show_tree_tops_;
    bool enable_picking_;

    std::vector<std::tuple<double, double, double>> picked_points_;
    std::function<void(double, double, double)> point_picking_callback_;
    ProgressCallback progress_callback_;
};

}
