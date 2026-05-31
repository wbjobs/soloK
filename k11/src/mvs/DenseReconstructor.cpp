#include "mvs/DenseReconstructor.h"
#include <pcl/common/transforms.h>
#include <opencv2/calib3d.hpp>
#include <opencv2/imgproc.hpp>

#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
#else
#include <unistd.h>
#include <sys/sysinfo.h>
#endif

namespace Fossil3D {

PointCloudFilter::PointCloudFilter()
    : m_voxelGridSize(0.005)
    , m_statisticalMeanK(50)
    , m_statisticalStdDevMul(1.0)
    , m_mlsSearchRadius(0.03) {
}

PointCloudFilter::~PointCloudFilter() {
}

void PointCloudFilter::setVoxelGridSize(double size) {
    m_voxelGridSize = size;
}

void PointCloudFilter::setStatisticalMeanK(int k) {
    m_statisticalMeanK = k;
}

void PointCloudFilter::setStatisticalStdDevMul(double mul) {
    m_statisticalStdDevMul = mul;
}

void PointCloudFilter::setMLSSearchRadius(double radius) {
    m_mlsSearchRadius = radius;
}

PointCloudXYZRGB::Ptr PointCloudFilter::voxelGridDownsample(PointCloudXYZRGB::ConstPtr cloud) {
    Logger::info("Voxel grid downsampling with leaf size: " + std::to_string(m_voxelGridSize));
    
    PointCloudXYZRGB::Ptr filtered(new PointCloudXYZRGB);
    pcl::VoxelGrid<pcl::PointXYZRGB> vg;
    vg.setInputCloud(cloud);
    vg.setLeafSize(m_voxelGridSize, m_voxelGridSize, m_voxelGridSize);
    vg.filter(*filtered);
    
    Logger::info("Before: " + std::to_string(cloud->size()) + 
                 " points, After: " + std::to_string(filtered->size()) + " points");
    return filtered;
}

PointCloudXYZRGB::Ptr PointCloudFilter::removeStatisticalOutliers(PointCloudXYZRGB::ConstPtr cloud) {
    Logger::info("Removing statistical outliers...");
    
    PointCloudXYZRGB::Ptr filtered(new PointCloudXYZRGB);
    pcl::StatisticalOutlierRemoval<pcl::PointXYZRGB> sor;
    sor.setInputCloud(cloud);
    sor.setMeanK(m_statisticalMeanK);
    sor.setStddevMulThresh(m_statisticalStdDevMul);
    sor.filter(*filtered);
    
    int removed = static_cast<int>(cloud->size()) - static_cast<int>(filtered->size());
    Logger::info("Removed " + std::to_string(removed) + " outliers");
    return filtered;
}

PointCloudXYZRGB::Ptr PointCloudFilter::passThroughFilter(PointCloudXYZRGB::ConstPtr cloud,
                                                           const std::string& axis,
                                                           double min, double max) {
    PointCloudXYZRGB::Ptr filtered(new PointCloudXYZRGB);
    pcl::PassThrough<pcl::PointXYZRGB> pass;
    pass.setInputCloud(cloud);
    pass.setFilterFieldName(axis);
    pass.setFilterLimits(min, max);
    pass.filter(*filtered);
    return filtered;
}

PointCloudXYZRGB::Ptr PointCloudFilter::smoothMLS(PointCloudXYZRGB::ConstPtr cloud) {
    Logger::info("MLS smoothing with search radius: " + std::to_string(m_mlsSearchRadius));
    
    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);
    
    pcl::search::KdTree<pcl::PointXYZ>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZ>);
    pcl::MovingLeastSquares<pcl::PointXYZ, pcl::PointXYZ> mls;
    mls.setInputCloud(xyzCloud);
    mls.setSearchMethod(tree);
    mls.setSearchRadius(m_mlsSearchRadius);
    mls.setPolynomialOrder(2);
    mls.setComputeNormals(false);
    
    PointCloudXYZ::Ptr smoothed(new PointCloudXYZ);
    mls.process(*smoothed);
    
    PointCloudXYZRGB::Ptr result = PointCloudUtils::convertToRGB(smoothed);
    
    for (size_t i = 0; i < std::min(smoothed->size(), cloud->size()); ++i) {
        result->points[i].r = cloud->points[i].r;
        result->points[i].g = cloud->points[i].g;
        result->points[i].b = cloud->points[i].b;
    }
    
    return result;
}

PointCloudNormal::Ptr PointCloudFilter::estimateNormals(PointCloudXYZRGB::ConstPtr cloud,
                                                         double searchRadius) {
    Logger::info("Estimating normals...");
    
    if (searchRadius <= 0) {
        searchRadius = 0.02 * PointCloudUtils::computeCloudDiameter(cloud);
    }
    
    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);
    
    pcl::search::KdTree<pcl::PointXYZ>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZ>);
    pcl::NormalEstimation<pcl::PointXYZ, pcl::Normal> ne;
    ne.setInputCloud(xyzCloud);
    ne.setSearchMethod(tree);
    ne.setRadiusSearch(searchRadius);
    
    PointCloudNormal::Ptr normals(new PointCloudNormal);
    ne.compute(*normals);
    
    Logger::info("Normals estimated for " + std::to_string(normals->size()) + " points");
    return normals;
}

PointCloudData PointCloudFilter::filter(PointCloudXYZRGB::ConstPtr cloud,
                                         bool downsample,
                                         bool removeOutliers,
                                         bool smooth,
                                         bool estimateNormals) {
    Timer timer;
    Logger::info("Starting point cloud filtering pipeline...");
    
    PointCloudXYZRGB::Ptr current = cloud->makeShared();
    
    if (downsample && !current->empty()) {
        current = voxelGridDownsample(current);
    }
    
    if (removeOutliers && !current->empty()) {
        current = removeStatisticalOutliers(current);
    }
    
    if (smooth && !current->empty()) {
        current = smoothMLS(current);
    }
    
    PointCloudData result;
    result.cloud = current;
    result.hasNormals = false;
    
    if (estimateNormals && !current->empty()) {
        result.normals = estimateNormals(current);
        result.hasNormals = true;
    }
    
    Logger::info("Point cloud filtering completed in " + timer.elapsedString());
    return result;
}

DenseReconstructor::DenseReconstructor()
    : m_maxDepth(10.0)
    , m_minDepth(0.1)
    , m_disparityRange(128)
    , m_windowSize(9)
    , m_batchSize(10)
    , m_maxCloudPoints(50000000)
    , m_enableVoxelFusion(true)
    , m_fusionVoxelSize(0.002) {
}

DenseReconstructor::~DenseReconstructor() {
}

void DenseReconstructor::setMaxDepth(double maxDepth) {
    m_maxDepth = maxDepth;
}

void DenseReconstructor::setMinDepth(double minDepth) {
    m_minDepth = minDepth;
}

void DenseReconstructor::setDisparityRange(int range) {
    m_disparityRange = range;
}

void DenseReconstructor::setWindowSize(int size) {
    m_windowSize = size;
}

void DenseReconstructor::setBatchSize(int size) {
    m_batchSize = std::max(1, size);
    Logger::info("Batch size set to: " + std::to_string(m_batchSize));
}

void DenseReconstructor::setMaxCloudPoints(size_t maxPoints) {
    m_maxCloudPoints = maxPoints;
    Logger::info("Max cloud points set to: " + std::to_string(m_maxCloudPoints));
}

void DenseReconstructor::setEnableVoxelFusion(bool enable) {
    m_enableVoxelFusion = enable;
    Logger::info(std::string("Voxel fusion ") + (enable ? "enabled" : "disabled"));
}

void DenseReconstructor::setFusionVoxelSize(double size) {
    m_fusionVoxelSize = size;
    Logger::info("Fusion voxel size set to: " + std::to_string(m_fusionVoxelSize));
}

size_t DenseReconstructor::estimateMemoryUsage(size_t numPoints, size_t numImages) {
    size_t pointSize = sizeof(pcl::PointXYZRGB);
    size_t cloudOverhead = sizeof(pcl::PointCloud<pcl::PointXYZRGB>);
    
    size_t cloudMemory = numPoints * pointSize + cloudOverhead;
    size_t kdtreeOverhead = numPoints * 16;
    
    size_t imageMemory = 0;
    if (numImages > 0) {
        imageMemory = numImages * 640 * 480 * 3;
    }
    
    return cloudMemory + kdtreeOverhead + imageMemory;
}

size_t DenseReconstructor::getAvailableMemoryMB() {
#ifdef _WIN32
    MEMORYSTATUSEX memStatus;
    memStatus.dwLength = sizeof(memStatus);
    if (GlobalMemoryStatusEx(&memStatus)) {
        return static_cast<size_t>(memStatus.ullAvailPhys / (1024 * 1024));
    }
    return 0;
#else
    struct sysinfo info;
    sysinfo(&info);
    return static_cast<size_t>(info.freeram * info.mem_unit / (1024 * 1024));
#endif
}

PointCloudXYZRGB::Ptr DenseReconstructor::voxelGridMerge(PointCloudXYZRGB::Ptr existing,
                                                           PointCloudXYZRGB::Ptr newCloud,
                                                           double voxelSize) {
    PointCloudXYZRGB::Ptr merged(new PointCloudXYZRGB);
    *merged = *existing + *newCloud;
    
    merged->width = merged->size();
    merged->height = 1;
    merged->is_dense = false;
    
    if (merged->size() > m_maxCloudPoints) {
        Logger::info("Point count exceeds limit (" + std::to_string(merged->size()) + 
                     " > " + std::to_string(m_maxCloudPoints) + "), applying voxel filter...");
        
        pcl::VoxelGrid<pcl::PointXYZRGB> vg;
        vg.setInputCloud(merged);
        vg.setLeafSize(voxelSize, voxelSize, voxelSize);
        
        PointCloudXYZRGB::Ptr filtered(new PointCloudXYZRGB);
        vg.filter(*filtered);
        
        Logger::info("After voxel merge: " + std::to_string(filtered->size()) + " points");
        return filtered;
    }
    
    return merged;
}

void DenseReconstructor::applyDepthMapSubsampling(cv::Mat& depthMap, int step) {
    if (step <= 1 || depthMap.empty()) return;
    
    int newRows = depthMap.rows / step;
    int newCols = depthMap.cols / step;
    
    cv::Mat subsampled(newRows, newCols, depthMap.type());
    
    for (int y = 0; y < newRows; ++y) {
        for (int x = 0; x < newCols; ++x) {
            float sum = 0.0f;
            int count = 0;
            
            for (int dy = 0; dy < step && y * step + dy < depthMap.rows; ++dy) {
                for (int dx = 0; dx < step && x * step + dx < depthMap.cols; ++dx) {
                    float val = depthMap.at<float>(y * step + dy, x * step + dx);
                    if (val > 0) {
                        sum += val;
                        count++;
                    }
                }
            }
            
            subsampled.at<float>(y, x) = count > 0 ? sum / count : 0.0f;
        }
    }
    
    depthMap = subsampled;
}

cv::Mat DenseReconstructor::computeDepthMapBM(const cv::Mat& imgLeft,
                                                const cv::Mat& imgRight,
                                                int numDisparities,
                                                int blockSize) {
    cv::Mat grayLeft, grayRight;
    if (imgLeft.channels() == 3) {
        cv::cvtColor(imgLeft, grayLeft, cv::COLOR_BGR2GRAY);
        cv::cvtColor(imgRight, grayRight, cv::COLOR_BGR2GRAY);
    } else {
        grayLeft = imgLeft.clone();
        grayRight = imgRight.clone();
    }
    
    cv::Ptr<cv::StereoBM> stereo = cv::StereoBM::create(numDisparities, blockSize);
    cv::Mat disparity;
    stereo->compute(grayLeft, grayRight, disparity);
    
    disparity.convertTo(disparity, CV_32F);
    return disparity;
}

cv::Mat DenseReconstructor::computeDepthMapSGBM(const cv::Mat& imgLeft,
                                                  const cv::Mat& imgRight,
                                                  int numDisparities,
                                                  int blockSize) {
    cv::Mat grayLeft, grayRight;
    if (imgLeft.channels() == 3) {
        cv::cvtColor(imgLeft, grayLeft, cv::COLOR_BGR2GRAY);
        cv::cvtColor(imgRight, grayRight, cv::COLOR_BGR2GRAY);
    } else {
        grayLeft = imgLeft.clone();
        grayRight = imgRight.clone();
    }
    
    int channels = 1;
    cv::Ptr<cv::StereoSGBM> stereo = cv::StereoSGBM::create(
        0, numDisparities, blockSize,
        8 * channels * blockSize * blockSize,
        32 * channels * blockSize * blockSize,
        1, 63, 10, 100, 32,
        cv::StereoSGBM::MODE_HH
    );
    
    cv::Mat disparity;
    stereo->compute(grayLeft, grayRight, disparity);
    
    disparity.convertTo(disparity, CV_32F);
    return disparity;
}

PointCloudXYZRGB::Ptr DenseReconstructor::depthMapToPointCloud(const cv::Mat& depthMap,
                                                                 const cv::Mat& colorImage,
                                                                 const CameraParams& camera) {
    PointCloudXYZRGB::Ptr cloud(new PointCloudXYZRGB);
    
    double fx = camera.K.at<double>(0, 0);
    double fy = camera.K.at<double>(1, 1);
    double cx = camera.K.at<double>(0, 2);
    double cy = camera.K.at<double>(1, 2);
    
    for (int y = 0; y < depthMap.rows; ++y) {
        for (int x = 0; x < depthMap.cols; ++x) {
            float depth = depthMap.at<float>(y, x);
            if (depth <= 0 || std::isnan(depth) || std::isinf(depth)) {
                continue;
            }
            if (depth < m_minDepth || depth > m_maxDepth) {
                continue;
            }
            
            pcl::PointXYZRGB pt;
            pt.z = depth;
            pt.x = (x - cx) * depth / fx;
            pt.y = (y - cy) * depth / fy;
            
            if (colorImage.channels() == 3) {
                cv::Vec3b color = colorImage.at<cv::Vec3b>(y, x);
                pt.r = color[2];
                pt.g = color[1];
                pt.b = color[0];
            } else {
                uchar val = colorImage.at<uchar>(y, x);
                pt.r = pt.g = pt.b = val;
            }
            
            cloud->push_back(pt);
        }
    }
    
    cloud->width = cloud->size();
    cloud->height = 1;
    cloud->is_dense = false;
    
    return cloud;
}

PointCloudXYZRGB::Ptr DenseReconstructor::reconstructFromStereo(const cv::Mat& imgLeft,
                                                                 const cv::Mat& imgRight,
                                                                 const CameraParams& camLeft,
                                                                 const CameraParams& camRight) {
    Logger::info("Reconstructing from stereo pair...");
    
    cv::Mat disparity = computeDepthMapSGBM(imgLeft, imgRight, m_disparityRange, m_windowSize);
    
    double baseline = cv::norm(camLeft.t - camRight.t);
    double fx = camLeft.K.at<double>(0, 0);
    
    cv::Mat depthMap = cv::Mat::zeros(disparity.size(), CV_32F);
    for (int y = 0; y < disparity.rows; ++y) {
        for (int x = 0; x < disparity.cols; ++x) {
            float d = disparity.at<float>(y, x);
            if (d > 0) {
                depthMap.at<float>(y, x) = fx * baseline / d;
            }
        }
    }
    
    return depthMapToPointCloud(depthMap, imgLeft, camLeft);
}

PointCloudXYZRGB::Ptr DenseReconstructor::fuseDepthMaps(const std::vector<cv::Mat>& depthMaps,
                                                         const std::vector<cv::Mat>& images,
                                                         const std::vector<CameraParams>& cameras) {
    int totalMaps = static_cast<int>(depthMaps.size());
    Logger::info("Fusing " + std::to_string(totalMaps) + " depth maps with memory optimization...");
    
    size_t availableMemMB = getAvailableMemoryMB();
    Logger::info("Available memory: " + std::to_string(availableMemMB) + " MB");
    
    if (totalMaps > 50) {
        Logger::info("Large dataset detected (" + std::to_string(totalMaps) + 
                     " maps), using batch processing with batch size " + std::to_string(m_batchSize));
    }
    
    PointCloudXYZRGB::Ptr fusedCloud(new PointCloudXYZRGB);
    
    for (int batchStart = 0; batchStart < totalMaps; batchStart += m_batchSize) {
        int batchEnd = std::min(batchStart + m_batchSize, totalMaps);
        
        Logger::info("Processing batch " + std::to_string(batchStart / m_batchSize + 1) + 
                     "/" + std::to_string((totalMaps + m_batchSize - 1) / m_batchSize) +
                     " (maps " + std::to_string(batchStart) + "-" + std::to_string(batchEnd - 1) + ")");
        
        PointCloudXYZRGB::Ptr batchCloud(new PointCloudXYZRGB);
        
        for (int i = batchStart; i < batchEnd; ++i) {
            PointCloudXYZRGB::Ptr cloud = depthMapToPointCloud(depthMaps[i], images[i], cameras[i]);
            
            if (cloud->empty()) continue;
            
            Eigen::Matrix4f transform = Eigen::Matrix4f::Identity();
            for (int r = 0; r < 3; ++r) {
                for (int c = 0; c < 3; ++c) {
                    transform(r, c) = cameras[i].R.at<double>(r, c);
                }
                transform(r, 3) = cameras[i].t.at<double>(r, 0);
            }
            
            PointCloudXYZRGB::Ptr transformed(new PointCloudXYZRGB);
            pcl::transformPointCloud(*cloud, *transformed, transform);
            
            *batchCloud += *transformed;
        }
        
        batchCloud->width = batchCloud->size();
        batchCloud->height = 1;
        batchCloud->is_dense = false;
        
        if (m_enableVoxelFusion && !batchCloud->empty()) {
            pcl::VoxelGrid<pcl::PointXYZRGB> vg;
            vg.setInputCloud(batchCloud);
            vg.setLeafSize(m_fusionVoxelSize, m_fusionVoxelSize, m_fusionVoxelSize);
            
            PointCloudXYZRGB::Ptr filtered(new PointCloudXYZRGB);
            vg.filter(*filtered);
            
            Logger::info("Batch downsampled: " + std::to_string(batchCloud->size()) + 
                         " -> " + std::to_string(filtered->size()) + " points");
            batchCloud = filtered;
        }
        
        if (m_enableVoxelFusion && !fusedCloud->empty() && !batchCloud->empty()) {
            fusedCloud = voxelGridMerge(fusedCloud, batchCloud, m_fusionVoxelSize);
        } else if (!batchCloud->empty()) {
            *fusedCloud += *batchCloud;
            fusedCloud->width = fusedCloud->size();
            fusedCloud->height = 1;
            fusedCloud->is_dense = false;
        }
        
        size_t currentMemMB = estimateMemoryUsage(fusedCloud->size(), 0) / (1024 * 1024);
        Logger::info("Current cloud: " + std::to_string(fusedCloud->size()) + 
                     " points, estimated memory: " + std::to_string(currentMemMB) + " MB");
        
        if (availableMemMB > 0 && currentMemMB > availableMemMB * 0.8) {
            Logger::warning("Memory usage approaching limit, applying aggressive downsampling...");
            double aggressiveVoxelSize = m_fusionVoxelSize * 2.0;
            pcl::VoxelGrid<pcl::PointXYZRGB> vg;
            vg.setInputCloud(fusedCloud);
            vg.setLeafSize(aggressiveVoxelSize, aggressiveVoxelSize, aggressiveVoxelSize);
            
            PointCloudXYZRGB::Ptr filtered(new PointCloudXYZRGB);
            vg.filter(*filtered);
            fusedCloud = filtered;
            
            Logger::info("Aggressive downsampling: " + std::to_string(fusedCloud->size()) + " points remaining");
        }
        
        batchCloud.reset();
    }
    
    if (fusedCloud->size() > m_maxCloudPoints) {
        Logger::info("Final point count exceeds limit, applying final downsampling...");
        pcl::VoxelGrid<pcl::PointXYZRGB> vg;
        vg.setInputCloud(fusedCloud);
        vg.setLeafSize(m_fusionVoxelSize * 1.5, m_fusionVoxelSize * 1.5, m_fusionVoxelSize * 1.5);
        
        PointCloudXYZRGB::Ptr filtered(new PointCloudXYZRGB);
        vg.filter(*filtered);
        fusedCloud = filtered;
    }
    
    fusedCloud->width = fusedCloud->size();
    fusedCloud->height = 1;
    fusedCloud->is_dense = false;
    
    Logger::info("Fused point cloud has " + std::to_string(fusedCloud->size()) + " points");
    Logger::info("Memory optimization completed successfully");
    
    return fusedCloud;
}

PointCloudXYZRGB::Ptr DenseReconstructor::fuseDepthMapsIncremental(
    const std::vector<std::string>& depthMapFiles,
    const std::vector<std::string>& imageFiles,
    const std::vector<CameraParams>& cameras) {
    
    int totalMaps = static_cast<int>(depthMapFiles.size());
    Logger::info("Incremental fusion of " + std::to_string(totalMaps) + " depth map files...");
    
    PointCloudXYZRGB::Ptr fusedCloud(new PointCloudXYZRGB);
    
    for (int batchStart = 0; batchStart < totalMaps; batchStart += m_batchSize) {
        int batchEnd = std::min(batchStart + m_batchSize, totalMaps);
        
        PointCloudXYZRGB::Ptr batchCloud(new PointCloudXYZRGB);
        
        for (int i = batchStart; i < batchEnd; ++i) {
            cv::Mat depthMap = cv::imread(depthMapFiles[i], cv::IMREAD_UNCHANGED);
            cv::Mat colorImage = cv::imread(imageFiles[i]);
            
            if (depthMap.empty() || colorImage.empty()) {
                Logger::warning("Failed to load: " + depthMapFiles[i] + " or " + imageFiles[i]);
                continue;
            }
            
            if (depthMap.type() != CV_32F) {
                depthMap.convertTo(depthMap, CV_32F);
            }
            
            PointCloudXYZRGB::Ptr cloud = depthMapToPointCloud(depthMap, colorImage, cameras[i]);
            
            if (cloud->empty()) continue;
            
            Eigen::Matrix4f transform = Eigen::Matrix4f::Identity();
            for (int r = 0; r < 3; ++r) {
                for (int c = 0; c < 3; ++c) {
                    transform(r, c) = cameras[i].R.at<double>(r, c);
                }
                transform(r, 3) = cameras[i].t.at<double>(r, 0);
            }
            
            PointCloudXYZRGB::Ptr transformed(new PointCloudXYZRGB);
            pcl::transformPointCloud(*cloud, *transformed, transform);
            
            *batchCloud += *transformed;
            
            depthMap.release();
            colorImage.release();
        }
        
        batchCloud->width = batchCloud->size();
        batchCloud->height = 1;
        batchCloud->is_dense = false;
        
        if (m_enableVoxelFusion && !batchCloud->empty()) {
            pcl::VoxelGrid<pcl::PointXYZRGB> vg;
            vg.setInputCloud(batchCloud);
            vg.setLeafSize(m_fusionVoxelSize, m_fusionVoxelSize, m_fusionVoxelSize);
            
            PointCloudXYZRGB::Ptr filtered(new PointCloudXYZRGB);
            vg.filter(*filtered);
            batchCloud = filtered;
        }
        
        if (m_enableVoxelFusion && !fusedCloud->empty() && !batchCloud->empty()) {
            fusedCloud = voxelGridMerge(fusedCloud, batchCloud, m_fusionVoxelSize);
        } else if (!batchCloud->empty()) {
            *fusedCloud += *batchCloud;
            fusedCloud->width = fusedCloud->size();
            fusedCloud->height = 1;
            fusedCloud->is_dense = false;
        }
        
        Logger::info("Processed batch " + std::to_string(batchStart / m_batchSize + 1) + 
                     ", total points: " + std::to_string(fusedCloud->size()));
        
        batchCloud.reset();
    }
    
    fusedCloud->width = fusedCloud->size();
    fusedCloud->height = 1;
    fusedCloud->is_dense = false;
    
    Logger::info("Incremental fusion complete: " + std::to_string(fusedCloud->size()) + " points");
    return fusedCloud;
}

}
