#include "core/Utils.h"
#include <pcl/common/centroid.h>
#include <pcl/common/pca.h>
#include <filesystem>
#include <iomanip>
#include <sstream>
#include <iostream>
#include <algorithm>

namespace Fossil3D {

Timer::Timer() {
    start();
}

void Timer::start() {
    startTime = std::chrono::high_resolution_clock::now();
}

double Timer::elapsed() const {
    auto end = std::chrono::high_resolution_clock::now();
    return std::chrono::duration<double>(end - startTime).count();
}

std::string Timer::elapsedString() const {
    double seconds = elapsed();
    std::ostringstream oss;
    if (seconds < 60.0) {
        oss << std::fixed << std::setprecision(2) << seconds << "s";
    } else if (seconds < 3600.0) {
        int minutes = static_cast<int>(seconds / 60.0);
        double secs = seconds - minutes * 60.0;
        oss << minutes << "m " << std::fixed << std::setprecision(1) << secs << "s";
    } else {
        int hours = static_cast<int>(seconds / 3600.0);
        int minutes = static_cast<int>((seconds - hours * 3600.0) / 60.0);
        oss << hours << "h " << minutes << "m";
    }
    return oss.str();
}

void Logger::log(Level level, const std::string& message) {
    std::cout << "[" << levelToString(level) << "] " << message << std::endl;
}

void Logger::debug(const std::string& message) {
    log(DEBUG, message);
}

void Logger::info(const std::string& message) {
    log(INFO, message);
}

void Logger::warning(const std::string& message) {
    log(WARNING, message);
}

void Logger::error(const std::string& message) {
    log(ERROR, message);
}

std::string Logger::levelToString(Level level) {
    switch (level) {
        case DEBUG: return "DEBUG";
        case INFO: return "INFO";
        case WARNING: return "WARN";
        case ERROR: return "ERROR";
        default: return "UNKNOWN";
    }
}

double MathUtils::deg2rad(double degrees) {
    return degrees * M_PI / 180.0;
}

double MathUtils::rad2deg(double radians) {
    return radians * 180.0 / M_PI;
}

Eigen::Vector3d MathUtils::computeCentroid(const std::vector<Eigen::Vector3d>& points) {
    Eigen::Vector3d centroid(0, 0, 0);
    for (const auto& p : points) {
        centroid += p;
    }
    if (!points.empty()) {
        centroid /= points.size();
    }
    return centroid;
}

double MathUtils::pointToLineDistance(const Eigen::Vector3d& point, 
                                       const Eigen::Vector3d& lineStart, 
                                       const Eigen::Vector3d& lineEnd) {
    Eigen::Vector3d line = lineEnd - lineStart;
    Eigen::Vector3d pointVec = point - lineStart;
    double lineLength = line.norm();
    if (lineLength < 1e-10) return pointVec.norm();
    double t = std::max(0.0, std::min(1.0, pointVec.dot(line) / (lineLength * lineLength)));
    Eigen::Vector3d projection = lineStart + t * line;
    return (point - projection).norm();
}

double MathUtils::computeCurveLength(const std::vector<Eigen::Vector3d>& points) {
    double length = 0.0;
    for (size_t i = 1; i < points.size(); ++i) {
        length += (points[i] - points[i-1]).norm();
    }
    return length;
}

double MathUtils::computeAngle(const Eigen::Vector3d& v1, const Eigen::Vector3d& v2) {
    double dot = v1.normalized().dot(v2.normalized());
    dot = std::max(-1.0, std::min(1.0, dot));
    return std::acos(dot);
}

Eigen::Matrix4d MathUtils::createTransformationMatrix(const Eigen::Matrix3d& R, 
                                                       const Eigen::Vector3d& t) {
    Eigen::Matrix4d T = Eigen::Matrix4d::Identity();
    T.block<3, 3>(0, 0) = R;
    T.block<3, 1>(0, 3) = t;
    return T;
}

void MathUtils::getRandomColors(int num, std::vector<Eigen::Vector3i>& colors) {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);
    colors.resize(num);
    for (int i = 0; i < num; ++i) {
        colors[i] = Eigen::Vector3i(dis(gen), dis(gen), dis(gen));
    }
}

std::vector<std::string> FileUtils::getImageFiles(const std::string& directory) {
    std::vector<std::string> files;
    std::vector<std::string> extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif"};
    
    for (const auto& entry : std::filesystem::directory_iterator(directory)) {
        if (entry.is_regular_file()) {
            std::string ext = entry.path().extension().string();
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
            for (const auto& validExt : extensions) {
                if (ext == validExt) {
                    files.push_back(entry.path().string());
                    break;
                }
            }
        }
    }
    std::sort(files.begin(), files.end());
    return files;
}

bool FileUtils::fileExists(const std::string& filename) {
    return std::filesystem::exists(filename) && std::filesystem::is_regular_file(filename);
}

bool FileUtils::directoryExists(const std::string& directory) {
    return std::filesystem::exists(directory) && std::filesystem::is_directory(directory);
}

std::string FileUtils::getFileName(const std::string& path) {
    return std::filesystem::path(path).stem().string();
}

std::string FileUtils::getFileExtension(const std::string& path) {
    return std::filesystem::path(path).extension().string();
}

std::string FileUtils::getParentDirectory(const std::string& path) {
    return std::filesystem::path(path).parent_path().string();
}

bool FileUtils::createDirectory(const std::string& path) {
    return std::filesystem::create_directories(path);
}

PointCloudXYZRGB::Ptr PointCloudUtils::convertToRGB(PointCloudXYZ::ConstPtr cloud) {
    PointCloudXYZRGB::Ptr rgbCloud(new PointCloudXYZRGB);
    rgbCloud->resize(cloud->size());
    for (size_t i = 0; i < cloud->size(); ++i) {
        rgbCloud->points[i].x = cloud->points[i].x;
        rgbCloud->points[i].y = cloud->points[i].y;
        rgbCloud->points[i].z = cloud->points[i].z;
        rgbCloud->points[i].r = 255;
        rgbCloud->points[i].g = 255;
        rgbCloud->points[i].b = 255;
    }
    rgbCloud->width = cloud->width;
    rgbCloud->height = cloud->height;
    rgbCloud->is_dense = cloud->is_dense;
    return rgbCloud;
}

PointCloudXYZ::Ptr PointCloudUtils::convertToXYZ(PointCloudXYZRGB::ConstPtr cloud) {
    PointCloudXYZ::Ptr xyzCloud(new PointCloudXYZ);
    xyzCloud->resize(cloud->size());
    for (size_t i = 0; i < cloud->size(); ++i) {
        xyzCloud->points[i].x = cloud->points[i].x;
        xyzCloud->points[i].y = cloud->points[i].y;
        xyzCloud->points[i].z = cloud->points[i].z;
    }
    xyzCloud->width = cloud->width;
    xyzCloud->height = cloud->height;
    xyzCloud->is_dense = cloud->is_dense;
    return xyzCloud;
}

Eigen::Vector4f PointCloudUtils::computeBoundingBox(PointCloudXYZRGB::ConstPtr cloud) {
    Eigen::Vector4f minPt, maxPt;
    pcl::getMinMax3D(*cloud, minPt, maxPt);
    return maxPt - minPt;
}

double PointCloudUtils::computeCloudDiameter(PointCloudXYZRGB::ConstPtr cloud) {
    Eigen::Vector4f size = computeBoundingBox(cloud);
    return size.norm();
}

}
