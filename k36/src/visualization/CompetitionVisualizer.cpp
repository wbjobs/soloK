#include "visualization/CompetitionVisualizer.h"
#include <vtkSphereSource.h>
#include <vtkLineSource.h>
#include <vtkTubeFilter.h>
#include <vtkPolyDataMapper.h>
#include <vtkProperty.h>
#include <vtkPoints.h>
#include <vtkCellArray.h>
#include <vtkPolyData.h>
#include <cmath>

namespace forest
{

CompetitionVisualizer::CompetitionVisualizer()
    : show_edges_(true)
    , show_delaunay_(false)
    , node_size_scale_(1.0f)
    , edge_width_scale_(1.0f)
{
}

CompetitionVisualizer::~CompetitionVisualizer()
{
    clear();
}

void CompetitionVisualizer::setProgressCallback(ProgressCallback callback)
{
    progress_callback_ = callback;
}

void CompetitionVisualizer::clear()
{
    if (renderer_)
    {
        for (auto& actor : node_actors_)
        {
            renderer_->RemoveActor(actor);
        }
        for (auto& actor : edge_actors_)
        {
            renderer_->RemoveActor(actor);
        }
        for (auto& actor : delaunay_actors_)
        {
            renderer_->RemoveActor(actor);
        }
        for (auto& actor : defect_actors_)
        {
            renderer_->RemoveActor(actor);
        }
        if (drilling_path_actor_)
        {
            renderer_->RemoveActor(drilling_path_actor_);
        }
    }

    node_actors_.clear();
    edge_actors_.clear();
    delaunay_actors_.clear();
    defect_actors_.clear();
    drilling_path_actor_ = nullptr;
}

void CompetitionVisualizer::updateVisibility()
{
    for (auto& actor : edge_actors_)
    {
        actor->SetVisibility(show_edges_);
    }
    for (auto& actor : delaunay_actors_)
    {
        actor->SetVisibility(show_delaunay_);
    }
}

void CompetitionVisualizer::getColorForCompetition(float intensity, unsigned char& r,
                                                   unsigned char& g, unsigned char& b)
{
    intensity = std::max(0.0f, std::min(1.0f, intensity));

    if (intensity < 0.25f)
    {
        float t = intensity / 0.25f;
        r = static_cast<unsigned char>(0);
        g = static_cast<unsigned char>(255 * t);
        b = static_cast<unsigned char>(255);
    }
    else if (intensity < 0.5f)
    {
        float t = (intensity - 0.25f) / 0.25f;
        r = static_cast<unsigned char>(0);
        g = static_cast<unsigned char>(255);
        b = static_cast<unsigned char>(255 * (1 - t));
    }
    else if (intensity < 0.75f)
    {
        float t = (intensity - 0.5f) / 0.25f;
        r = static_cast<unsigned char>(255 * t);
        g = static_cast<unsigned char>(255);
        b = static_cast<unsigned char>(0);
    }
    else
    {
        float t = (intensity - 0.75f) / 0.25f;
        r = static_cast<unsigned char>(255);
        g = static_cast<unsigned char>(255 * (1 - t));
        b = static_cast<unsigned char>(0);
    }
}

void CompetitionVisualizer::getDistinctColor(int id, unsigned char& r,
                                              unsigned char& g, unsigned char& b)
{
    float h = std::fmod(static_cast<float>(id) * 0.618033988749895f, 1.0f);
    float s = 0.7f;
    float v = 0.9f;

    int i = static_cast<int>(h * 6);
    float f = h * 6 - i;
    float p = v * (1 - s);
    float q = v * (1 - f * s);
    float t = v * (1 - (1 - f) * s);

    switch (i % 6)
    {
    case 0: r = v * 255; g = t * 255; b = p * 255; break;
    case 1: r = q * 255; g = v * 255; b = p * 255; break;
    case 2: r = p * 255; g = v * 255; b = t * 255; break;
    case 3: r = p * 255; g = q * 255; b = v * 255; break;
    case 4: r = t * 255; g = p * 255; b = v * 255; break;
    case 5: r = v * 255; g = p * 255; b = q * 255; break;
    }
}

vtkSmartPointer<vtkActor> CompetitionVisualizer::createNetworkNode(const Tree& tree, float size)
{
    auto sphere = vtkSmartPointer<vtkSphereSource>::New();
    sphere->SetCenter(tree.getParameters().trunk_base.x(),
                       tree.getParameters().trunk_base.y(),
                       tree.getParameters().trunk_base.z());
    sphere->SetRadius(size * node_size_scale_);
    sphere->SetPhiResolution(16);
    sphere->SetThetaResolution(16);

    auto mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
    mapper->SetInputConnection(sphere->GetOutputPort());

    auto actor = vtkSmartPointer<vtkActor>::New();
    actor->SetMapper(mapper);

    float competition = 0.0f;
    unsigned char r, g, b;
    getColorForCompetition(competition, r, g, b);
    actor->GetProperty()->SetColor(r / 255.0, g / 255.0, b / 255.0);
    actor->GetProperty()->SetOpacity(0.8);

    return actor;
}

vtkSmartPointer<vtkActor> CompetitionVisualizer::createNetworkEdge(const CompetitionEdge& edge,
                                                                     const SegmentationResult& result)
{
    auto tree1 = result.findTree(edge.target_tree_id);
    auto tree2 = result.findTree(edge.competitor_tree_id);
    if (!tree1 || !tree2) return nullptr;

    const auto& p1 = tree1->getParameters().trunk_base;
    const auto& p2 = tree2->getParameters().trunk_base;

    auto line = vtkSmartPointer<vtkLineSource>::New();
    line->SetPoint1(p1.x(), p1.y(), p1.z());
    line->SetPoint2(p2.x(), p2.y(), p2.z());
    line->SetResolution(2);

    float edge_width = 0.02f + edge.hegyi_index * 0.05f;
    edge_width *= edge_width_scale_;

    auto tube = vtkSmartPointer<vtkTubeFilter>::New();
    tube->SetInputConnection(line->GetOutputPort());
    tube->SetRadius(edge_width);
    tube->SetNumberOfSides(8);

    auto mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
    mapper->SetInputConnection(tube->GetOutputPort());

    auto actor = vtkSmartPointer<vtkActor>::New();
    actor->SetMapper(mapper);

    float intensity = std::min(1.0f, edge.hegyi_index / 2.0f);
    unsigned char r, g, b;
    getColorForCompetition(intensity, r, g, b);
    actor->GetProperty()->SetColor(r / 255.0, g / 255.0, b / 255.0);
    actor->GetProperty()->SetOpacity(0.6);

    return actor;
}

vtkSmartPointer<vtkActor> CompetitionVisualizer::createDelaunayTriangle(
    const DelaunayTriangle& tri, const std::vector<Eigen::Vector2f>& positions)
{
    if (tri.vertices[0] < 0 || tri.vertices[1] < 0 || tri.vertices[2] < 0) return nullptr;
    if (tri.vertices[0] >= (int)positions.size() ||
        tri.vertices[1] >= (int)positions.size() ||
        tri.vertices[2] >= (int)positions.size()) return nullptr;

    auto points = vtkSmartPointer<vtkPoints>::New();
    auto triangles = vtkSmartPointer<vtkCellArray>::New();

    for (int i = 0; i < 3; ++i)
    {
        const auto& pos = positions[tri.vertices[i]];
        points->InsertNextPoint(pos.x(), pos.y(), 0.0f);
    }

    vtkIdType ids[] = {0, 1, 2};
    triangles->InsertNextCell(3, ids);

    auto polyData = vtkSmartPointer<vtkPolyData>::New();
    polyData->SetPoints(points);
    polyData->SetPolys(triangles);

    auto mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
    mapper->SetInputData(polyData);

    auto actor = vtkSmartPointer<vtkActor>::New();
    actor->SetMapper(mapper);
    actor->GetProperty()->SetRepresentationToWireframe();
    actor->GetProperty()->SetColor(0.5, 0.5, 0.5);
    actor->GetProperty()->SetOpacity(0.4);
    actor->SetVisibility(show_delaunay_);

    return actor;
}

vtkSmartPointer<vtkActor> CompetitionVisualizer::createDrillingPathActor(const DrillingPath& path)
{
    auto line = vtkSmartPointer<vtkLineSource>::New();
    line->SetPoint1(path.entry_point.x(), path.entry_point.y(), path.entry_point.z());
    line->SetPoint2(path.exit_point.x(), path.exit_point.y(), path.exit_point.z());
    line->SetResolution(10);

    auto tube = vtkSmartPointer<vtkTubeFilter>::New();
    tube->SetInputConnection(line->GetOutputPort());
    tube->SetRadius(0.005);
    tube->SetNumberOfSides(12);

    auto mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
    mapper->SetInputConnection(tube->GetOutputPort());

    auto actor = vtkSmartPointer<vtkActor>::New();
    actor->SetMapper(mapper);

    if (path.is_optimal)
    {
        actor->GetProperty()->SetColor(0.0, 1.0, 0.0);
    }
    else
    {
        actor->GetProperty()->SetColor(1.0, 0.5, 0.0);
    }
    actor->GetProperty()->SetOpacity(0.9);

    return actor;
}

vtkSmartPointer<vtkActor> CompetitionVisualizer::createDefectActor(const StemDefect& defect)
{
    auto sphere = vtkSmartPointer<vtkSphereSource>::New();
    sphere->SetCenter(defect.center.x(), defect.center.y(), defect.center.z());
    sphere->SetRadius(std::max(defect.radius, 0.01f));
    sphere->SetPhiResolution(12);
    sphere->SetThetaResolution(12);

    auto mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
    mapper->SetInputConnection(sphere->GetOutputPort());

    auto actor = vtkSmartPointer<vtkActor>::New();
    actor->SetMapper(mapper);

    switch (defect.type)
    {
    case StemDefect::KNOT:
        actor->GetProperty()->SetColor(0.8, 0.2, 0.2);
        break;
    case StemDefect::CRACK:
        actor->GetProperty()->SetColor(0.2, 0.2, 0.8);
        break;
    case StemDefect::DECAY:
        actor->GetProperty()->SetColor(0.5, 0.3, 0.1);
        break;
    case StemDefect::SCAR:
        actor->GetProperty()->SetColor(0.8, 0.8, 0.2);
        break;
    default:
        actor->GetProperty()->SetColor(0.5, 0.5, 0.5);
    }
    actor->GetProperty()->SetOpacity(0.7);

    return actor;
}

void CompetitionVisualizer::visualizeCompetitionNetwork(const CompetitionAnalyzer& analyzer,
                                                         const SegmentationResult& result)
{
    clear();

    if (!renderer_) return;

    const auto& trees = result.getTrees();
    const auto& edges = analyzer.getAllEdges();
    const auto& triangles = analyzer.getDelaunayTriangles();

    if (progress_callback_)
    {
        progress_callback_(20, "创建竞争网络节点...");
    }

    float max_dbh = 0.0f;
    for (const auto& tree : trees)
    {
        if (tree)
        {
            max_dbh = std::max(max_dbh, tree->getParameters().dbh_corrected);
        }
    }

    for (const auto& tree : trees)
    {
        if (!tree) continue;

        float node_size = 0.1f;
        if (max_dbh > 0)
        {
            node_size = tree->getParameters().dbh_corrected / max_dbh * 0.3f + 0.05f;
        }

        auto actor = createNetworkNode(*tree, node_size);
        if (actor)
        {
            renderer_->AddActor(actor);
            node_actors_.push_back(actor);
        }
    }

    if (progress_callback_)
    {
        progress_callback_(50, "创建竞争网络边...");
    }

    for (const auto& edge : edges)
    {
        auto actor = createNetworkEdge(edge, result);
        if (actor)
        {
            actor->SetVisibility(show_edges_);
            renderer_->AddActor(actor);
            edge_actors_.push_back(actor);
        }
    }

    if (progress_callback_)
    {
        progress_callback_(80, "创建Delaunay三角网...");
    }

    std::vector<Eigen::Vector2f> positions;
    for (const auto& tree : trees)
    {
        if (tree)
        {
            positions.push_back(Eigen::Vector2f(
                tree->getParameters().trunk_base.x(),
                tree->getParameters().trunk_base.y()
            ));
        }
    }

    for (const auto& tri : triangles)
    {
        auto actor = createDelaunayTriangle(tri, positions);
        if (actor)
        {
            renderer_->AddActor(actor);
            delaunay_actors_.push_back(actor);
        }
    }

    if (progress_callback_)
    {
        progress_callback_(100, "竞争网络可视化完成");
    }
}

void CompetitionVisualizer::visualizeDrillingPath(const DrillingPath& path, const Tree& tree)
{
    if (!renderer_) return;

    for (auto& actor : defect_actors_)
    {
        renderer_->RemoveActor(actor);
    }
    defect_actors_.clear();

    if (drilling_path_actor_)
    {
        renderer_->RemoveActor(drilling_path_actor_);
    }

    for (const auto& defect : path.defects_along_path)
    {
        auto actor = createDefectActor(defect);
        if (actor)
        {
            renderer_->AddActor(actor);
            defect_actors_.push_back(actor);
        }
    }

    drilling_path_actor_ = createDrillingPathActor(path);
    if (drilling_path_actor_)
    {
        renderer_->AddActor(drilling_path_actor_);
    }
}

}
