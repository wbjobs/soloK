#pragma once

#include "core/typedefs.h"
#include "core/Tree.h"
#include "core/SegmentationResult.h"
#include <Eigen/Dense>
#include <memory>
#include <vector>
#include <map>
#include <set>

namespace forest
{

struct CompetitionEdge
{
    int target_tree_id;
    int competitor_tree_id;
    float distance;
    float overlap_ratio;
    float hegyi_index;
    float angle_deg;

    CompetitionEdge()
        : target_tree_id(-1)
        , competitor_tree_id(-1)
        , distance(0.0f)
        , overlap_ratio(0.0f)
        , hegyi_index(0.0f)
        , angle_deg(0.0f)
    {
    }
};

using CompetitionEdges = std::vector<CompetitionEdge>;

struct TreeCompetitionData
{
    int tree_id;
    float total_competition;
    float free_growth_ratio;
    int competitor_count;
    CompetitionEdges incoming_edges;
    CompetitionEdges outgoing_edges;
    std::vector<int> delaunay_neighbors;

    TreeCompetitionData()
        : tree_id(-1)
        , total_competition(0.0f)
        , free_growth_ratio(1.0f)
        , competitor_count(0)
    {
    }
};

using CompetitionMap = std::map<int, TreeCompetitionData>;

struct DelaunayTriangle
{
    int vertices[3];
    Eigen::Vector2f circumcenter;
    float circumradius;

    DelaunayTriangle()
    {
        vertices[0] = vertices[1] = vertices[2] = -1;
        circumradius = 0.0f;
    }
};

class CompetitionAnalyzer
{
public:
    CompetitionAnalyzer();
    ~CompetitionAnalyzer();

    bool analyze(const SegmentationResult& result);

    const CompetitionMap& getCompetitionMap() const { return competition_map_; }
    const CompetitionEdges& getAllEdges() const { return all_edges_; }
    const std::vector<DelaunayTriangle>& getDelaunayTriangles() const { return triangles_; }

    float getHegyiIndex(int tree_id) const;
    CompetitionEdges getCompetitors(int tree_id) const;

    void setSearchRadius(float radius) { search_radius_ = radius; }
    void setMinOverlapRatio(float ratio) { min_overlap_ratio_ = ratio; }

    void setProgressCallback(ProgressCallback callback);

private:
    bool buildDelaunayTriangulation(const TreeList& trees);
    bool computeCrownOverlap(const TreePtr& t1, const TreePtr& t2, float& overlap_ratio);
    float computeHegyiIndex(const TreePtr& target, const TreePtr& competitor, float distance);

    bool inCircle(const Eigen::Vector2f& p, const DelaunayTriangle& tri);
    bool isDelaunay(const DelaunayTriangle& tri, const Eigen::Vector2f& p);

    CompetitionMap competition_map_;
    CompetitionEdges all_edges_;
    std::vector<DelaunayTriangle> triangles_;
    std::vector<Eigen::Vector2f> tree_positions_;

    float search_radius_;
    float min_overlap_ratio_;

    ProgressCallback progress_callback_;
};

}
