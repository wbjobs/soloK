#include "visualization/PointCloudVisualizer.h"
#include <vtkPointData.h>
#include <vtkPolyData.h>
#include <vtkPolyDataMapper.h>
#include <vtkPoints.h>
#include <vtkVertexGlyphFilter.h>
#include <vtkProperty.h>
#include <vtkSphereSource.h>
#include <vtkGlyph3D.h>
#include <vtkLookupTable.h>
#include <vtkFloatArray.h>
#include <vtkCellArray.h>
#include <cmath>
#include <limits>
#include <iostream>

namespace forest
{

PointCloudVisualizer::PointCloudVisualizer()
    : color_mode_(COLOR_BY_HEIGHT)
    , point_size_(2.0f)
    , show_ground_(true)
    , show_vegetation_(true)
    , show_tree_tops_(true)
{
}

PointCloudVisualizer::~PointCloudVisualizer()
{
    clear();
}

void PointCloudVisualizer::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

void PointCloudVisualizer::setPointCloud(PointCloudConstPtr cloud)
{
    cloud_ = cloud;
}

void PointCloudVisualizer::setNormalizedCloud(PointCloudHConstPtr cloud)
{
    normalized_cloud_ = cloud;
}

void PointCloudVisualizer::setSegmentationResult(SegmentationResult::ConstPtr result)
{
    segmentation_result_ = result;
}

void PointCloudVisualizer::clear()
{
    if (renderer_)
    {
        if (point_cloud_actor_)
        {
            renderer_->RemoveActor(point_cloud_actor_);
        }
        if (ground_actor_)
        {
            renderer_->RemoveActor(ground_actor_);
        }
        if (tree_top_actor_)
        {
            renderer_->RemoveActor(tree_top_actor_);
        }
    }
    point_cloud_actor_ = nullptr;
    ground_actor_ = nullptr;
    tree_top_actor_ = nullptr;
}

void PointCloudVisualizer::getColorForId(int id, unsigned char& r, unsigned char& g, unsigned char& b)
{
    static const std::vector<std::tuple<unsigned char, unsigned char, unsigned char>> colors = {
        {255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {255, 255, 0},
        {255, 0, 255}, {0, 255, 255}, {255, 128, 0}, {128, 0, 255},
        {255, 0, 128}, {0, 255, 128}, {128, 255, 0}, {0, 128, 255},
        {255, 128, 128}, {128, 255, 128}, {128, 128, 255}, {255, 255, 128},
        {255, 128, 255}, {128, 255, 255}, {192, 64, 64}, {64, 192, 64},
        {64, 64, 192}, {192, 192, 64}, {192, 64, 192}, {64, 192, 192}
    };

    if (id < 0)
    {
        r = 128; g = 128; b = 128;
        return;
    }

    size_t idx = static_cast<size_t>(id) % colors.size();
    std::tie(r, g, b) = colors[idx];
}

void PointCloudVisualizer::createColoring(vtkSmartPointer<vtkUnsignedCharArray> colors)
{
    switch (color_mode_)
    {
        case COLOR_BY_HEIGHT:
            createHeightColoring(colors);
            break;
        case COLOR_BY_TREE_ID:
            createTreeIdColoring(colors);
            break;
        case COLOR_BY_LABEL:
            createLabelColoring(colors);
            break;
        case COLOR_BY_INTENSITY:
            createIntensityColoring(colors);
            break;
        default:
            createHeightColoring(colors);
            break;
    }
}

void PointCloudVisualizer::createHeightColoring(vtkSmartPointer<vtkUnsignedCharArray> colors)
{
    if (!normalized_cloud_ && !cloud_ && !segmentation_result_) return;

    size_t num_points = 0;
    if (normalized_cloud_)
    {
        num_points = normalized_cloud_->size();
    }
    else if (segmentation_result_ && segmentation_result_->getPointCloud())
    {
        num_points = segmentation_result_->getPointCloud()->size();
    }
    else if (cloud_)
    {
        num_points = cloud_->size();
    }

    colors->SetNumberOfComponents(3);
    colors->SetName("Colors");
    colors->SetNumberOfTuples(num_points);

    float min_h = std::numeric_limits<float>::max();
    float max_h = -std::numeric_limits<float>::max();

    for (size_t i = 0; i < num_points; ++i)
    {
        float h = 0.0f;
        if (normalized_cloud_)
        {
            h = normalized_cloud_->points[i].height;
        }
        else if (segmentation_result_ && segmentation_result_->getPointCloud())
        {
            h = segmentation_result_->getPointCloud()->points[i].height;
        }
        else if (cloud_)
        {
            h = cloud_->points[i].z;
        }
        min_h = std::min(min_h, h);
        max_h = std::max(max_h, h);
    }

    float range = max_h - min_h;
    if (range <= 0) range = 1.0f;

    for (size_t i = 0; i < num_points; ++i)
    {
        float h = 0.0f;
        if (normalized_cloud_)
        {
            h = normalized_cloud_->points[i].height;
        }
        else if (segmentation_result_ && segmentation_result_->getPointCloud())
        {
            h = segmentation_result_->getPointCloud()->points[i].height;
        }
        else if (cloud_)
        {
            h = cloud_->points[i].z;
        }

        float t = (h - min_h) / range;
        unsigned char r, g, b;

        if (t < 0.25f)
        {
            t = t / 0.25f;
            r = 0;
            g = static_cast<unsigned char>(255 * t);
            b = 255;
        }
        else if (t < 0.5f)
        {
            t = (t - 0.25f) / 0.25f;
            r = 0;
            g = 255;
            b = static_cast<unsigned char>(255 * (1 - t));
        }
        else if (t < 0.75f)
        {
            t = (t - 0.5f) / 0.25f;
            r = static_cast<unsigned char>(255 * t);
            g = 255;
            b = 0;
        }
        else
        {
            t = (t - 0.75f) / 0.25f;
            r = 255;
            g = static_cast<unsigned char>(255 * (1 - t));
            b = 0;
        }

        colors->SetTuple3(i, r, g, b);
    }
}

void PointCloudVisualizer::createTreeIdColoring(vtkSmartPointer<vtkUnsignedCharArray> colors)
{
    if (!segmentation_result_ || !segmentation_result_->getPointCloud()) return;

    size_t num_points = segmentation_result_->getPointCloud()->size();
    colors->SetNumberOfComponents(3);
    colors->SetName("Colors");
    colors->SetNumberOfTuples(num_points);

    for (size_t i = 0; i < num_points; ++i)
    {
        int tree_id = segmentation_result_->getPointCloud()->points[i].tree_id;
        unsigned char r, g, b;
        getColorForId(tree_id, r, g, b);
        colors->SetTuple3(i, r, g, b);
    }
}

void PointCloudVisualizer::createLabelColoring(vtkSmartPointer<vtkUnsignedCharArray> colors)
{
    if (!normalized_cloud_ && !cloud_ && !segmentation_result_) return;

    size_t num_points = 0;
    if (normalized_cloud_) num_points = normalized_cloud_->size();
    else if (segmentation_result_ && segmentation_result_->getPointCloud())
        num_points = segmentation_result_->getPointCloud()->size();
    else if (cloud_) num_points = cloud_->size();

    colors->SetNumberOfComponents(3);
    colors->SetName("Colors");
    colors->SetNumberOfTuples(num_points);

    for (size_t i = 0; i < num_points; ++i)
    {
        uint32_t label = 0;
        if (normalized_cloud_)
        {
            label = normalized_cloud_->points[i].label;
        }
        else if (segmentation_result_ && segmentation_result_->getPointCloud())
        {
            label = segmentation_result_->getPointCloud()->points[i].label;
        }
        else if (cloud_)
        {
            label = cloud_->points[i].label;
        }

        unsigned char r, g, b;
        switch (label)
        {
            case 0: r = 128; g = 128; b = 128; break;
            case 2: r = 139; g = 69; b = 19; break;
            case 3: r = 144; g = 238; b = 144; break;
            case 4: r = 34; g = 139; b = 34; break;
            case 5: r = 0; g = 100; b = 0; break;
            case 6: r = 255; g = 0; b = 0; break;
            case 9: r = 0; g = 0; b = 255; break;
            default: r = 200; g = 200; b = 200; break;
        }
        colors->SetTuple3(i, r, g, b);
    }
}

void PointCloudVisualizer::createIntensityColoring(vtkSmartPointer<vtkUnsignedCharArray> colors)
{
    if (!normalized_cloud_ && !cloud_ && !segmentation_result_) return;

    size_t num_points = 0;
    if (normalized_cloud_) num_points = normalized_cloud_->size();
    else if (segmentation_result_ && segmentation_result_->getPointCloud())
        num_points = segmentation_result_->getPointCloud()->size();
    else if (cloud_) num_points = cloud_->size();

    colors->SetNumberOfComponents(3);
    colors->SetName("Colors");
    colors->SetNumberOfTuples(num_points);

    float min_i = std::numeric_limits<float>::max();
    float max_i = -std::numeric_limits<float>::max();

    for (size_t i = 0; i < num_points; ++i)
    {
        float intensity = 0.0f;
        if (normalized_cloud_) intensity = normalized_cloud_->points[i].intensity;
        else if (segmentation_result_ && segmentation_result_->getPointCloud())
            intensity = segmentation_result_->getPointCloud()->points[i].intensity;
        else if (cloud_) intensity = cloud_->points[i].intensity;
        min_i = std::min(min_i, intensity);
        max_i = std::max(max_i, intensity);
    }

    float range = max_i - min_i;
    if (range <= 0) range = 1.0f;

    for (size_t i = 0; i < num_points; ++i)
    {
        float intensity = 0.0f;
        if (normalized_cloud_) intensity = normalized_cloud_->points[i].intensity;
        else if (segmentation_result_ && segmentation_result_->getPointCloud())
            intensity = segmentation_result_->getPointCloud()->points[i].intensity;
        else if (cloud_) intensity = cloud_->points[i].intensity;

        float t = (intensity - min_i) / range;
        unsigned char gray = static_cast<unsigned char>(255 * t);
        colors->SetTuple3(i, gray, gray, gray);
    }
}

void PointCloudVisualizer::update()
{
    if (!renderer_) return;

    clear();

    vtkSmartPointer<vtkPoints> points = vtkSmartPointer<vtkPoints>::New();
    vtkSmartPointer<vtkUnsignedCharArray> colors = vtkSmartPointer<vtkUnsignedCharArray>::New();

    size_t num_points = 0;
    if (normalized_cloud_) num_points = normalized_cloud_->size();
    else if (segmentation_result_ && segmentation_result_->getPointCloud())
        num_points = segmentation_result_->getPointCloud()->size();
    else if (cloud_) num_points = cloud_->size();

    if (num_points == 0) return;

    points->SetNumberOfPoints(num_points);

    for (size_t i = 0; i < num_points; ++i)
    {
        float x, y, z;
        if (normalized_cloud_)
        {
            x = normalized_cloud_->points[i].x;
            y = normalized_cloud_->points[i].y;
            z = normalized_cloud_->points[i].z;
        }
        else if (segmentation_result_ && segmentation_result_->getPointCloud())
        {
            x = segmentation_result_->getPointCloud()->points[i].x;
            y = segmentation_result_->getPointCloud()->points[i].y;
            z = segmentation_result_->getPointCloud()->points[i].z;
        }
        else
        {
            x = cloud_->points[i].x;
            y = cloud_->points[i].y;
            z = cloud_->points[i].z;
        }
        points->SetPoint(i, x, y, z);
    }

    createColoring(colors);

    vtkSmartPointer<vtkPolyData> polyData = vtkSmartPointer<vtkPolyData>::New();
    polyData->SetPoints(points);
    polyData->GetPointData()->SetScalars(colors);

    vtkSmartPointer<vtkVertexGlyphFilter> glyphFilter = vtkSmartPointer<vtkVertexGlyphFilter>::New();
    glyphFilter->SetInputData(polyData);
    glyphFilter->Update();

    vtkSmartPointer<vtkPolyDataMapper> mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
    mapper->SetInputConnection(glyphFilter->GetOutputPort());
    mapper->SetScalarModeToUsePointData();

    point_cloud_actor_ = vtkSmartPointer<vtkActor>::New();
    point_cloud_actor_->SetMapper(mapper);
    point_cloud_actor_->GetProperty()->SetPointSize(point_size_);
    point_cloud_actor_->GetProperty()->SetInterpolationToFlat();

    renderer_->AddActor(point_cloud_actor_);

    if (show_tree_tops_ && segmentation_result_ && !segmentation_result_->getTreeTops().empty())
    {
        vtkSmartPointer<vtkPoints> top_points = vtkSmartPointer<vtkPoints>::New();
        for (const auto& top : segmentation_result_->getTreeTops())
        {
            top_points->InsertNextPoint(top.x(), top.y(), top.z());
        }

        vtkSmartPointer<vtkPolyData> top_poly = vtkSmartPointer<vtkPolyData>::New();
        top_poly->SetPoints(top_points);

        vtkSmartPointer<vtkSphereSource> sphere = vtkSmartPointer<vtkSphereSource>::New();
        sphere->SetRadius(0.3);
        sphere->SetPhiResolution(10);
        sphere->SetThetaResolution(10);

        vtkSmartPointer<vtkGlyph3D> glyph = vtkSmartPointer<vtkGlyph3D>::New();
        glyph->SetInputData(top_poly);
        glyph->SetSourceConnection(sphere->GetOutputPort());
        glyph->Update();

        vtkSmartPointer<vtkPolyDataMapper> top_mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
        top_mapper->SetInputConnection(glyph->GetOutputPort());

        tree_top_actor_ = vtkSmartPointer<vtkActor>::New();
        tree_top_actor_->SetMapper(top_mapper);
        tree_top_actor_->GetProperty()->SetColor(1.0, 0.0, 0.0);
        tree_top_actor_->GetProperty()->SetOpacity(0.8);

        renderer_->AddActor(tree_top_actor_);
    }

    renderer_->ResetCamera();
}

}
