#pragma once

#include "core/typedefs.h"
#include "core/SegmentationResult.h"
#include <string>
#include <memory>
#include <vector>

namespace forest
{

class ResultExporter
{
public:
    ResultExporter();
    ~ResultExporter();

    void setOptions(const ExportOptions& options) { options_ = options; }
    const ExportOptions& getOptions() const { return options_; }

    bool exportAll(const SegmentationResult& result, const std::string& output_dir,
                   const std::string& project_name);

    bool exportCSV(const SegmentationResult& result, const std::string& filename);
    bool exportPointClouds(const SegmentationResult& result, const std::string& output_dir,
                           const std::string& project_name);
    bool exportPDFReport(const SegmentationResult& result, const std::string& filename,
                         const std::string& project_name);
    bool exportDEM(const DEMGrid& dem, float resolution, const Eigen::Vector2f& origin,
                   const std::string& filename);
    bool exportProjection(const SegmentationResult& result, const std::string& filename);

    void setProgressCallback(ProgressCallback callback);

private:
    bool ensureDirectory(const std::string& path);
    std::string generateTreeFilename(int tree_id, const std::string& format);
    void computePlotStatistics(const SegmentationResult& result, PlotStatistics& stats);

    ExportOptions options_;
    ProgressCallback progress_callback_;
};

}
