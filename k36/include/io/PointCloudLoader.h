#pragma once

#include "core/typedefs.h"
#include "core/PointCloudData.h"
#include <string>
#include <memory>
#include <vector>

namespace forest
{

class PointCloudLoader
{
public:
    PointCloudLoader();
    ~PointCloudLoader();

    PointCloudData::Ptr load(const std::string& filename);
    bool save(const PointCloudData& data, const std::string& filename);

    static std::vector<std::string> getSupportedFormats();
    static bool isFormatSupported(const std::string& extension);

    void setProgressCallback(std::function<void(int, const std::string&)> callback);

private:
    bool loadLAS(const std::string& filename, PointCloud& cloud);
    bool loadPLY(const std::string& filename, PointCloud& cloud);
    bool loadPCD(const std::string& filename, PointCloud& cloud);

    bool savePLY(const PointCloud& cloud, const std::string& filename);
    bool savePCD(const PointCloud& cloud, const std::string& filename);

    std::function<void(int, const std::string&)> progress_callback_;
};

}
