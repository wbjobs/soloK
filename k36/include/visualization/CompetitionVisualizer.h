#pragma once

#include "core/typedefs.h"
#include "core/SegmentationResult.h"
#include "features/CompetitionIndex.h"
#include "features/IncrementBorer.h"
#include <vtkSmartPointer.h>
#include <vtkRenderer.h>
#include <vtkActor.h>
#include <vtkPolyData.h>
#include <vtkPolyDataMapper.h>
#include <memory>

namespace forest
{

class CompetitionVisualizer
{
public:
    CompetitionVisualizer();
    ~CompetitionVisualizer();

    void setRenderer(vtkSmartPointer<vtkRenderer> renderer) { renderer_ = renderer; }

    void visualizeCompetitionNetwork(const CompetitionAnalyzer& analyzer,
                                      const SegmentationResult& result);
    void visualizeDrillingPath(const DrillingPath& path, const Tree& tree);

    void setShowNetworkEdges(bool show) { show_edges_ = show; updateVisibility(); }
    void setShowDelaunay(bool show) { show_delaunay_ = show; updateVisibility(); }
    void setNodeSizeScale(float scale) { node_size_scale_ = scale; }
    void setEdgeWidthScale(float scale) { edge_width_scale_ = scale; }

    void clear();
    void updateVisibility();

    void setProgressCallback(ProgressCallback callback);

private:
    vtkSmartPointer<vtkActor> createNetworkNode(const Tree& tree, float size);
    vtkSmartPointer<vtkActor> createNetworkEdge(const CompetitionEdge& edge,
                                                 const SegmentationResult& result);
    vtkSmartPointer<vtkActor> createDelaunayTriangle(const DelaunayTriangle& tri,
                                                      const std::vector<Eigen::Vector2f>& positions);
    vtkSmartPointer<vtkActor> createDrillingPathActor(const DrillingPath& path);
    vtkSmartPointer<vtkActor> createDefectActor(const StemDefect& defect);

    void getColorForCompetition(float intensity, unsigned char& r, unsigned char& g, unsigned char& b);
    void getDistinctColor(int id, unsigned char& r, unsigned char& g, unsigned char& b);

    vtkSmartPointer<vtkRenderer> renderer_;

    std::vector<vtkSmartPointer<vtkActor>> node_actors_;
    std::vector<vtkSmartPointer<vtkActor>> edge_actors_;
    std::vector<vtkSmartPointer<vtkActor>> delaunay_actors_;
    std::vector<vtkSmartPointer<vtkActor>> defect_actors_;
    vtkSmartPointer<vtkActor> drilling_path_actor_;

    bool show_edges_;
    bool show_delaunay_;
    float node_size_scale_;
    float edge_width_scale_;

    ProgressCallback progress_callback_;
};

}
