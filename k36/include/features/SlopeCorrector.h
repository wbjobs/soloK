#pragma once

#include "core/typedefs.h"
#include "core/Tree.h"
#include <Eigen/Dense>
#include <memory>
#include <functional>

namespace forest
{

struct SlopeCorrectionParams
{
    int window_size = 5;
    float min_slope_for_correction = 5.0f;
    bool correct_dbh = true;
    bool correct_height = false;
    bool correct_crown = false;
};

class SlopeCorrector
{
public:
    SlopeCorrector();
    ~SlopeCorrector();

    void setParams(const SlopeCorrectionParams& params) { params_ = params; }
    const SlopeCorrectionParams& getParams() const { return params_; }

    bool computeSlopeAtPoint(float x, float y, const DEMGrid& dem,
                             float dem_resolution, const Eigen::Vector2f& dem_origin,
                             float& slope_angle, float& aspect_angle,
                             Eigen::Vector3f& normal);

    bool correctTreeParameters(Tree& tree, const DEMGrid& dem,
                               float dem_resolution, const Eigen::Vector2f& dem_origin);

    float correctDBH(float raw_dbh, float slope_angle);
    float correctHeight(float raw_height, float slope_angle);

    void setProgressCallback(std::function<void(int, const std::string&)> callback);

private:
    bool getDEMWindow(float x, float y, const DEMGrid& dem,
                      float dem_resolution, const Eigen::Vector2f& dem_origin,
                      int window_size, Eigen::MatrixXf& window);

    bool fitPlaneToDEM(const Eigen::MatrixXf& window, float cell_size,
                       Eigen::Vector3f& normal, float& slope, float& aspect);

    SlopeCorrectionParams params_;
    std::function<void(int, const std::string&)> progress_callback_;
};

}
