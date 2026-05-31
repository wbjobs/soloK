#include "io/PointCloudLoader.h"
#include <pcl/io/ply_io.h>
#include <pcl/io/pcd_io.h>
#include <pcl/common/transforms.h>
#include <iostream>
#include <algorithm>

#ifdef HAVE_LASLIB
#include <lasreader.hpp>
#include <laswriter.hpp>
#elif defined(HAVE_LIBLAS)
#include <liblas/liblas.hpp>
#endif

namespace forest
{

PointCloudLoader::PointCloudLoader()
{
}

PointCloudLoader::~PointCloudLoader()
{
}

std::vector<std::string> PointCloudLoader::getSupportedFormats()
{
    std::vector<std::string> formats;
    formats.push_back(".las");
    formats.push_back(".laz");
    formats.push_back(".ply");
    formats.push_back(".pcd");
    return formats;
}

bool PointCloudLoader::isFormatSupported(const std::string& extension)
{
    std::string ext = extension;
    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);

    auto formats = getSupportedFormats();
    return std::find(formats.begin(), formats.end(), ext) != formats.end();
}

void PointCloudLoader::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

PointCloudData::Ptr PointCloudLoader::load(const std::string& filename)
{
    auto data = std::make_shared<PointCloudData>();
    auto cloud = std::make_shared<PointCloud>();

    std::string extension = filename.substr(filename.find_last_of('.'));
    std::transform(extension.begin(), extension.end(), extension.begin(), ::tolower);

    bool success = false;

    if (extension == ".las" || extension == ".laz")
    {
        success = loadLAS(filename, *cloud);
    }
    else if (extension == ".ply")
    {
        success = loadPLY(filename, *cloud);
    }
    else if (extension == ".pcd")
    {
        success = loadPCD(filename, *cloud);
    }

    if (success && !cloud->empty())
    {
        data->setPointCloud(cloud);
        data->setFilename(filename);
        data->computeBounds();
        data->separateGroundAndVegetation();

        if (progress_callback_)
        {
            progress_callback_(100, "加载完成: " + std::to_string(cloud->size()) + " 个点");
        }
    }
    else
    {
        data.reset();
    }

    return data;
}

bool PointCloudLoader::save(const PointCloudData& data, const std::string& filename)
{
    if (!data.getPointCloud()) return false;

    std::string extension = filename.substr(filename.find_last_of('.'));
    std::transform(extension.begin(), extension.end(), extension.begin(), ::tolower);

    if (extension == ".ply")
    {
        return savePLY(*data.getPointCloud(), filename);
    }
    else if (extension == ".pcd")
    {
        return savePCD(*data.getPointCloud(), filename);
    }

    return false;
}

bool PointCloudLoader::loadLAS(const std::string& filename, PointCloud& cloud)
{
#ifdef HAVE_LASLIB
    LASreadOpener lasreadopener;
    lasreadopener.set_file_name(filename.c_str());
    LASreader* lasreader = lasreadopener.open();

    if (!lasreader)
    {
        std::cerr << "无法打开LAS文件: " << filename << std::endl;
        return false;
    }

    cloud.clear();
    cloud.reserve(lasreader->header.number_of_point_records);
    cloud.width = lasreader->header.number_of_point_records;
    cloud.height = 1;
    cloud.is_dense = true;

    LASpoint* point = &lasreader->point;
    size_t count = 0;
    size_t total = lasreader->header.number_of_point_records;

    while (lasreader->read_point())
    {
        PointXYZIL p;
        p.x = static_cast<float>(point->get_x());
        p.y = static_cast<float>(point->get_y());
        p.z = static_cast<float>(point->get_z());
        p.intensity = static_cast<float>(point->get_intensity());
        p.label = static_cast<uint32_t>(point->get_classification());

        cloud.push_back(p);

        if (progress_callback_ && (++count % 10000 == 0 || count == total))
        {
            int progress = static_cast<int>((count * 100) / total);
            progress_callback_(progress, "加载LAS文件中...");
        }
    }

    lasreader->close();
    delete lasreader;

    return !cloud.empty();
#elif defined(HAVE_LIBLAS)
    std::ifstream ifs(filename, std::ios::in | std::ios::binary);
    if (!ifs.is_open())
    {
        std::cerr << "无法打开LAS文件: " << filename << std::endl;
        return false;
    }

    liblas::ReaderFactory f;
    liblas::Reader reader = f.CreateWithStream(ifs);
    const liblas::Header& header = reader.GetHeader();

    cloud.clear();
    cloud.reserve(header.GetPointRecordsCount());
    cloud.width = header.GetPointRecordsCount();
    cloud.height = 1;
    cloud.is_dense = true;

    size_t count = 0;
    size_t total = header.GetPointRecordsCount();

    while (reader.ReadNextPoint())
    {
        const liblas::Point& point = reader.GetPoint();
        PointXYZIL p;
        p.x = static_cast<float>(point.GetX());
        p.y = static_cast<float>(point.GetY());
        p.z = static_cast<float>(point.GetZ());
        p.intensity = static_cast<float>(point.GetIntensity());
        p.label = static_cast<uint32_t>(point.GetClassification().GetClass());

        cloud.push_back(p);

        if (progress_callback_ && (++count % 10000 == 0 || count == total))
        {
            int progress = static_cast<int>((count * 100) / total);
            progress_callback_(progress, "加载LAS文件中...");
        }
    }

    ifs.close();
    return !cloud.empty();
#else
    std::cerr << "LAS支持未编译。请安装LASlib或libLAS并重新编译。" << std::endl;
    return false;
#endif
}

bool PointCloudLoader::loadPLY(const std::string& filename, PointCloud& cloud)
{
    int result = pcl::io::loadPLYFile(filename, cloud);
    if (result != 0)
    {
        pcl::PointCloud<pcl::PointXYZ> temp_cloud;
        result = pcl::io::loadPLYFile(filename, temp_cloud);
        if (result == 0)
        {
            cloud.clear();
            cloud.width = temp_cloud.width;
            cloud.height = temp_cloud.height;
            cloud.is_dense = temp_cloud.is_dense;
            for (const auto& p : temp_cloud.points)
            {
                PointXYZIL point;
                point.x = p.x;
                point.y = p.y;
                point.z = p.z;
                point.intensity = 0.0f;
                point.label = 0;
                cloud.push_back(point);
            }
        }
    }

    if (result != 0)
    {
        std::cerr << "无法加载PLY文件: " << filename << std::endl;
        return false;
    }

    if (progress_callback_)
    {
        progress_callback_(100, "PLY文件加载完成");
    }

    return !cloud.empty();
}

bool PointCloudLoader::loadPCD(const std::string& filename, PointCloud& cloud)
{
    int result = pcl::io::loadPCDFile(filename, cloud);
    if (result != 0)
    {
        std::cerr << "无法加载PCD文件: " << filename << std::endl;
        return false;
    }

    if (progress_callback_)
    {
        progress_callback_(100, "PCD文件加载完成");
    }

    return !cloud.empty();
}

bool PointCloudLoader::savePLY(const PointCloud& cloud, const std::string& filename)
{
    int result = pcl::io::savePLYFile(filename, cloud);
    if (result != 0)
    {
        std::cerr << "无法保存PLY文件: " << filename << std::endl;
        return false;
    }
    return true;
}

bool PointCloudLoader::savePCD(const PointCloud& cloud, const std::string& filename)
{
    int result = pcl::io::savePCDFile(filename, cloud);
    if (result != 0)
    {
        std::cerr << "无法保存PCD文件: " << filename << std::endl;
        return false;
    }
    return true;
}

}
