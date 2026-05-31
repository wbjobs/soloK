#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <pcl/filters/statistical_outlier_removal.h>
#include <pcl/filters/voxel_grid.h>
#include <pcl/filters/passthrough.h>
#include <pcl/filters/bilateral.h>
#include <pcl/features/normal_3d.h>
#include <pcl/surface/mls.h>
#include <memory>

namespace Fossil3D {

class PointCloudFilter {
public:
    PointCloudFilter();
    ~PointCloudFilter();

    void setVoxelGridSize(double size);
    void setStatisticalMeanK(int k);
    void setStatisticalStdDevMul(double mul);
    void setMLSSearchRadius(double radius);

    PointCloudXYZRGB::Ptr voxelGridDownsample(PointCloudXYZRGB::ConstPtr cloud);
    PointCloudXYZRGB::Ptr removeStatisticalOutliers(PointCloudXYZRGB::ConstPtr cloud);
    PointCloudXYZRGB::Ptr passThroughFilter(PointCloudXYZRGB::ConstPtr cloud,
                                             const std::string& axis,
                                             double min, double max);
    PointCloudXYZRGB::Ptr smoothMLS(PointCloudXYZRGB::ConstPtr cloud);
    PointCloudNormal::Ptr estimateNormals(PointCloudXYZRGB::ConstPtr cloud,
                                           double searchRadius = 0.0);

    PointCloudData filter(PointCloudXYZRGB::ConstPtr cloud,
                          bool downsample = true,
                          bool removeOutliers = true,
                          bool smooth = true,
                          bool estimateNormals = true);

private:
    double m_voxelGridSize;
    int m_statisticalMeanK;
    double m_statisticalStdDevMul;
    double m_mlsSearchRadius;
};

class DenseReconstructor {
public:
    DenseReconstructor();
    ~DenseReconstructor();

    void setMaxDepth(double maxDepth);
    void setMinDepth(double minDepth);
    void setDisparityRange(int range);
    void setWindowSize(int size);
    void setBatchSize(int size);
    void setMaxCloudPoints(size_t maxPoints);
    void setEnableVoxelFusion(bool enable);
    void setFusionVoxelSize(double size);

    PointCloudXYZRGB::Ptr reconstructFromStereo(const cv::Mat& imgLeft,
                                                 const cv::Mat& imgRight,
                                                 const CameraParams& camLeft,
                                                 const CameraParams& camRight);

    PointCloudXYZRGB::Ptr fuseDepthMaps(const std::vector<cv::Mat>& depthMaps,
                                         const std::vector<cv::Mat>& images,
                                         const std::vector<CameraParams>& cameras);

    PointCloudXYZRGB::Ptr fuseDepthMapsIncremental(const std::vector<std::string>& depthMapFiles,
                                                     const std::vector<std::string>& imageFiles,
                                                     const std::vector<CameraParams>& cameras);

    cv::Mat computeDepthMapBM(const cv::Mat& imgLeft,
                               const cv::Mat& imgRight,
                               int numDisparities = 64,
                               int blockSize = 11);

    cv::Mat computeDepthMapSGBM(const cv::Mat& imgLeft,
                                  const cv::Mat& imgRight,
                                  int numDisparities = 128,
                                  int blockSize = 9);

    PointCloudXYZRGB::Ptr depthMapToPointCloud(const cv::Mat& depthMap,
                                                 const cv::Mat& colorImage,
                                                 const CameraParams& camera);

    static size_t estimateMemoryUsage(size_t numPoints, size_t numImages = 0);
    static size_t getAvailableMemoryMB();

private:
    double m_maxDepth;
    double m_minDepth;
    int m_disparityRange;
    int m_windowSize;
    int m_batchSize;
    size_t m_maxCloudPoints;
    bool m_enableVoxelFusion;
    double m_fusionVoxelSize;

    PointCloudXYZRGB::Ptr voxelGridMerge(PointCloudXYZRGB::Ptr existing,
                                          PointCloudXYZRGB::Ptr newCloud,
                                          double voxelSize);

    void applyDepthMapSubsampling(cv::Mat& depthMap, int step);
};

}
