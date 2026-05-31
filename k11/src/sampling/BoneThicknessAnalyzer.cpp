#include "sampling/BoneThicknessAnalyzer.h"
#include <pcl/features/normal_3d.h>
#include <pcl/filters/voxel_grid.h>
#include <pcl/common/centroid.h>
#include <algorithm>
#include <cmath>
#include <unordered_set>

namespace Fossil3D {

BoneThicknessAnalyzer::BoneThicknessAnalyzer()
    : m_searchRadius(0.01)
    , m_thicknessThreshold(0.002)
    , m_densityWeight(0.5) {
}

BoneThicknessAnalyzer::~BoneThicknessAnalyzer() {
}

void BoneThicknessAnalyzer::setSearchRadius(double radius) {
    m_searchRadius = radius;
}

void BoneThicknessAnalyzer::setThicknessThreshold(double minThresh) {
    m_thicknessThreshold = minThresh;
}

void BoneThicknessAnalyzer::setDensityWeight(double weight) {
    m_densityWeight = weight;
}

double BoneThicknessAnalyzer::estimatePointThickness(PointCloudXYZRGB::ConstPtr cloud,
                                                   int index,
                                                   pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree) {
    const auto& queryPt = cloud->points[index];
    Eigen::Vector3d pt(queryPt.x, queryPt.y, queryPt.z);

    pcl::NormalEstimation<pcl::PointXYZRGB, pcl::Normal> ne;
    ne.setInputCloud(cloud);
    ne.setSearchMethod(tree);
    ne.setRadiusSearch(m_searchRadius);

    pcl::PointCloud<pcl::Normal>::Ptr normals(new pcl::PointCloud<pcl::Normal>);
    ne.compute(*normals);

    if (normals->points.empty()) return 0.0;

    Eigen::Vector3d normal(normals->points[0].normal_x,
                          normals->points[0].normal_y,
                          normals->points[0].normal_z);

    if (normal.norm() < 1e-6) return 0.0;

    double thicknessPos = computeOppositeDistance(cloud, pt, normal);
    double thicknessNeg = computeOppositeDistance(cloud, pt, -normal);

    return thicknessPos + thicknessNeg;
}

double BoneThicknessAnalyzer::computeOppositeDistance(PointCloudXYZRGB::ConstPtr cloud,
                                                    const Eigen::Vector3d& point,
                                                    const Eigen::Vector3d& normal) {
    const double stepSize = 0.0005;
    const int maxSteps = 200;
    const double distanceThreshold = 0.001;

    Eigen::Vector3d current = point;
    Eigen::Vector3d step = normal * stepSize;

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    for (int i = 0; i < maxSteps; ++i) {
        current += step;

        pcl::PointXYZRGB query;
        query.x = current.x();
        query.y = current.y();
        query.z = current.z();

        std::vector<int> indices(1);
        std::vector<float> distances(1);

        if (tree->nearestKSearch(query, 1, indices, distances) > 0) {
            if (distances[0] > distanceThreshold * distanceThreshold) {
                return (current - point).norm();
            }
        }
    }

    return (current - point).norm();
}

ThicknessResult BoneThicknessAnalyzer::computeLocalThickness(PointCloudXYZRGB::ConstPtr cloud) {
    ThicknessResult result;
    result.thicknessCloud.reset(new PointCloudXYZRGB);
    *result.thicknessCloud = *cloud;

    if (cloud->empty()) {
        result.meanThickness = 0;
        result.maxThickness = 0;
        result.minThickness = 0;
        result.stdThickness = 0;
        return result;
    }

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    result.thicknessValues.resize(cloud->size(), 0.0);
    double sum = 0.0;
    result.maxThickness = -1e10;
    result.minThickness = 1e10;

    for (size_t i = 0; i < cloud->size(); ++i) {
        double thickness = estimatePointThickness(cloud, static_cast<int>(i), tree);
        result.thicknessValues[i] = thickness;
        sum += thickness;
        result.maxThickness = std::max(result.maxThickness, thickness);
        result.minThickness = std::min(result.minThickness, thickness);
    }

    result.meanThickness = sum / cloud->size();

    double variance = 0.0;
    for (double t : result.thicknessValues) {
        double diff = t - result.meanThickness;
        variance += diff * diff;
    }
    result.stdThickness = std::sqrt(variance / cloud->size());

    result.thicknessCloud = generateThicknessHeatmap(cloud, result.thicknessValues);

    return result;
}

ThicknessResult BoneThicknessAnalyzer::computeMeshThickness(pcl::PolygonMesh::ConstPtr mesh) {
    PointCloudXYZRGB::Ptr cloud(new PointCloudXYZRGB);
    pcl::fromPCLPointCloud2(mesh->cloud, *cloud);
    return computeLocalThickness(cloud);
}

PointCloudXYZRGB::Ptr BoneThicknessAnalyzer::generateThicknessHeatmap(PointCloudXYZRGB::ConstPtr cloud,
                                                                       const std::vector<double>& thicknessValues) {
    PointCloudXYZRGB::Ptr heatmap(new PointCloudXYZRGB);
    *heatmap = *cloud;

    if (thicknessValues.empty()) return heatmap;

    double maxT = *std::max_element(thicknessValues.begin(), thicknessValues.end());
    double minT = *std::min_element(thicknessValues.begin(), thicknessValues.end());
    double range = maxT - minT;

    if (range < 1e-10) range = 1.0;

    for (size_t i = 0; i < cloud->size(); ++i) {
        double normalized = (thicknessValues[i] - minT) / range;

        uint8_t r, g, b;
        if (normalized < 0.25) {
            r = 0;
            g = static_cast<uint8_t>(normalized * 4 * 255);
            b = 255;
        } else if (normalized < 0.5) {
            r = 0;
            g = 255;
            b = static_cast<uint8_t>((0.5 - normalized) * 4 * 255);
        } else if (normalized < 0.75) {
            r = static_cast<uint8_t>((normalized - 0.5) * 4 * 255);
            g = 255;
            b = 0;
        } else {
            r = 255;
            g = static_cast<uint8_t>((1.0 - normalized) * 4 * 255);
            b = 0;
        }

        heatmap->points[i].r = r;
        heatmap->points[i].g = g;
        heatmap->points[i].b = b;
    }

    return heatmap;
}

double BoneThicknessAnalyzer::getBoneQualityScore(double thickness, double curvature) {
    double thicknessScore = std::min(thickness / 0.01, 1.0);
    double curvatureScore = 1.0 - std::min(curvature / 0.5, 1.0);
    return thicknessScore * (1.0 - m_densityWeight) + curvatureScore * m_densityWeight;
}

bool BoneThicknessAnalyzer::isDenseRegion(double thickness, double localDensity) {
    return thickness > m_thicknessThreshold && localDensity > 0.3;
}

void BoneThicknessAnalyzer::regionGrowing(PointCloudXYZRGB::ConstPtr cloud,
                                          const std::vector<double>& thickness,
                                          std::vector<DenseRegion>& regions) {
    std::vector<bool> visited(cloud->size(), false);
    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    for (size_t i = 0; i < cloud->size(); ++i) {
        if (visited[i]) continue;

        double localDensity = 0;
        std::vector<int> indices;
        std::vector<float> distances;

        if (tree->radiusSearch(cloud->points[i], m_searchRadius, indices, distances) > 0) {
            localDensity = static_cast<double>(indices.size()) / (4.0 / 3.0 * M_PI * m_searchRadius * m_searchRadius * m_searchRadius);
        }

        if (!isDenseRegion(thickness[i], localDensity)) continue;

        DenseRegion region;
        region.id = static_cast<int>(regions.size());

        std::vector<int> stack;
        stack.push_back(static_cast<int>(i));

        while (!stack.empty()) {
            int currIdx = stack.back();
            stack.pop_back();

            if (visited[currIdx]) continue;
            visited[currIdx] = true;
            region.pointIndices.push_back(currIdx);

            std::vector<int> neighbors;
            std::vector<float> neighborDist;
            tree->radiusSearch(cloud->points[currIdx], m_searchRadius * 0.5, neighbors, neighborDist);

            for (int neighbor : neighbors) {
                if (!visited[neighbor]) {
                    double nd = 0;
                    std::vector<int> ni;
                    std::vector<float> ndist;
                    if (tree->radiusSearch(cloud->points[neighbor], m_searchRadius, ni, ndist) > 0) {
                        nd = static_cast<double>(ni.size()) / (4.0 / 3.0 * M_PI * m_searchRadius * m_searchRadius * m_searchRadius);
                    }
                    if (isDenseRegion(thickness[neighbor], nd)) {
                        stack.push_back(neighbor);
                    }
                }
            }
        }

        if (!region.pointIndices.empty()) {
            Eigen::Vector3d centroid(0, 0, 0);
            double avgThickness = 0;
            for (int idx : region.pointIndices) {
                centroid += Eigen::Vector3d(cloud->points[idx].x, cloud->points[idx].y, cloud->points[idx].z);
                avgThickness += thickness[idx];
            }
            centroid /= region.pointIndices.size();
            avgThickness /= region.pointIndices.size();

            region.center = centroid;
            region.thickness = avgThickness;
            region.area = region.pointIndices.size() * m_searchRadius * m_searchRadius * 0.5;
            region.densityScore = localDensity;
            region.boneQuality = getBoneQualityScore(avgThickness);

            regions.push_back(region);
        }
    }
}

std::vector<DenseRegion> BoneThicknessAnalyzer::detectDenseRegions(PointCloudXYZRGB::ConstPtr cloud,
                                                                      const ThicknessResult& thicknessResult,
                                                                      int minRegionSize) {
    std::vector<DenseRegion> allRegions;
    regionGrowing(cloud, thicknessResult.thicknessValues, allRegions);

    std::vector<DenseRegion> filtered;
    for (const auto& region : allRegions) {
        if (static_cast<int>(region.pointIndices.size()) >= minRegionSize) {
            filtered.push_back(region);
        }
    }

    std::sort(filtered.begin(), filtered.end(), [](const DenseRegion& a, const DenseRegion& b) {
        return a.boneQuality > b.boneQuality;
    });

    return filtered;
}

}
