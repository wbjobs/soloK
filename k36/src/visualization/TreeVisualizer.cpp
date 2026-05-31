#include "visualization/TreeVisualizer.h"
#include <vtkCylinderSource.h>
#include <vtkPolyDataMapper.h>
#include <vtkProperty.h>
#include <vtkTransform.h>
#include <vtkTransformPolyDataFilter.h>
#include <vtkAppendPolyData.h>
#include <vtkContourFilter.h>
#include <vtkImageData.h>
#include <vtkImageShiftScale.h>
#include <vtkImageMapToColors.h>
#include <vtkLookupTable.h>
#include <vtkPoints.h>
#include <vtkPolyData.h>
#include <vtkVertexGlyphFilter.h>
#include <cmath>
#include <limits>
#include <iostream>

namespace forest
{

TreeVisualizer::TreeVisualizer()
    : selected_tree_id_(-1)
    , show_trunks_(true)
    , show_crowns_(true)
    , show_labels_(false)
{
}

TreeVisualizer::~TreeVisualizer()
{
    clear();
}

void TreeVisualizer::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

void TreeVisualizer::setSegmentationResult(SegmentationResult::ConstPtr result)
{
    segmentation_result_ = result;
}

void TreeVisualizer::clear()
{
    if (!renderer_) return;

    for (auto& actor : trunk_actors_)
    {
        renderer_->RemoveActor(actor);
    }
    for (auto& actor : crown_actors_)
    {
        renderer_->RemoveActor(actor);
    }
    for (auto& actor : label_actors_)
    {
        renderer_->RemoveActor(actor);
    }

    trunk_actors_.clear();
    crown_actors_.clear();
    label_actors_.clear();
}

void TreeVisualizer::update()
{
    if (!renderer_ || !segmentation_result_) return;

    clear();

    const auto& trees = segmentation_result_->getTrees();

    for (size_t i = 0; i < trees.size(); ++i)
    {
        const auto& tree = trees[i];
        if (!tree) continue;

        if (show_trunks_)
        {
            vtkSmartPointer<vtkActor> trunk_actor;
            createTrunkActor(*tree, trunk_actor);
            if (trunk_actor)
            {
                trunk_actors_.push_back(trunk_actor);
                renderer_->AddActor(trunk_actor);
            }
        }

        if (show_crowns_)
        {
            vtkSmartPointer<vtkActor> crown_actor;
            createCrownActor(*tree, crown_actor);
            if (crown_actor)
            {
                crown_actors_.push_back(crown_actor);
                renderer_->AddActor(crown_actor);
            }
        }
    }

    renderer_->ResetCamera();
}

void TreeVisualizer::createTrunkActor(const Tree& tree, vtkSmartPointer<vtkActor>& actor)
{
    const auto& params = tree.getParameters();

    if (params.dbh <= 0 || params.height <= 0)
    {
        actor = nullptr;
        return;
    }

    float radius = params.dbh_corrected > 0 ? params.dbh_corrected / 2.0f : params.dbh / 2.0f;
    float height = params.height * 0.65f;

    Eigen::Vector3f base = params.trunk_base;
    Eigen::Vector3f top = params.treetop;

    vtkSmartPointer<vtkCylinderSource> cylinder = vtkSmartPointer<vtkCylinderSource>::New();
    cylinder->SetRadius(radius);
    cylinder->SetHeight(height);
    cylinder->SetResolution(20);
    cylinder->SetCenter(0, 0, 0);

    vtkSmartPointer<vtkTransform> transform = vtkSmartPointer<vtkTransform>::New();
    transform->PostMultiply();

    Eigen::Vector3f direction = top - base;
    direction.normalize();

    Eigen::Vector3f y_axis(0, 1, 0);
    Eigen::Vector3f rotation_axis = y_axis.cross(direction);
    float rotation_angle = std::acos(y_axis.dot(direction)) * 180.0f / static_cast<float>(M_PI);

    if (rotation_axis.norm() > 0.001f)
    {
        rotation_axis.normalize();
        transform->RotateWXYZ(rotation_angle, rotation_axis.x(), rotation_axis.y(), rotation_axis.z());
    }

    Eigen::Vector3f center = base + direction * (height / 2.0f);
    transform->Translate(center.x(), center.y(), center.z());

    vtkSmartPointer<vtkTransformPolyDataFilter> transform_filter =
        vtkSmartPointer<vtkTransformPolyDataFilter>::New();
    transform_filter->SetInputConnection(cylinder->GetOutputPort());
    transform_filter->SetTransform(transform);
    transform_filter->Update();

    vtkSmartPointer<vtkPolyDataMapper> mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
    mapper->SetInputConnection(transform_filter->GetOutputPort());

    actor = vtkSmartPointer<vtkActor>::New();
    actor->SetMapper(mapper);

    unsigned char r, g, b;
    if (tree.getId() == selected_tree_id_)
    {
        r = 255; g = 215; b = 0;
        actor->GetProperty()->SetOpacity(0.9);
    }
    else
    {
        r = 139; g = 90; b = 43;
        actor->GetProperty()->SetOpacity(0.6);
    }

    actor->GetProperty()->SetColor(r / 255.0, g / 255.0, b / 255.0);
    actor->GetProperty()->SetSpecular(0.3);
    actor->GetProperty()->SetSpecularPower(30);
}

void TreeVisualizer::createCrownActor(const Tree& tree, vtkSmartPointer<vtkActor>& actor)
{
    const auto& params = tree.getParameters();
    const auto& cloud = tree.getPointCloud();

    if (!cloud || cloud->empty() || params.crown_indices->indices.empty())
    {
        actor = nullptr;
        return;
    }

    vtkSmartPointer<vtkPoints> points = vtkSmartPointer<vtkPoints>::New();
    for (int idx : params.crown_indices->indices)
    {
        if (idx >= 0 && idx < static_cast<int>(cloud->size()))
        {
            const auto& p = cloud->points[idx];
            points->InsertNextPoint(p.x, p.y, p.z);
        }
    }

    if (points->GetNumberOfPoints() < 4)
    {
        actor = nullptr;
        return;
    }

    vtkSmartPointer<vtkPolyData> poly_data = vtkSmartPointer<vtkPolyData>::New();
    poly_data->SetPoints(points);

    vtkSmartPointer<vtkVertexGlyphFilter> glyph_filter = vtkSmartPointer<vtkVertexGlyphFilter>::New();
    glyph_filter->SetInputData(poly_data);
    glyph_filter->Update();

    vtkSmartPointer<vtkPolyDataMapper> mapper = vtkSmartPointer<vtkPolyDataMapper>::New();
    mapper->SetInputConnection(glyph_filter->GetOutputPort());

    actor = vtkSmartPointer<vtkActor>::New();
    actor->SetMapper(mapper);

    unsigned char r, g, b;
    if (tree.getId() == selected_tree_id_)
    {
        r = 255; g = 215; b = 0;
        actor->GetProperty()->SetPointSize(4.0);
    }
    else
    {
        r = 34; g = 139; b = 34;
        actor->GetProperty()->SetPointSize(2.0);
    }

    actor->GetProperty()->SetColor(r / 255.0, g / 255.0, b / 255.0);
    actor->GetProperty()->SetOpacity(0.7);
}

vtkSmartPointer<vtkImageData> TreeVisualizer::createTopViewProjection(bool use_pseudocolor)
{
    if (!segmentation_result_ || !segmentation_result_->getPointCloud())
    {
        return nullptr;
    }

    const auto& cloud = segmentation_result_->getPointCloud();
    if (cloud->empty()) return nullptr;

    float min_x = std::numeric_limits<float>::max();
    float max_x = -std::numeric_limits<float>::max();
    float min_y = std::numeric_limits<float>::max();
    float max_y = -std::numeric_limits<float>::max();
    float min_z = std::numeric_limits<float>::max();
    float max_z = -std::numeric_limits<float>::max();

    for (const auto& p : cloud->points)
    {
        min_x = std::min(min_x, p.x);
        max_x = std::max(max_x, p.x);
        min_y = std::min(min_y, p.y);
        max_y = std::max(max_y, p.y);
        min_z = std::min(min_z, p.z);
        max_z = std::max(max_z, p.z);
    }

    float resolution = 0.5f;
    int width = static_cast<int>(std::ceil((max_x - min_x) / resolution)) + 1;
    int height = static_cast<int>(std::ceil((max_y - min_y) / resolution)) + 1;

    vtkSmartPointer<vtkImageData> image = vtkSmartPointer<vtkImageData>::New();
    image->SetDimensions(width, height, 1);
    image->SetSpacing(resolution, resolution, 1.0);
    image->SetOrigin(min_x, min_y, 0);

    if (use_pseudocolor)
    {
        image->AllocateScalars(VTK_UNSIGNED_CHAR, 3);
    }
    else
    {
        image->AllocateScalars(VTK_UNSIGNED_CHAR, 1);
    }

    Eigen::MatrixXf height_map = Eigen::MatrixXf::Constant(height, width, -std::numeric_limits<float>::max());
    Eigen::MatrixXi count_map = Eigen::MatrixXi::Zero(height, width);
    Eigen::MatrixXi id_map = Eigen::MatrixXi::Constant(height, width, -1);

    for (const auto& p : cloud->points)
    {
        int col = static_cast<int>((p.x - min_x) / resolution);
        int row = static_cast<int>((p.y - min_y) / resolution);

        if (row >= 0 && row < height && col >= 0 && col < width)
        {
            if (p.height > height_map(row, col))
            {
                height_map(row, col) = p.height;
                id_map(row, col) = p.tree_id;
            }
            count_map(row, col)++;
        }
    }

    float z_range = max_z - min_z;
    if (z_range <= 0) z_range = 1.0f;

    for (int row = 0; row < height; ++row)
    {
        for (int col = 0; col < width; ++col)
        {
            unsigned char* pixel = static_cast<unsigned char*>(image->GetScalarPointer(col, height - 1 - row, 0));

            if (count_map(row, col) == 0)
            {
                if (use_pseudocolor)
                {
                    pixel[0] = 255;
                    pixel[1] = 255;
                    pixel[2] = 255;
                }
                else
                {
                    pixel[0] = 255;
                }
            }
            else
            {
                float h = height_map(row, col);
                float t = std::max(0.0f, std::min(1.0f, h / z_range));

                if (use_pseudocolor)
                {
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

                    pixel[0] = r;
                    pixel[1] = g;
                    pixel[2] = b;
                }
                else
                {
                    unsigned char gray = static_cast<unsigned char>(255 * (1.0f - t));
                    pixel[0] = gray;
                }
            }
        }
    }

    return image;
}

}
