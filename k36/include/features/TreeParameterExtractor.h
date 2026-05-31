#pragma once

#include "core/typedefs.h"
#include "core/Tree.h"
#include "core/SegmentationResult.h"
#include <memory>

namespace forest
{

class TreeParameterExtractor
{
public:
    TreeParameterExtractor();
    ~TreeParameterExtractor();

    void setParams(const FeatureExtractionParams& params) { params_ = params; }
    const FeatureExtractionParams& getParams() const { return params_; }

    bool extractAll(TreeList& trees, const DEMGrid& dem,
                    float dem_resolution, const Eigen::Vector2f& dem_origin);
    bool extractSingle(Tree& tree, const DEMGrid& dem,
                       float dem_resolution, const Eigen::Vector2f& dem_origin);

    void setProgressCallback(ProgressCallback callback);

private:
    float extractTreeHeight(const Tree& tree);
    void extractCrownDiameter(Tree& tree);
    float extractDBH(Tree& tree);
    float extractCrownVolume(Tree& tree);
    void separateTrunkAndCrown(Tree& tree);
    void computeConvexHullVolume(Tree& tree);
    void computeVoxelVolume(Tree& tree);
    float fitCircleToPoints(const std::vector<Eigen::Vector2f>& points,
                           Eigen::Vector2f& center, float& radius);
    float fitCircleRobust(const std::vector<Eigen::Vector2f>& points,
                          Eigen::Vector2f& center, float& radius);
    float computeArcCoverage(const std::vector<Eigen::Vector2f>& points,
                             const Eigen::Vector2f& center);
    void computePlotStatistics(SegmentationResult& result);

    FeatureExtractionParams params_;
    ProgressCallback progress_callback_;
};

}
