#pragma once

#include "core/typedefs.h"
#include "core/Tree.h"
#include <Eigen/Dense>
#include <memory>
#include <vector>
#include <map>

namespace forest
{

struct StemDefect
{
    enum DefectType
    {
        KNOT = 0,
        CRACK = 1,
        DECAY = 2,
        SCAR = 3,
        BURL = 4
    };

    DefectType type;
    Eigen::Vector3f center;
    float radius;
    float depth;
    float angle_deg;
    float height;
    float severity;

    StemDefect()
        : type(KNOT)
        , center(Eigen::Vector3f::Zero())
        , radius(0.0f)
        , depth(0.0f)
        , angle_deg(0.0f)
        , height(0.0f)
        , severity(0.5f)
    {
    }
};

struct DrillingPath
{
    int tree_id;
    Eigen::Vector3f entry_point;
    Eigen::Vector3f exit_point;
    Eigen::Vector3f direction;
    float azimuth_deg;
    float elevation_deg;
    float depth;
    float dbh_at_height;
    float stem_tilt_deg;
    float quality_score;
    int defect_count;
    float minimum_defect_distance;
    std::vector<StemDefect> defects_along_path;
    bool is_optimal;

    DrillingPath()
        : tree_id(-1)
        , entry_point(Eigen::Vector3f::Zero())
        , exit_point(Eigen::Vector3f::Zero())
        , direction(Eigen::Vector3f::Zero())
        , azimuth_deg(0.0f)
        , elevation_deg(0.0f)
        , depth(0.0f)
        , dbh_at_height(0.0f)
        , stem_tilt_deg(0.0f)
        , quality_score(0.0f)
        , defect_count(0)
        , minimum_defect_distance(100.0f)
        , is_optimal(false)
    {
    }
};

struct StemCrossSection
{
    float height;
    Eigen::Vector2f center;
    float radius;
    std::vector<Eigen::Vector2f> boundary_points;
    std::vector<StemDefect> defects;
    float eccentricity;
    float tilt_angle;
    float tilt_direction;

    StemCrossSection()
        : height(0.0f)
        , center(Eigen::Vector2f::Zero())
        , radius(0.0f)
        , eccentricity(0.0f)
        , tilt_angle(0.0f)
        , tilt_direction(0.0f)
    {
    }
};

class IncrementBorerPlanner
{
public:
    IncrementBorerPlanner();
    ~IncrementBorerPlanner();

    bool analyzeTree(const Tree& tree);
    DrillingPath planOptimalPath(const Tree& tree, float drill_height = 1.3f);
    std::vector<DrillingPath> planAllDirections(const Tree& tree, float drill_height = 1.3f);

    const std::vector<StemCrossSection>& getCrossSections() const { return cross_sections_; }
    const std::vector<StemDefect>& getAllDefects() const { return all_defects_; }

    void setMaxDrillDepth(float depth) { max_drill_depth_ = depth; }
    void setMinDefectDistance(float dist) { min_defect_distance_ = dist; }
    void setSampleInterval(int interval) { sample_interval_ = interval; }

    void setProgressCallback(ProgressCallback callback);

private:
    bool extractStemCrossSections(const Tree& tree);
    bool detectDefects(const Tree& tree);
    bool analyzeStemTilt(const Tree& tree);

    float evaluatePathQuality(const DrillingPath& path);
    float distanceToDefects(const Eigen::Vector3f& point);

    Eigen::Vector3f getStemAxisAtHeight(float z);
    Eigen::Vector2f projectToStemPlane(const Eigen::Vector3f& point, float height);

    std::vector<StemCrossSection> cross_sections_;
    std::vector<StemDefect> all_defects_;
    std::vector<Eigen::Vector3f> stem_axis_points_;

    float stem_tilt_deg_;
    float stem_tilt_direction_deg_;
    Eigen::Vector3f stem_direction_;

    float max_drill_depth_;
    float min_defect_distance_;
    int sample_interval_;

    ProgressCallback progress_callback_;
};

}
