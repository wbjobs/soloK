#pragma once

#include "core/typedefs.h"
#include "core/PointCloudData.h"
#include <memory>

namespace forest
{

class TerrainNormalizer
{
public:
    TerrainNormalizer();
    ~TerrainNormalizer();

    void setParams(const TerrainNormalizationParams& params) { params_ = params; }
    const TerrainNormalizationParams& getParams() const { return params_; }

    bool process(const PointCloudData& input, PointCloudHPtr& output_cloud,
                 DEMGrid& dem, float& dem_resolution, Eigen::Vector2f& dem_origin);

    PointCloudHConstPtr getNormalizedCloud() const { return normalized_cloud_; }
    const DEMGrid& getDEM() const { return dem_; }
    float getDEMResolution() const { return dem_resolution_; }
    const Eigen::Vector2f& getDEMOrigin() const { return dem_origin_; }

    float getGroundHeight(float x, float y) const;

    void setProgressCallback(ProgressCallback callback);

private:
    bool buildDEM(const PointCloud& ground_cloud);
    bool interpolateDEM();
    bool fillHoles();
    bool computeNormalizedHeights(const PointCloud& input_cloud);

    float bilinearInterpolate(float x, float y) const;

    TerrainNormalizationParams params_;
    PointCloudHPtr normalized_cloud_;
    DEMGrid dem_;
    float dem_resolution_;
    Eigen::Vector2f dem_origin_;
    Eigen::Vector2f dem_size_;
    ProgressCallback progress_callback_;
};

}
