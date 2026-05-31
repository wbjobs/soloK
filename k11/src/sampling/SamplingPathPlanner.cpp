#include "sampling/SamplingPathPlanner.h"
#include <pcl/features/normal_3d.h>
#include <pcl/search/kdtree.h>
#include <algorithm>
#include <cmath>
#include <random>
#include <limits>

namespace Fossil3D {

SamplingPathPlanner::SamplingPathPlanner()
    : m_maxSamplingPoints(10)
    , m_minBoneQuality(0.6)
    , m_drillDiameter(0.002)
    , m_safeMargin(0.001)
    , m_maxDrillDepth(0.02) {
}

SamplingPathPlanner::~SamplingPathPlanner() {
}

void SamplingPathPlanner::setMaxSamplingPoints(int count) {
    m_maxSamplingPoints = count;
}

void SamplingPathPlanner::setMinBoneQuality(double quality) {
    m_minBoneQuality = quality;
}

void SamplingPathPlanner::setDrillDiameter(double diameter) {
    m_drillDiameter = diameter;
}

void SamplingPathPlanner::setSafeMargin(double margin) {
    m_safeMargin = margin;
}

void SamplingPathPlanner::setMaxDrillDepth(double maxDepth) {
    m_maxDrillDepth = maxDepth;
}

Eigen::Vector3d SamplingPathPlanner::estimateSurfaceNormal(PointCloudXYZRGB::ConstPtr cloud,
                                                           const Eigen::Vector3d& point) {
    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    pcl::PointXYZRGB query;
    query.x = point.x();
    query.y = point.y();
    query.z = point.z();

    std::vector<int> indices;
    std::vector<float> distances;
    tree->radiusSearch(query, 0.01, indices, distances);

    if (indices.empty()) return Eigen::Vector3d(0, 1, 0);

    Eigen::Vector3d centroid(0, 0, 0);
    for (int idx : indices) {
        centroid += Eigen::Vector3d(cloud->points[idx].x, cloud->points[idx].y, cloud->points[idx].z);
    }
    centroid /= indices.size();

    Eigen::MatrixXd points(3, indices.size());
    for (size_t i = 0; i < indices.size(); ++i) {
        points(0, i) = cloud->points[indices[i]].x - centroid.x();
        points(1, i) = cloud->points[indices[i]].y - centroid.y();
        points(2, i) = cloud->points[indices[i]].z - centroid.z();
    }

    Eigen::MatrixXd cov = points * points.transpose();
    Eigen::SelfAdjointEigenSolver<Eigen::MatrixXd> solver(cov);

    if (solver.eigenvalues()[0] < 1e-10) return Eigen::Vector3d(0, 1, 0);

    return solver.eigenvectors().col(0).normalized();
}

std::vector<SamplingPoint> SamplingPathPlanner::selectOptimalPoints(PointCloudXYZRGB::ConstPtr cloud,
                                                                     const std::vector<DenseRegion>& regions) {
    std::vector<SamplingPoint> candidates;

    for (const auto& region : regions) {
        if (region.boneQuality < m_minBoneQuality) continue;

        SamplingPoint sp;
        sp.id = candidates.size();
        sp.position = region.center;
        sp.normal = estimateSurfaceNormal(cloud, region.center);
        sp.boneQuality = region.boneQuality;
        sp.thickness = region.thickness;
        sp.drillDepth = std::min(region.thickness * 0.7, m_maxDrillDepth);
        sp.drillAngle = 90.0;
        sp.isEntryPoint = true;

        candidates.push_back(sp);
    }

    std::sort(candidates.begin(), candidates.end(), [](const SamplingPoint& a, const SamplingPoint& b) {
        return a.boneQuality > b.boneQuality;
    });

    if (static_cast<int>(candidates.size()) > m_maxSamplingPoints) {
        candidates.resize(m_maxSamplingPoints);
    }

    for (size_t i = 0; i < candidates.size(); ++i) {
        candidates[i].id = i;
    }

    return candidates;
}

double SamplingPathPlanner::computePathDistance(const std::vector<int>& tour,
                                                 const std::vector<std::vector<double>>& distanceMatrix) {
    if (tour.empty()) return 0.0;

    double total = 0.0;
    for (size_t i = 0; i < tour.size() - 1; ++i) {
        total += distanceMatrix[tour[i]][tour[i + 1]];
    }
    total += distanceMatrix[tour.back()][tour[0]];
    return total;
}

double SamplingPathPlanner::twoOptImprove(std::vector<int>& tour,
                                           const std::vector<std::vector<double>>& distanceMatrix) {
    int n = tour.size();
    if (n < 4) return 0.0;

    double bestDistance = computePathDistance(tour, distanceMatrix);
    bool improved = true;
    int maxIterations = 100;
    int iteration = 0;

    while (improved && iteration < maxIterations) {
        improved = false;
        iteration++;

        for (int i = 0; i < n - 1; ++i) {
            for (int j = i + 2; j < n; ++j) {
                int a = tour[i];
                int b = tour[i + 1];
                int c = tour[j];
                int d = tour[(j + 1) % n];

                double oldDist = distanceMatrix[a][b] + distanceMatrix[c][d];
                double newDist = distanceMatrix[a][c] + distanceMatrix[b][d];

                if (newDist < oldDist - 1e-10) {
                    std::reverse(tour.begin() + i + 1, tour.begin() + j + 1);
                    bestDistance = bestDistance - oldDist + newDist;
                    improved = true;
                }
            }
        }
    }

    return bestDistance;
}

std::vector<int> SamplingPathPlanner::solveTSP(const std::vector<SamplingPoint>& points) {
    int n = points.size();
    if (n <= 2) {
        std::vector<int> tour(n);
        for (int i = 0; i < n; ++i) tour[i] = i;
        return tour;
    }

    std::vector<std::vector<double>> distanceMatrix(n, std::vector<double>(n, 0.0));
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            if (i == j) continue;
            distanceMatrix[i][j] = (points[i].position - points[j].position).norm();
        }
    }

    std::vector<int> tour(n);
    std::iota(tour.begin(), tour.end(), 0);

    std::random_device rd;
    std::mt19937 g(rd());
    std::shuffle(tour.begin(), tour.end(), g);

    twoOptImprove(tour, distanceMatrix);

    return tour;
}

double SamplingPathPlanner::computeDrillDepth(PointCloudXYZRGB::ConstPtr cloud,
                                               const Eigen::Vector3d& entry,
                                               const Eigen::Vector3d& direction) {
    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    const double stepSize = 0.0005;
    const int maxSteps = 100;
    const double distanceThreshold = 0.002;

    Eigen::Vector3d current = entry + direction * m_safeMargin;

    for (int i = 0; i < maxSteps; ++i) {
        current += direction * stepSize;

        pcl::PointXYZRGB query;
        query.x = current.x();
        query.y = current.y();
        query.z = current.z();

        std::vector<int> indices(1);
        std::vector<float> distances(1);

        if (tree->nearestKSearch(query, 1, indices, distances) > 0) {
            if (distances[0] > distanceThreshold * distanceThreshold) {
                return (current - entry).norm();
            }
        }
    }

    return std::min((current - entry).norm(), m_maxDrillDepth);
}

bool SamplingPathPlanner::isSafeDrillPath(PointCloudXYZRGB::ConstPtr cloud,
                                          const Eigen::Vector3d& entry,
                                          const Eigen::Vector3d& exit) {
    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    Eigen::Vector3d direction = (exit - entry).normalized();
    double length = (exit - entry).norm();

    const int steps = 20;
    for (int i = 0; i <= steps; ++i) {
        double t = static_cast<double>(i) / steps;
        Eigen::Vector3d point = entry + direction * length * t;

        pcl::PointXYZRGB query;
        query.x = point.x();
        query.y = point.y();
        query.z = point.z();

        std::vector<int> indices(5);
        std::vector<float> distances(5);

        if (tree->nearestKSearch(query, 5, indices, distances) > 0) {
            for (float d : distances) {
                if (std::sqrt(d) < m_drillDiameter * 0.5 + m_safeMargin) {
                    return true;
                }
            }
        }
    }

    return false;
}

DrillPath SamplingPathPlanner::generateDrillPath(PointCloudXYZRGB::ConstPtr cloud,
                                                  const SamplingPoint& point) {
    DrillPath path;
    path.id = point.id;
    path.entryPoint = point;

    Eigen::Vector3d drillDirection = point.normal;
    double depth = computeDrillDepth(cloud, point.position, drillDirection);

    Eigen::Vector3d exitPoint = point.position + drillDirection * depth;

    SamplingPoint exit;
    exit.id = point.id;
    exit.position = exitPoint;
    exit.normal = -drillDirection;
    exit.boneQuality = point.boneQuality;
    exit.thickness = point.thickness;
    exit.drillDepth = depth;
    exit.isEntryPoint = false;
    path.exitPoint = exit;

    path.length = depth;
    path.boneVolumeRemoved = M_PI * (m_drillDiameter * 0.5) * (m_drillDiameter * 0.5) * depth;
    path.damageScore = computeDamageScore(path);
    path.trajectory = generateDrillTrajectory(point.position, exitPoint);

    return path;
}

std::vector<Eigen::Vector3d> SamplingPathPlanner::generateDrillTrajectory(const Eigen::Vector3d& entry,
                                                                            const Eigen::Vector3d& exit,
                                                                            int segments) {
    std::vector<Eigen::Vector3d> trajectory;
    Eigen::Vector3d direction = (exit - entry).normalized();
    double length = (exit - entry).norm();

    for (int i = 0; i <= segments; ++i) {
        double t = static_cast<double>(i) / segments;
        trajectory.push_back(entry + direction * length * t);
    }

    return trajectory;
}

double SamplingPathPlanner::computeDamageScore(const DrillPath& path) {
    double volumeDamage = path.boneVolumeRemoved * 1000.0;
    double depthPenalty = path.length > 0.01 ? (path.length - 0.01) * 50.0 : 0.0;
    double qualityBonus = (1.0 - path.entryPoint.boneQuality) * 10.0;

    return volumeDamage + depthPenalty + qualityBonus;
}

SamplingPlan SamplingPathPlanner::planSamplingPath(PointCloudXYZRGB::ConstPtr cloud,
                                                    const std::vector<DenseRegion>& denseRegions) {
    SamplingPlan plan;

    auto optimalPoints = selectOptimalPoints(cloud, denseRegions);
    plan.optimalSamplingPoints = optimalPoints;

    if (optimalPoints.empty()) {
        plan.totalDamage = 0;
        plan.totalPathLength = 0;
        plan.averageBoneQuality = 0;
        return plan;
    }

    plan.tspOrder = solveTSP(optimalPoints);

    double totalQuality = 0;
    for (const auto& sp : optimalPoints) {
        totalQuality += sp.boneQuality;
        DrillPath path = generateDrillPath(cloud, sp);
        plan.drillPaths.push_back(path);
        plan.totalDamage += path.damageScore;
        plan.totalPathLength += path.length;
    }
    plan.averageBoneQuality = totalQuality / optimalPoints.size();

    return plan;
}

PointCloudXYZRGB::Ptr SamplingPathPlanner::generateSamplingVisualization(PointCloudXYZRGB::ConstPtr cloud,
                                                                           const SamplingPlan& plan) {
    PointCloudXYZRGB::Ptr visCloud(new PointCloudXYZRGB);
    *visCloud = *cloud;

    for (const auto& path : plan.drillPaths) {
        for (const auto& pt : path.trajectory) {
            pcl::PointXYZRGB point;
            point.x = pt.x();
            point.y = pt.y();
            point.z = pt.z();
            point.r = 255;
            point.g = 0;
            point.b = 0;
            visCloud->push_back(point);
        }

        pcl::PointXYZRGB entryMarker;
        entryMarker.x = path.entryPoint.position.x();
        entryMarker.y = path.entryPoint.position.y();
        entryMarker.z = path.entryPoint.position.z();
        entryMarker.r = 0;
        entryMarker.g = 255;
        entryMarker.b = 0;
        for (int i = 0; i < 20; ++i) {
            visCloud->push_back(entryMarker);
        }

        pcl::PointXYZRGB exitMarker;
        exitMarker.x = path.exitPoint.position.x();
        exitMarker.y = path.exitPoint.position.y();
        exitMarker.z = path.exitPoint.position.z();
        exitMarker.r = 255;
        exitMarker.g = 165;
        exitMarker.b = 0;
        for (int i = 0; i < 20; ++i) {
            visCloud->push_back(exitMarker);
        }
    }

    return visCloud;
}

}
