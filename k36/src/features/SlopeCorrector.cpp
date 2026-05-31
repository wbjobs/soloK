#include "features/SlopeCorrector.h"
#include <cmath>
#include <iostream>
#include <limits>

namespace forest
{

SlopeCorrector::SlopeCorrector()
{
}

SlopeCorrector::~SlopeCorrector()
{
}

void SlopeCorrector::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

bool SlopeCorrector::getDEMWindow(float x, float y, const DEMGrid& dem,
                                  float dem_resolution, const Eigen::Vector2f& dem_origin,
                                  int window_size, Eigen::MatrixXf& window)
{
    if (dem.size() == 0) return false;

    float col_f = (x - dem_origin.x()) / dem_resolution;
    float row_f = (y - dem_origin.y()) / dem_resolution;

    int center_col = static_cast<int>(std::round(col_f));
    int center_row = static_cast<int>(std::round(row_f));

    int half = window_size / 2;
    window = Eigen::MatrixXf::Constant(window_size, window_size,
                                         std::numeric_limits<float>::quiet_NaN());

    for (int dr = -half; dr <= half; ++dr)
    {
        for (int dc = -half; dc <= half; ++dc)
        {
            int r = center_row + dr;
            int c = center_col + dc;
            if (r >= 0 && r < dem.rows() && c >= 0 && c < dem.cols())
            {
                float h = dem(r, c);
                if (!std::isnan(h))
                {
                    window(dr + half, dc + half) = h;
                }
            }
        }
    }

    return true;
}

bool SlopeCorrector::fitPlaneToDEM(const Eigen::MatrixXf& window, float cell_size,
                                   Eigen::Vector3f& normal, float& slope, float& aspect)
{
    std::vector<Eigen::Vector3f> points;
    int half = window.rows() / 2;

    for (int r = 0; r < window.rows(); ++r)
    {
        for (int c = 0; c < window.cols(); ++c)
        {
            float h = window(r, c);
            if (!std::isnan(h))
            {
                float x = (c - half) * cell_size;
                float y = (r - half) * cell_size;
                points.push_back(Eigen::Vector3f(x, y, h));
            }
        }
    }

    if (points.size() < 3)
    {
        normal = Eigen::Vector3f::UnitZ();
        slope = 0.0f;
        aspect = 0.0f;
        return false;
    }

    Eigen::Vector3f centroid(0, 0, 0);
    for (const auto& p : points)
    {
        centroid += p;
    }
    centroid /= static_cast<float>(points.size());

    Eigen::MatrixXf A(points.size(), 3);
    for (size_t i = 0; i < points.size(); ++i)
    {
        A.row(i) = points[i] - centroid;
    }

    Eigen::JacobiSVD<Eigen::MatrixXf> svd(A, Eigen::ComputeFullV);
    normal = svd.matrixV().col(2);

    if (normal.z() < 0)
    {
        normal = -normal;
    }

    normal.normalize();

    slope = std::acos(normal.z()) * 180.0f / static_cast<float>(M_PI);

    if (std::abs(slope) < 0.1f)
    {
        aspect = 0.0f;
    }
    else
    {
        float north = -normal.y();
        float east = normal.x();
        aspect = std::atan2(east, north) * 180.0f / static_cast<float>(M_PI);
        if (aspect < 0)
        {
            aspect += 360.0f;
        }
    }

    return true;
}

bool SlopeCorrector::computeSlopeAtPoint(float x, float y, const DEMGrid& dem,
                                         float dem_resolution, const Eigen::Vector2f& dem_origin,
                                         float& slope_angle, float& aspect_angle,
                                         Eigen::Vector3f& normal)
{
    Eigen::MatrixXf window;
    if (!getDEMWindow(x, y, dem, dem_resolution, dem_origin, params_.window_size, window))
    {
        slope_angle = 0.0f;
        aspect_angle = 0.0f;
        normal = Eigen::Vector3f::UnitZ();
        return false;
    }

    return fitPlaneToDEM(window, dem_resolution, normal, slope_angle, aspect_angle);
}

float SlopeCorrector::correctDBH(float raw_dbh, float slope_angle)
{
    if (slope_angle < params_.min_slope_for_correction)
    {
        return raw_dbh;
    }

    float slope_rad = slope_angle * static_cast<float>(M_PI) / 180.0f;
    float corrected_dbh = raw_dbh / std::cos(slope_rad);

    return corrected_dbh;
}

float SlopeCorrector::correctHeight(float raw_height, float slope_angle)
{
    if (slope_angle < params_.min_slope_for_correction || !params_.correct_height)
    {
        return raw_height;
    }

    float slope_rad = slope_angle * static_cast<float>(M_PI) / 180.0f;
    float corrected_height = raw_height * std::cos(slope_rad);

    return corrected_height;
}

bool SlopeCorrector::correctTreeParameters(Tree& tree, const DEMGrid& dem,
                                           float dem_resolution, const Eigen::Vector2f& dem_origin)
{
    auto& params = tree.getParameters();

    Eigen::Vector3f trunk_base = params.trunk_base;
    if (trunk_base.norm() == 0)
    {
        trunk_base = params.crown_center;
    }

    float slope_angle, aspect_angle;
    Eigen::Vector3f normal;

    if (!computeSlopeAtPoint(trunk_base.x(), trunk_base.y(), dem, dem_resolution, dem_origin,
                             slope_angle, aspect_angle, normal))
    {
        return false;
    }

    params.slope_angle = slope_angle;
    params.aspect_angle = aspect_angle;

    if (params_.correct_dbh && params.dbh > 0)
    {
        params.dbh_corrected = correctDBH(params.dbh, slope_angle);
    }
    else
    {
        params.dbh_corrected = params.dbh;
    }

    if (params_.correct_height && params.height > 0)
    {
        params.height = correctHeight(params.height, slope_angle);
    }

    if (params_.correct_crown)
    {
        float correction_factor = std::cos(slope_angle * static_cast<float>(M_PI) / 180.0f);
        params.crown_diameter_x /= correction_factor;
        params.crown_diameter_y /= correction_factor;
        params.crown_diameter_mean = (params.crown_diameter_x + params.crown_diameter_y) / 2.0f;
        params.crown_area /= correction_factor * correction_factor;
    }

    return true;
}

}
