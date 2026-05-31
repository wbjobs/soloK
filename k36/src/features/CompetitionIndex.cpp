#include "features/CompetitionIndex.h"
#include <cmath>
#include <algorithm>
#include <iostream>
#include <queue>
#include <set>

namespace forest
{

CompetitionAnalyzer::CompetitionAnalyzer()
    : search_radius_(15.0f)
    , min_overlap_ratio_(0.05f)
{
}

CompetitionAnalyzer::~CompetitionAnalyzer()
{
}

void CompetitionAnalyzer::setProgressCallback(ProgressCallback callback)
{
    progress_callback_ = callback;
}

float CompetitionAnalyzer::getHegyiIndex(int tree_id) const
{
    auto it = competition_map_.find(tree_id);
    if (it != competition_map_.end())
    {
        return it->second.total_competition;
    }
    return 0.0f;
}

CompetitionEdges CompetitionAnalyzer::getCompetitors(int tree_id) const
{
    auto it = competition_map_.find(tree_id);
    if (it != competition_map_.end())
    {
        return it->second.incoming_edges;
    }
    return CompetitionEdges();
}

bool CompetitionAnalyzer::inCircle(const Eigen::Vector2f& p, const DelaunayTriangle& tri)
{
    float dx = p.x() - tri.circumcenter.x();
    float dy = p.y() - tri.circumcenter.y();
    return (dx * dx + dy * dy) < (tri.circumradius * tri.circumradius * 0.999f);
}

bool CompetitionAnalyzer::isDelaunay(const DelaunayTriangle& tri, const Eigen::Vector2f& p)
{
    float dx = p.x() - tri.circumcenter.x();
    float dy = p.y() - tri.circumcenter.y();
    return (dx * dx + dy * dy) > (tri.circumradius * tri.circumradius * 1.001f);
}

bool CompetitionAnalyzer::buildDelaunayTriangulation(const TreeList& trees)
{
    size_t n = trees.size();
    if (n < 3) return false;

    tree_positions_.clear();
    for (const auto& tree : trees)
    {
        if (tree)
        {
            tree_positions_.push_back(Eigen::Vector2f(
                tree->getParameters().trunk_base.x(),
                tree->getParameters().trunk_base.y()
            ));
        }
    }

    if (tree_positions_.size() < 3) return false;

    Eigen::Vector2f min_pt(1e9f, 1e9f);
    Eigen::Vector2f max_pt(-1e9f, -1e9f);
    for (const auto& pos : tree_positions_)
    {
        min_pt.x() = std::min(min_pt.x(), pos.x());
        min_pt.y() = std::min(min_pt.y(), pos.y());
        max_pt.x() = std::max(max_pt.x(), pos.x());
        max_pt.y() = std::max(max_pt.y(), pos.y());
    }

    float dx = max_pt.x() - min_pt.x();
    float dy = max_pt.y() - min_pt.y();
    float delta_max = std::max(dx, dy) * 10.0f;

    std::vector<Eigen::Vector2f> super_triangle = {
        Eigen::Vector2f(min_pt.x() - delta_max, min_pt.y() - delta_max),
        Eigen::Vector2f(max_pt.x() + delta_max * 2, min_pt.y() - delta_max),
        Eigen::Vector2f((min_pt.x() + max_pt.x()) / 2, max_pt.y() + delta_max * 2)
    };

    tree_positions_.insert(tree_positions_.end(), super_triangle.begin(), super_triangle.end());

    triangles_.clear();
    DelaunayTriangle super_tri;
    super_tri.vertices[0] = n;
    super_tri.vertices[1] = n + 1;
    super_tri.vertices[2] = n + 2;

    const auto& p0 = tree_positions_[super_tri.vertices[0]];
    const auto& p1 = tree_positions_[super_tri.vertices[1]];
    const auto& p2 = tree_positions_[super_tri.vertices[2]];

    float ax = p1.x() - p0.x(), ay = p1.y() - p0.y();
    float bx = p2.x() - p0.x(), by = p2.y() - p0.y();
    float d = 2 * (ax * by - ay * bx);
    if (std::abs(d) < 1e-10) return false;

    float t1 = (ax * ax + ay * ay);
    float t2 = (bx * bx + by * by);
    super_tri.circumcenter.x() = (by * t1 - ay * t2) / d + p0.x();
    super_tri.circumcenter.y() = (ax * t2 - bx * t1) / d + p0.y();
    float cx = p0.x() - super_tri.circumcenter.x();
    float cy = p0.y() - super_tri.circumcenter.y();
    super_tri.circumradius = std::sqrt(cx * cx + cy * cy);

    triangles_.push_back(super_tri);

    for (size_t i = 0; i < n; ++i)
    {
        const auto& point = tree_positions_[i];

        std::vector<size_t> bad_triangles;
        for (size_t j = 0; j < triangles_.size(); ++j)
        {
            if (inCircle(point, triangles_[j]))
            {
                bad_triangles.push_back(j);
            }
        }

        std::set<std::pair<int, int>> polygon;
        for (size_t bt : bad_triangles)
        {
            for (int k = 0; k < 3; ++k)
            {
                int a = triangles_[bt].vertices[k];
                int b = triangles_[bt].vertices[(k + 1) % 3];
                if (a > b) std::swap(a, b);
                auto edge = std::make_pair(a, b);
                if (polygon.count(edge))
                {
                    polygon.erase(edge);
                }
                else
                {
                    polygon.insert(edge);
                }
            }
        }

        std::sort(bad_triangles.rbegin(), bad_triangles.rend());
        for (size_t bt : bad_triangles)
        {
            if (bt < triangles_.size())
            {
                triangles_.erase(triangles_.begin() + bt);
            }
        }

        for (const auto& edge : polygon)
        {
            DelaunayTriangle new_tri;
            new_tri.vertices[0] = edge.first;
            new_tri.vertices[1] = edge.second;
            new_tri.vertices[2] = static_cast<int>(i);

            const auto& pt0 = tree_positions_[new_tri.vertices[0]];
            const auto& pt1 = tree_positions_[new_tri.vertices[1]];
            const auto& pt2 = tree_positions_[new_tri.vertices[2]];

            float ax_ = pt1.x() - pt0.x(), ay_ = pt1.y() - pt0.y();
            float bx_ = pt2.x() - pt0.x(), by_ = pt2.y() - pt0.y();
            float d_ = 2 * (ax_ * by_ - ay_ * bx_);

            if (std::abs(d_) < 1e-10) continue;

            float t1_ = (ax_ * ax_ + ay_ * ay_);
            float t2_ = (bx_ * bx_ + by_ * by_);
            new_tri.circumcenter.x() = (by_ * t1_ - ay_ * t2_) / d_ + pt0.x();
            new_tri.circumcenter.y() = (ax_ * t2_ - bx_ * t1_) / d_ + pt0.y();
            float cx_ = pt0.x() - new_tri.circumcenter.x();
            float cy_ = pt0.y() - new_tri.circumcenter.y();
            new_tri.circumradius = std::sqrt(cx_ * cx_ + cy_ * cy_);

            triangles_.push_back(new_tri);
        }
    }

    triangles_.erase(
        std::remove_if(triangles_.begin(), triangles_.end(),
        [n](const DelaunayTriangle& tri) {
            return tri.vertices[0] >= n || tri.vertices[1] >= n || tri.vertices[2] >= n;
        }),
        triangles_.end()
    );

    for (auto& tri : triangles_)
    {
        for (int j = 0; j < 3; ++j)
        {
            int v0 = tri.vertices[j];
            int v1 = tri.vertices[(j + 1) % 3];
            if (v0 >= 0 && v0 < (int)trees.size() && v1 >= 0 && v1 < (int)trees.size())
            {
                int id0 = trees[v0]->getId();
                int id1 = trees[v1]->getId();
                auto it = competition_map_.find(id0);
                if (it != competition_map_.end())
                {
                    if (std::find(it->second.delaunay_neighbors.begin(),
                                it->second.delaunay_neighbors.end(), id1) == it->second.delaunay_neighbors.end())
                    {
                        it->second.delaunay_neighbors.push_back(id1);
                    }
                }
                it = competition_map_.find(id1);
                if (it != competition_map_.end())
                {
                    if (std::find(it->second.delaunay_neighbors.begin(),
                                    it->second.delaunay_neighbors.end(), id0) == it->second.delaunay_neighbors.end())
                    {
                        it->second.delaunay_neighbors.push_back(id0);
                    }
                }
            }
        }
    }

    return true;
}

bool CompetitionAnalyzer::computeCrownOverlap(const TreePtr& t1, const TreePtr& t2, float& overlap_ratio)
{
    const auto& p1 = t1->getParameters();
    const auto& p2 = t2->getParameters();

    float dx = p2.trunk_base.x() - p1.trunk_base.x();
    float dy = p2.trunk_base.y() - p1.trunk_base.y();
    float distance = std::sqrt(dx * dx + dy * dy);

    float r1 = p1.crown_diameter_mean / 2.0f;
    float r2 = p2.crown_diameter_mean / 2.0f;

    if (distance >= r1 + r2)
    {
        overlap_ratio = 0.0f;
        return true;
    }

    if (distance + std::min(r1, r2) <= std::max(r1, r2))
    {
        overlap_ratio = 1.0f;
        return true;
    }

    float a = (r1 * r1 - r2 * r2 + distance * distance) / (2 * distance);
    float h = std::sqrt(std::max(0.0f, r1 * r1 - a * a));

    float angle1 = 2 * std::acos(std::min(1.0f, std::max(-1.0f, a / r1)));
    float angle2 = 2 * std::acos(std::min(1.0f, std::max(-1.0f, (distance - a) / r2)));

    float area1 = 0.5f * r1 * r1 * (angle1 - std::sin(angle1));
    float area2 = 0.5f * r2 * r2 * (angle2 - std::sin(angle2));

    float overlap_area = area1 + area2;
    float min_area = M_PI * std::min(r1 * r1, r2 * r2);

    overlap_ratio = min_area > 0 ? overlap_area / min_area : 0;

    return true;
}

float CompetitionAnalyzer::computeHegyiIndex(const TreePtr& target, const TreePtr& competitor, float distance)
{
    float dbh_target = target->getParameters().dbh_corrected;
    float dbh_competitor = competitor->getParameters().dbh_corrected;

    if (dbh_target <= 0.001f || distance <= 0.001f)
    {
        return 0.0f;
    }

    return (dbh_competitor / dbh_target) / (distance / dbh_target);
}

bool CompetitionAnalyzer::analyze(const SegmentationResult& result)
{
    const auto& trees = result.getTrees();
    if (trees.size() < 2)
    {
        std::cerr << "树木数量不足，无法计算竞争指数" << std::endl;
        return false;
    }

    competition_map_.clear();
    all_edges_.clear();
    triangles_.clear();

    for (const auto& tree : trees)
    {
        if (tree)
        {
            TreeCompetitionData data;
            data.tree_id = tree->getId();
            competition_map_[tree->getId()] = data;
        }
    }

    if (progress_callback_)
    {
        progress_callback_(10, "构建Delaunay三角网...");
    }

    buildDelaunayTriangulation(trees);

    if (progress_callback_)
    {
        progress_callback_(30, "计算冠幅重叠和竞争指数...");
    }

    std::map<int, size_t> tree_id_to_index;
    for (size_t i = 0; i < trees.size(); ++i)
    {
        if (trees[i])
        {
            tree_id_to_index[trees[i]->getId()] = i;
        }
    }

    int edge_count = 0;
    for (const auto& tri : triangles_)
    {
        for (int k = 0; k < 3; ++k)
        {
            int idx1 = tri.vertices[k];
            int idx2 = tri.vertices[(k + 1) % 3];
            if (idx1 < 0 || idx1 >= (int)trees.size() || idx2 < 0 || idx2 >= (int)trees.size()) continue;

            const auto& t1 = trees[idx1];
            const auto& t2 = trees[idx2];
            if (!t1 || !t2) continue;

            float dx = t2->getParameters().trunk_base.x() - t1->getParameters().trunk_base.x();
            float dy = t2->getParameters().trunk_base.y() - t1->getParameters().trunk_base.y();
            float distance = std::sqrt(dx * dx + dy * dy);

            if (distance > search_radius_ || distance < 0.01f) continue;

            float overlap_ratio;
            computeCrownOverlap(t1, t2, overlap_ratio);

            if (overlap_ratio < min_overlap_ratio_) continue;

            float hegyi_1to2 = computeHegyiIndex(t1, t2, distance);
            float hegyi_2to1 = computeHegyiIndex(t2, t1, distance);

            float angle = std::atan2(dy, dx) * 180.0f / M_PI;
            if (angle < 0) angle += 360.0f;

            CompetitionEdge edge1;
            edge1.target_tree_id = t1->getId();
            edge1.competitor_tree_id = t2->getId();
            edge1.distance = distance;
            edge1.overlap_ratio = overlap_ratio;
            edge1.hegyi_index = hegyi_1to2;
            edge1.angle_deg = angle;

            CompetitionEdge edge2;
            edge2.target_tree_id = t2->getId();
            edge2.competitor_tree_id = t1->getId();
            edge2.distance = distance;
            edge2.overlap_ratio = overlap_ratio;
            edge2.hegyi_index = hegyi_2to1;
            edge2.angle_deg = angle + 180.0f;
            if (edge2.angle_deg >= 360.0f) edge2.angle_deg -= 360.0f;

            competition_map_[t1->getId()].incoming_edges.push_back(edge1);
            competition_map_[t1->getId()].total_competition += hegyi_1to2;
            competition_map_[t2->getId()].incoming_edges.push_back(edge2);
            competition_map_[t2->getId()].total_competition += hegyi_2to1;

            all_edges_.push_back(edge1);
            edge_count++;
        }
    }

    for (auto& [tree_id, data] : competition_map_)
    {
        data.competitor_count = static_cast<int>(data.incoming_edges.size());
        if (data.total_competition > 0)
        {
            data.free_growth_ratio = 1.0f / (1.0f + data.total_competition);
        }
    }

    if (progress_callback_)
    {
        progress_callback_(100, QString("竞争分析完成，共 %1 条竞争边").arg(edge_count).toStdString());
    }

    return true;
}

}
