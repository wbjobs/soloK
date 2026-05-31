#pragma once

#include "core/DataTypes.h"
#include <chrono>
#include <random>
#include <string>
#include <vector>

namespace Fossil3D {

class Timer {
public:
    Timer();
    void start();
    double elapsed() const;
    std::string elapsedString() const;

private:
    std::chrono::high_resolution_clock::time_point startTime;
};

class Logger {
public:
    enum Level { DEBUG, INFO, WARNING, ERROR };

    static void log(Level level, const std::string& message);
    static void debug(const std::string& message);
    static void info(const std::string& message);
    static void warning(const std::string& message);
    static void error(const std::string& message);

private:
    static std::string levelToString(Level level);
};

class MathUtils {
public:
    static double deg2rad(double degrees);
    static double rad2deg(double radians);
    static Eigen::Vector3d computeCentroid(const std::vector<Eigen::Vector3d>& points);
    static double pointToLineDistance(const Eigen::Vector3d& point, 
                                       const Eigen::Vector3d& lineStart, 
                                       const Eigen::Vector3d& lineEnd);
    static double computeCurveLength(const std::vector<Eigen::Vector3d>& points);
    static double computeAngle(const Eigen::Vector3d& v1, const Eigen::Vector3d& v2);
    static Eigen::Matrix4d createTransformationMatrix(const Eigen::Matrix3d& R, 
                                                      const Eigen::Vector3d& t);
    static void getRandomColors(int num, std::vector<Eigen::Vector3i>& colors);
};

class FileUtils {
public:
    static std::vector<std::string> getImageFiles(const std::string& directory);
    static bool fileExists(const std::string& filename);
    static bool directoryExists(const std::string& directory);
    static std::string getFileName(const std::string& path);
    static std::string getFileExtension(const std::string& path);
    static std::string getParentDirectory(const std::string& path);
    static bool createDirectory(const std::string& path);
};

class PointCloudUtils {
public:
    static PointCloudXYZRGB::Ptr convertToRGB(PointCloudXYZ::ConstPtr cloud);
    static PointCloudXYZ::Ptr convertToXYZ(PointCloudXYZRGB::ConstPtr cloud);
    static Eigen::Vector4f computeBoundingBox(PointCloudXYZRGB::ConstPtr cloud);
    static double computeCloudDiameter(PointCloudXYZRGB::ConstPtr cloud);
};

}
