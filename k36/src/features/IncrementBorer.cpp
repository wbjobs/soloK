#include "features/IncrementBorer.h"
#include <cmath>
#include <algorithm>
#include <iostream>

namespace forest
{

IncrementBorerPlanner::IncrementBorerPlanner()
    : stem_tilt_deg_(0.0f)
    , stem_tilt_direction_deg_(0.0f)
    , stem_direction_(Eigen::Vector3f(0, 0, 1))
    , max_drill_depth_(0.15f)
    , min_defect_distance_(0.03f)
    , sample_interval_(5)
{
}

IncrementBorerPlanner::~IncrementBorerPlanner()
{
}

void IncrementBorerPlanner::setProgressCallback(ProgressCallback callback)
{
    progress_callback_ = callback;
}

bool IncrementBorerPlanner::extractStemCrossSections(const Tree& tree)
{
    cross_sections_.clear();

    if (!tree.getPointCloud() || tree.getPointCloud()->empty())
    {
        return false;
    }

    const auto& cloud = tree.getPointCloud();
    const auto& params = tree.getParameters();

    float min_z = params.trunk_base.z();
    float max_z = min_z + params.height * 0.5f;

    for (float h = 0.5f; h < max_z - min_z; h += 0.2f)
    {
        float section_height = min_z + h;
        float tolerance = 0.08f;

        StemCrossSection section;
        section.height = section_height;

        std::vector<Eigen::Vector2f> points_2d;
        for (const auto& point : cloud->points)
        {
            if (std::abs(point.z - section_height) < tolerance)
            {
                points_2d.push_back(Eigen::Vector2f(point.x, point.y));
            }
        }

        if (points_2d.size() < 8) continue;

        Eigen::Vector2f centroid(0, 0);
        for (const auto& p : points_2d)
        {
            centroid += p;
        }
        centroid /= static_cast<float>(points_2d.size());
        section.center = centroid;

        float mean_radius = 0.0f;
        for (const auto& p : points_2d)
        {
            float r = (p - centroid).norm();
            mean_radius += r;
        }
        mean_radius /= static_cast<float>(points_2d.size());
        section.radius = mean_radius;

        std::vector<float> radii;
        for (const auto& p : points_2d)
        {
            radii.push_back((p - centroid).norm());
        }
        std::sort(radii.begin(), radii.end());
        float q1 = radii[radii.size() / 4];
        float q3 = radii[radii.size() * 3 / 4];
        float iqr = q3 - q1;
        section.eccentricity = iqr / mean_radius;

        section.boundary_points = points_2d;
        cross_sections_.push_back(section);
    }

    return !cross_sections_.empty();
}

bool IncrementBorerPlanner::detectDefects(const Tree& tree)
{
    all_defects_.clear();

    if (cross_sections_.size() < 3)
    {
        return false;
    }

    for (size_t i = 0; i < cross_sections_.size(); ++i)
    {
        auto& section = cross_sections_[i];
        if (section.boundary_points.size() < 10) continue;

        std::vector<float> radii;
        std::vector<float> angles;
        for (const auto& p : section.boundary_points)
        {
            Eigen::Vector2f v = p - section.center;
            radii.push_back(v.norm());
            angles.push_back(std::atan2(v.y(), v.x()));
        }

        std::vector<size_t> idx(angles.size());
        std::iota(idx.begin(), idx.end(), 0);
        std::sort(idx.begin(), idx.end(), [&angles](size_t a, size_t b) { return angles[a] < angles[b]; });

        float mean_r = section.radius;
        float std_r = 0.0f;
        for (float r : radii)
        {
            std_r += (r - mean_r) * (r - mean_r);
        }
        std_r = std::sqrt(std_r / radii.size());

        size_t start = 0;
        bool in_defect = false;
        float defect_max_deviation = 0;
        size_t defect_start_idx = 0;

        for (size_t j = 0; j < idx.size() * 2; ++j)
        {
            size_t k = idx[j % idx.size()];
            float deviation = (radii[k] - mean_r) / std::max(std_r, 0.001f);

            if (deviation > 1.5f && !in_defect)
            {
                in_defect = true;
                defect_start_idx = k;
                defect_max_deviation = deviation;
            }
            else if (deviation > 1.5f && in_defect)
            {
                defect_max_deviation = std::max(defect_max_deviation, deviation);
            }
            else if (deviation < 1.0f && in_defect)
            {
                in_defect = false;

                size_t end_idx = k;
                float angle_start = angles[defect_start_idx];
                float angle_end = angles[end_idx];
                if (angle_end < angle_start) angle_end += 2 * M_PI;

                float angular_width = angle_end - angle_start;
                if (angular_width > 0.1f && angular_width < M_PI)
                {
                    StemDefect defect;
                    defect.type = StemDefect::KNOT;
                    defect.height = section.height;
                    defect.angle_deg = (angle_start + angular_width / 2) * 180.0f / M_PI;
                    if (defect.angle_deg < 0) defect.angle_deg += 360.0f;

                    float avg_angle = angle_start + angular_width / 2;
                    defect.center = Eigen::Vector3f(
                        section.center.x() + mean_r * std::cos(avg_angle),
                        section.center.y() + mean_r * std::sin(avg_angle),
                        section.height
                    );
                    defect.radius = defect_max_deviation * std_r * 0.5f;
                    defect.depth = defect_max_deviation * std_r;
                    defect.severity = std::min(1.0f, defect_max_deviation / 4.0f);

                    all_defects_.push_back(defect);
                    section.defects.push_back(defect);
                }
            }
        }
    }

    for (size_t i = 0; i < cross_sections_.size(); ++i)
    {
        auto& section = cross_sections_[i];
        if (section.boundary_points.size() < 5) continue;

        std::vector<float> curvature(section.boundary_points.size(), 0.0f);
        for (size_t j = 0; j < section.boundary_points.size(); ++j)
        {
            size_t prev = (j + section.boundary_points.size() - 3) % section.boundary_points.size();
            size_t next = (j + 3) % section.boundary_points.size();
            Eigen::Vector2f v1 = section.boundary_points[j] - section.boundary_points[prev];
            Eigen::Vector2f v2 = section.boundary_points[next] - section.boundary_points[j];
            curvature[j] = std::abs(v1.x() * v2.y() - v1.y() * v2.x()) / (v1.norm() * v2.norm() + 1e-6);
        }

        float mean_curv = 0, std_curv = 0;
        for (float c : curvature) mean_curv += c;
        mean_curv /= curvature.size();
        for (float c : curvature) std_curv += (c - mean_curv) * (c - mean_curv);
        std_curv = std::sqrt(std_curv / curvature.size());

        for (size_t j = 0; j < curvature.size(); ++j)
        {
            if ((curvature[j] - mean_curv) > 2.0f * std_curv)
            {
                const auto& p = section.boundary_points[j];
                Eigen::Vector2f v = p - section.center;
                float angle = std::atan2(v.y(), v.x()) * 180.0f / M_PI;
                if (angle < 0) angle += 360.0f;

                bool exists = false;
                for (const auto& d : section.defects)
                {
                    float diff = std::abs(d.angle_deg - angle);
                    if (diff > 180.0f) diff = 360.0f - diff;
                    if (diff < 30.0f)
                    {
                        exists = true;
                        break;
                    }
                }

                if (!exists)
                {
                    StemDefect defect;
                    defect.type = StemDefect::SCAR;
                    defect.height = section.height;
                    defect.angle_deg = angle;
                    defect.center = Eigen::Vector3f(p.x(), p.y(), section.height);
                    defect.radius = 0.02f;
                    defect.depth = 0.01f;
                    defect.severity = 0.3f;
                    all_defects_.push_back(defect);
                    section.defects.push_back(defect);
                }
            }
        }
    }

    return true;
}

bool IncrementBorerPlanner::analyzeStemTilt(const Tree& tree)
{
    stem_axis_points_.clear();
    stem_direction_ = Eigen::Vector3f(0, 0, 1);
    stem_tilt_deg_ = 0.0f;
    stem_tilt_direction_deg_ = 0.0f;

    if (cross_sections_.empty())
    {
        const auto& params = tree.getParameters();
        stem_axis_points_.push_back(params.trunk_base);
        stem_axis_points_.push_back(params.treetop);
        return true;
    }

    for (const auto& section : cross_sections_)
    {
        stem_axis_points_.push_back(Eigen::Vector3f(section.center.x(), section.center.y(), section.height));
    }

    if (stem_axis_points_.size() < 3)
    {
        return true;
    }

    Eigen::MatrixXf A(stem_axis_points_.size(), 3);
    Eigen::VectorXf b(stem_axis_points_.size());
    for (size_t i = 0; i < stem_axis_points_.size(); ++i)
    {
        A(i, 0) = stem_axis_points_[i].z();
        A(i, 1) = 1.0f;
        A(i, 2) = 0.0f;
        b(i) = stem_axis_points_[i].x();
    }
    Eigen::Vector2f x_sol = A.colPivHouseholderQr().solve(b);

    for (size_t i = 0; i < stem_axis_points_.size(); ++i)
    {
        A(i, 0) = stem_axis_points_[i].z();
        A(i, 1) = 1.0f;
        b(i) = stem_axis_points_[i].y();
    }
    Eigen::Vector2f y_sol = A.colPivHouseholderQr().solve(b);

    stem_direction_ = Eigen::Vector3f(x_sol[0], y_sol[0], 1.0f).normalized();

    float vertical_dot = stem_direction_.dot(Eigen::Vector3f(0, 0, 1));
    stem_tilt_deg_ = std::acos(std::min(1.0f, std::max(-1.0f, vertical_dot))) * 180.0f / M_PI;

    Eigen::Vector2f horizontal_dir(stem_direction_.x(), stem_direction_.y());
    if (horizontal_dir.norm() > 0.001f)
    {
        horizontal_dir.normalize();
        stem_tilt_direction_deg_ = std::atan2(horizontal_dir.y(), horizontal_dir.x()) * 180.0f / M_PI;
        if (stem_tilt_direction_deg_ < 0) stem_tilt_direction_deg_ += 360.0f;
    }

    return true;
}

Eigen::Vector3f IncrementBorerPlanner::getStemAxisAtHeight(float z)
{
    if (stem_axis_points_.size() < 2)
    {
        return Eigen::Vector3f(0, 0, z);
    }

    for (size_t i = 0; i < stem_axis_points_.size() - 1; ++i)
    {
        float z0 = stem_axis_points_[i].z();
        float z1 = stem_axis_points_[i + 1].z();
        if (z >= z0 && z <= z1)
        {
            float t = (z - z0) / (z1 - z0);
            return stem_axis_points_[i] + t * (stem_axis_points_[i + 1] - stem_axis_points_[i]);
        }
    }

    if (z < stem_axis_points_.front().z())
    {
        float dz = z - stem_axis_points_.front().z();
        return stem_axis_points_.front() + stem_direction_ * dz;
    }
    else
    {
        float dz = z - stem_axis_points_.back().z();
        return stem_axis_points_.back() + stem_direction_ * dz;
    }
}

float IncrementBorerPlanner::distanceToDefects(const Eigen::Vector3f& point)
{
    float min_dist = 1e9f;
    for (const auto& defect : all_defects_)
    {
        float dz = std::abs(point.z() - defect.height);
        if (dz > 0.5f) continue;

        Eigen::Vector3f diff = point - defect.center;
        diff.z() *= 2.0f;
        float dist = diff.norm() - defect.radius;
        min_dist = std::min(min_dist, dist);
    }
    return min_dist;
}

float IncrementBorerPlanner::evaluatePathQuality(const DrillingPath& path)
{
    if (path.depth < 0.05f) return 0.0f;

    float defect_score = 1.0f;
    for (const auto& defect : path.defects_along_path)
    {
        defect_score *= (1.0f - defect.severity * 0.5f);
    }

    float safety_score = 1.0f;
    if (path.minimum_defect_distance < min_defect_distance_)
    {
        safety_score = path.minimum_defect_distance / min_defect_distance_;
    }

    float tilt_correction = 1.0f;
    if (stem_tilt_deg_ > 2.0f)
    {
        float perpendicularity = std::abs(path.azimuth_deg - stem_tilt_direction_deg_);
        if (perpendicularity > 180.0f) perpendicularity = 360.0f - perpendicularity;
        tilt_correction = 0.7f + 0.3f * (perpendicularity / 90.0f);
    }

    float quality = defect_score * safety_score * tilt_correction;
    return std::max(0.0f, std::min(1.0f, quality));
}

std::vector<DrillingPath> IncrementBorerPlanner::planAllDirections(const Tree& tree, float drill_height)
{
    std::vector<DrillingPath> paths;

    if (!tree.getPointCloud())
    {
        return paths;
    }

    const auto& params = tree.getParameters();
    float section_height = params.trunk_base.z() + drill_height;

    Eigen::Vector3f axis_point = getStemAxisAtHeight(section_height);

    float dbh_radius = params.dbh_corrected / 2.0f;
    if (dbh_radius < 0.02f)
    {
        dbh_radius = 0.1f;
    }

    int num_directions = 360 / sample_interval_;

    for (int i = 0; i < num_directions; ++i)
    {
        float azimuth = static_cast<float>(i) * sample_interval_;
        float azimuth_rad = azimuth * M_PI / 180.0f;

        Eigen::Vector2f horizontal_dir(std::cos(azimuth_rad), std::sin(azimuth_rad));
        Eigen::Vector3f drill_dir(horizontal_dir.x(), horizontal_dir.y(), 0.0f);

        if (stem_tilt_deg_ > 1.0f)
        {
            Eigen::Vector3f tilt_axis = Eigen::Vector3f(0, 0, 1).cross(stem_direction_).normalized();
            float tilt_rad = stem_tilt_deg_ * M_PI / 180.0f;
            Eigen::AngleAxisf rotation(tilt_rad, tilt_axis);
            drill_dir = rotation * drill_dir;
            drill_dir.normalize();
        }

        DrillingPath path;
        path.tree_id = tree.getId();
        path.direction = drill_dir;
        path.azimuth_deg = azimuth;
        path.elevation_deg = 0.0f;
        path.stem_tilt_deg = stem_tilt_deg_;
        path.dbh_at_height = dbh_radius * 2.0f;

        path.entry_point = axis_point + drill_dir * (dbh_radius - 0.01f);
        path.exit_point = axis_point + drill_dir * max_drill_depth_;
        path.depth = max_drill_depth_;

        path.defects_along_path.clear();
        path.minimum_defect_distance = 1e9f;

        int samples = 20;
        for (int s = 0; s <= samples; ++s)
        {
            float t = static_cast<float>(s) / samples;
            Eigen::Vector3f p = path.entry_point + t * (path.exit_point - path.entry_point);

            float dist = distanceToDefects(p);
            path.minimum_defect_distance = std::min(path.minimum_defect_distance, dist);

            for (const auto& defect : all_defects_)
            {
                float dz = std::abs(p.z() - defect.height);
                if (dz < 0.1f)
                {
                    Eigen::Vector3f diff = p - defect.center;
                    if (diff.norm() < defect.radius + 0.01f)
                    {
                        bool already_added = false;
                        for (const auto& d : path.defects_along_path)
                        {
                            if (d.center == defect.center)
                            {
                                already_added = true;
                                break;
                            }
                        }
                        if (!already_added)
                        {
                            path.defects_along_path.push_back(defect);
                        }
                    }
                }
            }
        }

        path.defect_count = static_cast<int>(path.defects_along_path.size());
        path.quality_score = evaluatePathQuality(path);
        path.is_optimal = false;

        paths.push_back(path);
    }

    return paths;
}

DrillingPath IncrementBorerPlanner::planOptimalPath(const Tree& tree, float drill_height)
{
    std::vector<DrillingPath> paths = planAllDirections(tree, drill_height);

    DrillingPath best_path;
    best_path.quality_score = -1.0f;

    for (auto& path : paths)
    {
        if (path.quality_score > best_path.quality_score)
        {
            best_path = path;
        }
    }

    best_path.is_optimal = true;
    return best_path;
}

bool IncrementBorerPlanner::analyzeTree(const Tree& tree)
{
    if (progress_callback_)
    {
        progress_callback_(10, "提取树干横截面...");
    }

    if (!extractStemCrossSections(tree))
    {
        std::cerr << "提取树干横截面失败" << std::endl;
        return false;
    }

    if (progress_callback_)
    {
        progress_callback_(40, "检测节疤和缺陷...");
    }

    detectDefects(tree);

    if (progress_callback_)
    {
        progress_callback_(70, "分析树干倾斜度...");
    }

    analyzeStemTilt(tree);

    if (progress_callback_)
    {
        progress_callback_(100, QString("分析完成，检测到 %1 个缺陷").arg(all_defects_.size()).toStdString());
    }

    return true;
}

}
