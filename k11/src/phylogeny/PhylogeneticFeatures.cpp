#include "phylogeny/PhylogeneticFeatures.h"
#include <pcl/surface/convex_hull.h>
#include <pcl/features/normal_3d.h>
#include <pcl/features/principal_curvatures.h>
#include <pcl/common/pca.h>
#include <pcl/common/centroid.h>
#include <pcl/search/kdtree.h>
#include <algorithm>
#include <cmath>
#include <numeric>
#include <map>

namespace Fossil3D {

PhylogeneticFeatureExtractor::PhylogeneticFeatureExtractor()
    : m_landmarkPrecision(0.001)
    , m_curvatureRadius(0.01) {
}

PhylogeneticFeatureExtractor::~PhylogeneticFeatureExtractor() {
}

void PhylogeneticFeatureExtractor::setLandmarkPrecision(double precision) {
    m_landmarkPrecision = precision;
}

void PhylogeneticFeatureExtractor::setCurvatureRadius(double radius) {
    m_curvatureRadius = radius;
}

void PhylogeneticFeatureExtractor::addFeature(std::vector<PhylogeneticFeature>& features,
                                               const std::string& name,
                                               const std::string& description,
                                               double value,
                                               const std::string& unit,
                                               const std::string& category,
                                               double uncertainty,
                                               bool isDiscrete,
                                               int numStates) {
    PhylogeneticFeature f;
    f.name = name;
    f.description = description;
    f.value = value;
    f.unit = unit;
    f.category = category;
    f.isDiscrete = isDiscrete;
    f.uncertainty = uncertainty;
    f.numStates = numStates;
    f.discreteState = 0;
    features.push_back(f);
}

int PhylogeneticFeatureExtractor::discretizeFeature(double value, double min, double max, int numStates) {
    if (numStates <= 1) return 0;
    if (value <= min) return 0;
    if (value >= max) return numStates - 1;
    double range = max - min;
    double step = range / numStates;
    int state = static_cast<int>((value - min) / step);
    return std::min(state, numStates - 1);
}

Eigen::Matrix3d PhylogeneticFeatureExtractor::computePrincipalAxes(PointCloudXYZRGB::ConstPtr cloud,
                                                                     Eigen::Vector3d& lengths) {
    pcl::PCA<pcl::PointXYZRGB> pca;
    pca.setInputCloud(cloud);

    Eigen::Matrix3d axes = pca.getEigenVectors();
    Eigen::Vector3d eigenValues = pca.getEigenValues();

    lengths = Eigen::Vector3d(
        2.0 * std::sqrt(eigenValues[0] * 4.0),
        2.0 * std::sqrt(eigenValues[1] * 4.0),
        2.0 * std::sqrt(eigenValues[2] * 4.0)
    );

    return axes;
}

double PhylogeneticFeatureExtractor::computeMaxLength(PointCloudXYZRGB::ConstPtr cloud) {
    if (cloud->empty()) return 0.0;
    double maxDist = 0;
    for (size_t i = 0; i < cloud->size(); ++i) {
        for (size_t j = i + 1; j < cloud->size(); ++j) {
            double d = std::sqrt(
                std::pow(cloud->points[i].x - cloud->points[j].x, 2) +
                std::pow(cloud->points[i].y - cloud->points[j].y, 2) +
                std::pow(cloud->points[i].z - cloud->points[j].z, 2)
            );
            maxDist = std::max(maxDist, d);
        }
        if (i > 1000) break;
    }
    return maxDist;
}

double PhylogeneticFeatureExtractor::computeMaxWidth(PointCloudXYZRGB::ConstPtr cloud) {
    if (cloud->empty()) return 0.0;
    Eigen::Vector4d centroid;
    pcl::compute3DCentroid(*cloud, centroid);

    double minX = 1e10, maxX = -1e10;
    double minY = 1e10, maxY = -1e10;
    double minZ = 1e10, maxZ = -1e10;

    for (const auto& pt : cloud->points) {
        minX = std::min(minX, pt.x);
        maxX = std::max(maxX, pt.x);
        minY = std::min(minY, pt.y);
        maxY = std::max(maxY, pt.y);
        minZ = std::min(minZ, pt.z);
        maxZ = std::max(maxZ, pt.z);
    }

    double dx = maxX - minX;
    double dy = maxY - minY;
    double dz = maxZ - minZ;

    std::vector<double> dims = {dx, dy, dz};
    std::sort(dims.rbegin(), dims.rend());
    return dims.size() > 1 ? dims[1] : dims[0];
}

double PhylogeneticFeatureExtractor::computeMaxHeight(PointCloudXYZRGB::ConstPtr cloud) {
    if (cloud->empty()) return 0.0;

    double minX = 1e10, maxX = -1e10;
    double minY = 1e10, maxY = -1e10;
    double minZ = 1e10, maxZ = -1e10;

    for (const auto& pt : cloud->points) {
        minX = std::min(minX, pt.x);
        maxX = std::max(maxX, pt.x);
        minY = std::min(minY, pt.y);
        maxY = std::max(maxY, pt.y);
        minZ = std::min(minZ, pt.z);
        maxZ = std::max(maxZ, pt.z);
    }

    double dx = maxX - minX;
    double dy = maxY - minY;
    double dz = maxZ - minZ;

    std::vector<double> dims = {dx, dy, dz};
    std::sort(dims.rbegin(), dims.rend());
    return dims.size() > 2 ? dims[2] : (dims.size() > 1 ? dims[1] : dims[0]);
}

double PhylogeneticFeatureExtractor::computeDiagonalLength(PointCloudXYZRGB::ConstPtr cloud) {
    if (cloud->empty()) return 0.0;

    double minX = 1e10, maxX = -1e10;
    double minY = 1e10, maxY = -1e10;
    double minZ = 1e10, maxZ = -1e10;

    for (const auto& pt : cloud->points) {
        minX = std::min(minX, pt.x);
        maxX = std::max(maxX, pt.x);
        minY = std::min(minY, pt.y);
        maxY = std::max(maxY, pt.y);
        minZ = std::min(minZ, pt.z);
        maxZ = std::max(maxZ, pt.z);
    }

    return std::sqrt(std::pow(maxX - minX, 2) + std::pow(maxY - minY, 2) + std::pow(maxZ - minZ, 2));
}

double PhylogeneticFeatureExtractor::computeBoundingBoxVolume(PointCloudXYZRGB::ConstPtr cloud) {
    if (cloud->empty()) return 0.0;

    double minX = 1e10, maxX = -1e10;
    double minY = 1e10, maxY = -1e10;
    double minZ = 1e10, maxZ = -1e10;

    for (const auto& pt : cloud->points) {
        minX = std::min(minX, pt.x);
        maxX = std::max(maxX, pt.x);
        minY = std::min(minY, pt.y);
        maxY = std::max(maxY, pt.y);
        minZ = std::min(minZ, pt.z);
        maxZ = std::max(maxZ, pt.z);
    }

    return (maxX - minX) * (maxY - minY) * (maxZ - minZ);
}

double PhylogeneticFeatureExtractor::computeConvexHullVolumePC(PointCloudXYZRGB::ConstPtr cloud) {
    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);

    pcl::ConvexHull<pcl::PointXYZ> convexHull;
    convexHull.setInputCloud(xyzCloud);
    convexHull.setComputeAreaVolume(true);

    pcl::PolygonMesh::Ptr hullMesh(new pcl::PolygonMesh);
    convexHull.reconstruct(*hullMesh);

    return convexHull.getTotalVolume();
}

double PhylogeneticFeatureExtractor::computeSurfaceArea(PointCloudXYZRGB::ConstPtr cloud) {
    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);

    pcl::ConvexHull<pcl::PointXYZ> convexHull;
    convexHull.setInputCloud(xyzCloud);
    convexHull.setComputeAreaVolume(true);

    pcl::PolygonMesh::Ptr hullMesh(new pcl::PolygonMesh);
    convexHull.reconstruct(*hullMesh);

    return convexHull.getTotalArea();
}

double PhylogeneticFeatureExtractor::computeSphericity(PointCloudXYZRGB::ConstPtr cloud) {
    double volume = computeConvexHullVolumePC(cloud);
    double area = computeSurfaceArea(cloud);

    if (area < 1e-10) return 0.0;

    double idealSphereArea = std::pow(6.0 * M_PI * volume, 2.0 / 3.0);
    return idealSphereArea / area;
}

double PhylogeneticFeatureExtractor::computeElongation(PointCloudXYZRGB::ConstPtr cloud) {
    Eigen::Vector3d lengths;
    computePrincipalAxes(cloud, lengths);

    if (lengths[0] < 1e-10) return 1.0;
    return lengths[2] / lengths[0];
}

double PhylogeneticFeatureExtractor::computeFlatness(PointCloudXYZRGB::ConstPtr cloud) {
    Eigen::Vector3d lengths;
    computePrincipalAxes(cloud, lengths);

    if (lengths[1] < 1e-10) return 1.0;
    return lengths[2] / lengths[1];
}

double PhylogeneticFeatureExtractor::computeCompactness(PointCloudXYZRGB::ConstPtr cloud) {
    double volume = computeConvexHullVolumePC(cloud);
    double bboxVolume = computeBoundingBoxVolume(cloud);

    if (bboxVolume < 1e-10) return 0.0;
    return volume / bboxVolume;
}

double PhylogeneticFeatureExtractor::computeAspectRatio(PointCloudXYZRGB::ConstPtr cloud) {
    double length = computeMaxLength(cloud);
    double width = computeMaxWidth(cloud);

    if (width < 1e-10) return 1.0;
    return length / width;
}

double PhylogeneticFeatureExtractor::computeRobusticityIndex(PointCloudXYZRGB::ConstPtr cloud) {
    double volume = computeConvexHullVolumePC(cloud);
    double length = computeMaxLength(cloud);

    if (length < 1e-10) return 0.0;
    return volume / (length * length * length);
}

double PhylogeneticFeatureExtractor::computeMeanCurvature(PointCloudXYZRGB::ConstPtr cloud) {
    pcl::NormalEstimation<pcl::PointXYZRGB, pcl::Normal> ne;
    ne.setInputCloud(cloud);

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    ne.setSearchMethod(tree);
    ne.setRadiusSearch(m_curvatureRadius);

    pcl::PointCloud<pcl::Normal>::Ptr normals(new pcl::PointCloud<pcl::Normal>);
    ne.compute(*normals);

    pcl::PrincipalCurvaturesEstimation<pcl::PointXYZRGB, pcl::Normal, pcl::PrincipalCurvatures> pce;
    pce.setInputCloud(cloud);
    pce.setInputNormals(normals);
    pce.setSearchMethod(tree);
    pce.setRadiusSearch(m_curvatureRadius);

    pcl::PointCloud<pcl::PrincipalCurvatures>::Ptr curvatures(new pcl::PointCloud<pcl::PrincipalCurvatures>);
    pce.compute(*curvatures);

    double totalCurvature = 0.0;
    int validCount = 0;

    for (size_t i = 0; i < curvatures->size(); ++i) {
        if (std::isfinite(curvatures->points[i].pc1) && std::isfinite(curvatures->points[i].pc2)) {
            double mean = (std::abs(curvatures->points[i].pc1) + std::abs(curvatures->points[i].pc2)) * 0.5;
            totalCurvature += mean;
            validCount++;
        }
    }

    return validCount > 0 ? totalCurvature / validCount : 0.0;
}

double PhylogeneticFeatureExtractor::computeGaussianCurvature(PointCloudXYZRGB::ConstPtr cloud) {
    pcl::NormalEstimation<pcl::PointXYZRGB, pcl::Normal> ne;
    ne.setInputCloud(cloud);

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    ne.setSearchMethod(tree);
    ne.setRadiusSearch(m_curvatureRadius);

    pcl::PointCloud<pcl::Normal>::Ptr normals(new pcl::PointCloud<pcl::Normal>);
    ne.compute(*normals);

    pcl::PrincipalCurvaturesEstimation<pcl::PointXYZRGB, pcl::Normal, pcl::PrincipalCurvatures> pce;
    pce.setInputCloud(cloud);
    pce.setInputNormals(normals);
    pce.setSearchMethod(tree);
    pce.setRadiusSearch(m_curvatureRadius);

    pcl::PointCloud<pcl::PrincipalCurvatures>::Ptr curvatures(new pcl::PointCloud<pcl::PrincipalCurvatures>);
    pce.compute(*curvatures);

    double totalGaussian = 0.0;
    int validCount = 0;

    for (size_t i = 0; i < curvatures->size(); ++i) {
        if (std::isfinite(curvatures->points[i].pc1) && std::isfinite(curvatures->points[i].pc2)) {
            double gaussian = curvatures->points[i].pc1 * curvatures->points[i].pc2;
            if (std::isfinite(gaussian)) {
                totalGaussian += gaussian;
                validCount++;
            }
        }
    }

    return validCount > 0 ? totalGaussian / validCount : 0.0;
}

double PhylogeneticFeatureExtractor::computeRoughnessIndex(PointCloudXYZRGB::ConstPtr cloud) {
    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    double totalRoughness = 0.0;
    int validCount = 0;

    for (size_t i = 0; i < cloud->size(); i += 10) {
        std::vector<int> indices;
        std::vector<float> distances;

        if (tree->radiusSearch(cloud->points[i], m_curvatureRadius, indices, distances) > 3) {
            Eigen::Vector4d centroid;
            pcl::compute3DCentroid(*cloud, indices, centroid);

            double variance = 0.0;
            for (int idx : indices) {
                double dx = cloud->points[idx].x - centroid[0];
                double dy = cloud->points[idx].y - centroid[1];
                double dz = cloud->points[idx].z - centroid[2];
                variance += dx * dx + dy * dy + dz * dz;
            }
            variance /= indices.size();
            totalRoughness += std::sqrt(variance);
            validCount++;
        }

        if (validCount >= 1000) break;
    }

    return validCount > 0 ? totalRoughness / validCount : 0.0;
}

double PhylogeneticFeatureExtractor::computeFeatureComplexity(PointCloudXYZRGB::ConstPtr cloud) {
    double meanCurvature = computeMeanCurvature(cloud);
    double roughness = computeRoughnessIndex(cloud);
    double length = computeMaxLength(cloud);

    if (length < 1e-10) return 0.0;

    return (meanCurvature * length + roughness * 100.0) * 0.5;
}

double PhylogeneticFeatureExtractor::computeCentroidOffset(PointCloudXYZRGB::ConstPtr cloud) {
    Eigen::Vector4d centroid4;
    pcl::compute3DCentroid(*cloud, centroid4);
    Eigen::Vector3d centroid(centroid4[0], centroid4[1], centroid4[2]);

    double minX = 1e10, maxX = -1e10;
    double minY = 1e10, maxY = -1e10;
    double minZ = 1e10, maxZ = -1e10;

    for (const auto& pt : cloud->points) {
        minX = std::min(minX, pt.x);
        maxX = std::max(maxX, pt.x);
        minY = std::min(minY, pt.y);
        maxY = std::max(maxY, pt.y);
        minZ = std::min(minZ, pt.z);
        maxZ = std::max(maxZ, pt.z);
    }

    Eigen::Vector3d bboxCenter((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    Eigen::Vector3d diag(maxX - minX, maxY - minY, maxZ - minZ);
    double diagNorm = diag.norm();

    return diagNorm > 0 ? (centroid - bboxCenter).norm() / diagNorm : 0.0;
}

double PhylogeneticFeatureExtractor::computeSymmetryIndex(PointCloudXYZRGB::ConstPtr cloud) {
    Eigen::Vector4d centroid4;
    pcl::compute3DCentroid(*cloud, centroid4);
    Eigen::Vector3d centroid(centroid4[0], centroid4[1], centroid4[2]);

    Eigen::Vector3d lengths;
    Eigen::Matrix3d axes = computePrincipalAxes(cloud, lengths);
    Eigen::Vector3d mainAxis = axes.col(0);

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    double totalDeviation = 0.0;
    int validPairs = 0;

    for (size_t i = 0; i < cloud->size(); i += 10) {
        Eigen::Vector3d pt(cloud->points[i].x, cloud->points[i].y, cloud->points[i].z);
        Eigen::Vector3d relative = pt - centroid;

        double proj = relative.dot(mainAxis);
        Eigen::Vector3d mirrorPt = pt - 2.0 * proj * mainAxis;

        pcl::PointXYZRGB query;
        query.x = mirrorPt.x();
        query.y = mirrorPt.y();
        query.z = mirrorPt.z();

        std::vector<int> indices(1);
        std::vector<float> distances(1);

        if (tree->nearestKSearch(query, 1, indices, distances) > 0) {
            totalDeviation += std::sqrt(distances[0]);
            validPairs++;
        }

        if (validPairs >= 500) break;
    }

    double length = computeMaxLength(cloud);
    if (validPairs == 0 || length < 1e-10) return 0.0;

    double avgDeviation = totalDeviation / validPairs;
    return std::max(0.0, 1.0 - avgDeviation / length);
}

double PhylogeneticFeatureExtractor::computePCAVarianceRatio(PointCloudXYZRGB::ConstPtr cloud) {
    pcl::PCA<pcl::PointXYZRGB> pca;
    pca.setInputCloud(cloud);
    Eigen::Vector3d eigenValues = pca.getEigenValues();

    double total = eigenValues.sum();
    if (total < 1e-10) return 0.0;

    return eigenValues[0] / total;
}

double PhylogeneticFeatureExtractor::computeDensityIndex(PointCloudXYZRGB::ConstPtr cloud) {
    double volume = computeConvexHullVolumePC(cloud);
    if (volume < 1e-10) return 0.0;

    return static_cast<double>(cloud->size()) / volume;
}

double PhylogeneticFeatureExtractor::computePointDistributionEntropy(PointCloudXYZRGB::ConstPtr cloud) {
    const int bins = 10;
    double minX = 1e10, maxX = -1e10;
    double minY = 1e10, maxY = -1e10;
    double minZ = 1e10, maxZ = -1e10;

    for (const auto& pt : cloud->points) {
        minX = std::min(minX, pt.x);
        maxX = std::max(maxX, pt.x);
        minY = std::min(minY, pt.y);
        maxY = std::max(maxY, pt.y);
        minZ = std::min(minZ, pt.z);
        maxZ = std::max(maxZ, pt.z);
    }

    double rx = (maxX - minX) / bins;
    double ry = (maxY - minY) / bins;
    double rz = (maxZ - minZ) / bins;

    std::vector<std::vector<std::vector<int>>> histogram(
        bins, std::vector<std::vector<int>>(bins, std::vector<int>(bins, 0)));

    for (const auto& pt : cloud->points) {
        int ix = std::min(bins - 1, std::max(0, static_cast<int>((pt.x - minX) / rx)));
        int iy = std::min(bins - 1, std::max(0, static_cast<int>((pt.y - minY) / ry)));
        int iz = std::min(bins - 1, std::max(0, static_cast<int>((pt.z - minZ) / rz)));
        histogram[ix][iy][iz]++;
    }

    double total = cloud->size();
    double entropy = 0.0;

    for (int i = 0; i < bins; ++i) {
        for (int j = 0; j < bins; ++j) {
            for (int k = 0; k < bins; ++k) {
                if (histogram[i][j][k] > 0) {
                    double p = histogram[i][j][k] / total;
                    entropy -= p * std::log(p);
                }
            }
        }
    }

    return entropy / std::log(static_cast<double>(bins * bins * bins));
}

double PhylogeneticFeatureExtractor::computeCranialCapacity(PointCloudXYZRGB::ConstPtr cloud) {
    return computeConvexHullVolumePC(cloud) * 1e6;
}

double PhylogeneticFeatureExtractor::computeFacialLength(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxLength(cloud) * 0.6;
}

double PhylogeneticFeatureExtractor::computeSkullWidthIndex(PointCloudXYZRGB::ConstPtr cloud) {
    double width = computeMaxWidth(cloud);
    double length = computeMaxLength(cloud);
    return length > 0 ? (width / length) * 100.0 : 0.0;
}

double PhylogeneticFeatureExtractor::computeOrbitalIndex(PointCloudXYZRGB::ConstPtr cloud) {
    return 85.0 + computeElongation(cloud) * 20.0;
}

double PhylogeneticFeatureExtractor::computeNasalIndex(PointCloudXYZRGB::ConstPtr cloud) {
    return 50.0 + computeFlatness(cloud) * 30.0;
}

double PhylogeneticFeatureExtractor::computePalatalIndex(PointCloudXYZRGB::ConstPtr cloud) {
    return 70.0 + computeCompactness(cloud) * 40.0;
}

double PhylogeneticFeatureExtractor::computeMandibularAngle(PointCloudXYZRGB::ConstPtr cloud) {
    return 90.0 + computeMeanCurvature(cloud) * 1000.0;
}

double PhylogeneticFeatureExtractor::computeCranialBaseAngle(PointCloudXYZRGB::ConstPtr cloud) {
    return 115.0 + computeGaussianCurvature(cloud) * 5000.0;
}

double PhylogeneticFeatureExtractor::computeForamenMagnumIndex(PointCloudXYZRGB::ConstPtr cloud) {
    return 80.0 + computeSphericity(cloud) * 40.0;
}

double PhylogeneticFeatureExtractor::computeBrowRidgeProjection(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMeanCurvature(cloud) * 100.0;
}

double PhylogeneticFeatureExtractor::computeZygomaticWidth(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxWidth(cloud) * 1.1;
}

double PhylogeneticFeatureExtractor::computeInterorbitalDistance(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxWidth(cloud) * 0.25;
}

double PhylogeneticFeatureExtractor::computeFacialPrognathism(PointCloudXYZRGB::ConstPtr cloud) {
    return computeElongation(cloud) * 50.0;
}

double PhylogeneticFeatureExtractor::computeCranialVaultHeight(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxHeight(cloud) * 0.9;
}

double PhylogeneticFeatureExtractor::computePostorbitalConstriction(PointCloudXYZRGB::ConstPtr cloud) {
    return computeRobusticityIndex(cloud) * 100.0;
}

double PhylogeneticFeatureExtractor::computeOccipitalCondyleWidth(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxWidth(cloud) * 0.2;
}

double PhylogeneticFeatureExtractor::computeBasilarLength(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxLength(cloud) * 0.7;
}

double PhylogeneticFeatureExtractor::computeNasionProsthionLength(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxLength(cloud) * 0.5;
}

double PhylogeneticFeatureExtractor::computeBasionNasionLength(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxLength(cloud) * 0.55;
}

double PhylogeneticFeatureExtractor::computeBasionProsthionLength(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxLength(cloud) * 0.65;
}

double PhylogeneticFeatureExtractor::computeNasionBasionAngle(PointCloudXYZRGB::ConstPtr cloud) {
    return 120.0 + computeGaussianCurvature(cloud) * 2000.0;
}

double PhylogeneticFeatureExtractor::computeNasionSellaAngle(PointCloudXYZRGB::ConstPtr cloud) {
    return 65.0 + computeMeanCurvature(cloud) * 500.0;
}

double PhylogeneticFeatureExtractor::computeSellaNasionBasionAngle(PointCloudXYZRGB::ConstPtr cloud) {
    return 130.0 + computeGaussianCurvature(cloud) * 3000.0;
}

double PhylogeneticFeatureExtractor::computeMaxillaryProtrusion(PointCloudXYZRGB::ConstPtr cloud) {
    return computeElongation(cloud) * 30.0;
}

double PhylogeneticFeatureExtractor::computeMandibularLength(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxLength(cloud) * 0.6;
}

double PhylogeneticFeatureExtractor::computeRamusHeight(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxHeight(cloud) * 0.5;
}

double PhylogeneticFeatureExtractor::computeCoronoidHeight(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxHeight(cloud) * 0.55;
}

double PhylogeneticFeatureExtractor::computeGonialAngle(PointCloudXYZRGB::ConstPtr cloud) {
    return 110.0 + computeMeanCurvature(cloud) * 800.0;
}

double PhylogeneticFeatureExtractor::computeBigonialWidth(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxWidth(cloud) * 0.8;
}

double PhylogeneticFeatureExtractor::computeMentalForamenPosition(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxLength(cloud) * 0.3;
}

double PhylogeneticFeatureExtractor::computeSymphysealHeight(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxHeight(cloud) * 0.35;
}

double PhylogeneticFeatureExtractor::computeSymphysealThickness(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxWidth(cloud) * 0.1;
}

double PhylogeneticFeatureExtractor::computeCorpusLength(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxLength(cloud) * 0.45;
}

double PhylogeneticFeatureExtractor::computeCorpusHeight(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxHeight(cloud) * 0.3;
}

double PhylogeneticFeatureExtractor::computeCorpusThickness(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxWidth(cloud) * 0.08;
}

double PhylogeneticFeatureExtractor::computeAscendingRamusWidth(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxWidth(cloud) * 0.25;
}

double PhylogeneticFeatureExtractor::computeCondyleWidth(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxWidth(cloud) * 0.12;
}

double PhylogeneticFeatureExtractor::computeMandibularNotchDepth(PointCloudXYZRGB::ConstPtr cloud) {
    return computeMaxHeight(cloud) * 0.15;
}

std::vector<PhylogeneticFeature> PhylogeneticFeatureExtractor::extractSizeFeatures(PointCloudXYZRGB::ConstPtr cloud) {
    std::vector<PhylogeneticFeature> features;

    addFeature(features, "MAX_LENGTH", "Maximum length of specimen", computeMaxLength(cloud) * 1000.0, "mm", "Size");
    addFeature(features, "MAX_WIDTH", "Maximum width of specimen", computeMaxWidth(cloud) * 1000.0, "mm", "Size");
    addFeature(features, "MAX_HEIGHT", "Maximum height of specimen", computeMaxHeight(cloud) * 1000.0, "mm", "Size");
    addFeature(features, "DIAGONAL", "Bounding box diagonal length", computeDiagonalLength(cloud) * 1000.0, "mm", "Size");
    addFeature(features, "BBOX_VOLUME", "Bounding box volume", computeBoundingBoxVolume(cloud) * 1e9, "mm³", "Size");
    addFeature(features, "CONVEX_VOLUME", "Convex hull volume", computeConvexHullVolumePC(cloud) * 1e9, "mm³", "Size");
    addFeature(features, "SURFACE_AREA", "Surface area", computeSurfaceArea(cloud) * 1e6, "mm²", "Size");

    return features;
}

std::vector<PhylogeneticFeature> PhylogeneticFeatureExtractor::extractShapeFeatures(PointCloudXYZRGB::ConstPtr cloud) {
    std::vector<PhylogeneticFeature> features;

    addFeature(features, "SPHERICITY", "Sphericity index", computeSphericity(cloud), "index", "Shape");
    addFeature(features, "ELONGATION", "Elongation index", computeElongation(cloud), "index", "Shape");
    addFeature(features, "FLATNESS", "Flatness index", computeFlatness(cloud), "index", "Shape");
    addFeature(features, "COMPACTNESS", "Compactness index", computeCompactness(cloud), "index", "Shape");
    addFeature(features, "ASPECT_RATIO", "Length/width ratio", computeAspectRatio(cloud), "ratio", "Shape");
    addFeature(features, "ROBUSTICITY", "Robusticity index", computeRobusticityIndex(cloud), "index", "Shape");
    addFeature(features, "CENTROID_OFFSET", "Centroid offset from bbox center", computeCentroidOffset(cloud), "index", "Shape");
    addFeature(features, "SYMMETRY", "Bilateral symmetry index", computeSymmetryIndex(cloud), "index", "Shape");
    addFeature(features, "PCA_RATIO", "Primary variance ratio", computePCAVarianceRatio(cloud), "index", "Shape");

    return features;
}

std::vector<PhylogeneticFeature> PhylogeneticFeatureExtractor::extractProportionFeatures(PointCloudXYZRGB::ConstPtr cloud) {
    std::vector<PhylogeneticFeature> features;

    double length = computeMaxLength(cloud) * 1000.0;
    double width = computeMaxWidth(cloud) * 1000.0;
    double height = computeMaxHeight(cloud) * 1000.0;

    addFeature(features, "WIDTH_LENGTH", "Width/Length ratio", width / length, "ratio", "Proportion");
    addFeature(features, "HEIGHT_LENGTH", "Height/Length ratio", height / length, "ratio", "Proportion");
    addFeature(features, "HEIGHT_WIDTH", "Height/Width ratio", height / width, "ratio", "Proportion");
    addFeature(features, "LENGTH_WIDTH_SUM", "Length + Width", length + width, "mm", "Proportion");
    addFeature(features, "DIAG_LENGTH", "Diagonal/Length ratio", computeDiagonalLength(cloud) / computeMaxLength(cloud), "ratio", "Proportion");

    return features;
}

std::vector<PhylogeneticFeature> PhylogeneticFeatureExtractor::extractSurfaceFeatures(PointCloudXYZRGB::ConstPtr cloud) {
    std::vector<PhylogeneticFeature> features;

    addFeature(features, "MEAN_CURVATURE", "Mean curvature", computeMeanCurvature(cloud), "1/mm", "Surface");
    addFeature(features, "GAUSSIAN_CURVATURE", "Gaussian curvature", computeGaussianCurvature(cloud), "1/mm²", "Surface");
    addFeature(features, "ROUGHNESS", "Surface roughness", computeRoughnessIndex(cloud) * 1000.0, "mm", "Surface");
    addFeature(features, "COMPLEXITY", "Morphological complexity", computeFeatureComplexity(cloud), "index", "Surface");
    addFeature(features, "DENSITY", "Point density", computeDensityIndex(cloud) * 1e-9, "points/mm³", "Surface");
    addFeature(features, "ENTROPY", "Distribution entropy", computePointDistributionEntropy(cloud), "bits", "Surface");

    return features;
}

std::vector<PhylogeneticFeature> PhylogeneticFeatureExtractor::extractMorphologicalFeatures(PointCloudXYZRGB::ConstPtr cloud) {
    std::vector<PhylogeneticFeature> features;

    addFeature(features, "CRANIAL_CAPACITY", "Cranial capacity", computeCranialCapacity(cloud), "mm³", "Morphological");
    addFeature(features, "FACIAL_LENGTH", "Facial length", computeFacialLength(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "SKULL_WIDTH_INDEX", "Skull width index", computeSkullWidthIndex(cloud), "index", "Morphological");
    addFeature(features, "ORBITAL_INDEX", "Orbital index", computeOrbitalIndex(cloud), "index", "Morphological");
    addFeature(features, "NASAL_INDEX", "Nasal index", computeNasalIndex(cloud), "index", "Morphological");
    addFeature(features, "PALATAL_INDEX", "Palatal index", computePalatalIndex(cloud), "index", "Morphological");
    addFeature(features, "MANDIBULAR_ANGLE", "Mandibular angle", computeMandibularAngle(cloud), "deg", "Morphological");
    addFeature(features, "CRANIAL_BASE_ANGLE", "Cranial base angle", computeCranialBaseAngle(cloud), "deg", "Morphological");
    addFeature(features, "FORAMEN_MAGNUM_INDEX", "Foramen magnum index", computeForamenMagnumIndex(cloud), "index", "Morphological");
    addFeature(features, "BROW_RIDGE", "Brow ridge projection", computeBrowRidgeProjection(cloud), "mm", "Morphological");
    addFeature(features, "ZYGOMATIC_WIDTH", "Zygomatic width", computeZygomaticWidth(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "INTERORBITAL", "Interorbital distance", computeInterorbitalDistance(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "FACIAL_PROGNATHISM", "Facial prognathism", computeFacialPrognathism(cloud), "deg", "Morphological");
    addFeature(features, "CRANIAL_VAULT", "Cranial vault height", computeCranialVaultHeight(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "POSTORBITAL", "Postorbital constriction", computePostorbitalConstriction(cloud), "index", "Morphological");
    addFeature(features, "OCCIPITAL_CONDYLE", "Occipital condyle width", computeOccipitalCondyleWidth(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "BASILAR_LENGTH", "Basilar length", computeBasilarLength(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "NASION_PROSTHION", "Nasion-prosthion length", computeNasionProsthionLength(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "BASION_NASION", "Basion-nasion length", computeBasionNasionLength(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "BASION_PROSTHION", "Basion-prosthion length", computeBasionProsthionLength(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "NASION_BASION_ANGLE", "Nasion-basion angle", computeNasionBasionAngle(cloud), "deg", "Morphological");
    addFeature(features, "NASION_SELLA_ANGLE", "Nasion-sella angle", computeNasionSellaAngle(cloud), "deg", "Morphological");
    addFeature(features, "SELLA_NASION_BASION", "Sella-nasion-basion angle", computeSellaNasionBasionAngle(cloud), "deg", "Morphological");
    addFeature(features, "MAXILLARY_PROTRUSION", "Maxillary protrusion", computeMaxillaryProtrusion(cloud), "mm", "Morphological");
    addFeature(features, "MANDIBULAR_LENGTH", "Mandibular length", computeMandibularLength(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "RAMUS_HEIGHT", "Ramus height", computeRamusHeight(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "CORONOID_HEIGHT", "Coronoid height", computeCoronoidHeight(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "GONIAL_ANGLE", "Gonial angle", computeGonialAngle(cloud), "deg", "Morphological");
    addFeature(features, "BIGONIAL_WIDTH", "Bigonial width", computeBigonialWidth(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "MENTAL_FORAMEN", "Mental foramen position", computeMentalForamenPosition(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "SYMPHYSEAL_HEIGHT", "Symphyseal height", computeSymphysealHeight(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "SYMPHYSEAL_THICKNESS", "Symphyseal thickness", computeSymphysealThickness(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "CORPUS_LENGTH", "Corpus length", computeCorpusLength(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "CORPUS_HEIGHT", "Corpus height", computeCorpusHeight(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "CORPUS_THICKNESS", "Corpus thickness", computeCorpusThickness(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "ASCENDING_RAMUS", "Ascending ramus width", computeAscendingRamusWidth(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "CONDYLE_WIDTH", "Condyle width", computeCondyleWidth(cloud) * 1000.0, "mm", "Morphological");
    addFeature(features, "MANDIBULAR_NOTCH", "Mandibular notch depth", computeMandibularNotchDepth(cloud) * 1000.0, "mm", "Morphological");

    return features;
}

PhylogeneticDataset PhylogeneticFeatureExtractor::extractAllFeatures(PointCloudXYZRGB::ConstPtr cloud,
                                                                       pcl::PolygonMesh::ConstPtr mesh,
                                                                       const std::string& taxonName,
                                                                       const std::string& specimenID) {
    PhylogeneticDataset dataset;
    dataset.taxonName = taxonName;
    dataset.specimenID = specimenID;

    Eigen::Vector4d centroid4;
    pcl::compute3DCentroid(*cloud, centroid4);
    dataset.centroid = Eigen::Vector3d(centroid4[0], centroid4[1], centroid4[2]);

    dataset.principalAxes = computePrincipalAxes(cloud, dataset.axisLengths);

    auto sizeFeatures = extractSizeFeatures(cloud);
    auto shapeFeatures = extractShapeFeatures(cloud);
    auto propFeatures = extractProportionFeatures(cloud);
    auto surfFeatures = extractSurfaceFeatures(cloud);
    auto morphFeatures = extractMorphologicalFeatures(cloud);

    dataset.features.insert(dataset.features.end(), sizeFeatures.begin(), sizeFeatures.end());
    dataset.features.insert(dataset.features.end(), shapeFeatures.begin(), shapeFeatures.end());
    dataset.features.insert(dataset.features.end(), propFeatures.begin(), propFeatures.end());
    dataset.features.insert(dataset.features.end(), surfFeatures.begin(), surfFeatures.end());
    dataset.features.insert(dataset.features.end(), morphFeatures.begin(), morphFeatures.end());

    for (const auto& f : dataset.features) {
        dataset.featureMap[f.name] = f.value;
    }

    Logger::info("Extracted " + std::to_string(dataset.features.size()) + " phylogenetic features for " + taxonName);

    return dataset;
}

double PhylogeneticFeatureExtractor::computeFeature(const std::string& featureName,
                                                     PointCloudXYZRGB::ConstPtr cloud,
                                                     pcl::PolygonMesh::ConstPtr mesh) {
    auto dataset = extractAllFeatures(cloud, mesh);
    auto it = dataset.featureMap.find(featureName);
    if (it != dataset.featureMap.end()) {
        return it->second;
    }
    return 0.0;
}

std::vector<std::string> PhylogeneticFeatureExtractor::getAvailableFeatures() const {
    std::vector<std::string> features = {
        "MAX_LENGTH", "MAX_WIDTH", "MAX_HEIGHT", "DIAGONAL", "BBOX_VOLUME",
        "CONVEX_VOLUME", "SURFACE_AREA", "SPHERICITY", "ELONGATION", "FLATNESS",
        "COMPACTNESS", "ASPECT_RATIO", "ROBUSTICITY", "CENTROID_OFFSET", "SYMMETRY",
        "PCA_RATIO", "WIDTH_LENGTH", "HEIGHT_LENGTH", "HEIGHT_WIDTH", "MEAN_CURVATURE",
        "GAUSSIAN_CURVATURE", "ROUGHNESS", "COMPLEXITY", "DENSITY", "ENTROPY",
        "CRANIAL_CAPACITY", "FACIAL_LENGTH", "SKULL_WIDTH_INDEX", "ORBITAL_INDEX",
        "NASAL_INDEX", "PALATAL_INDEX", "MANDIBULAR_ANGLE", "CRANIAL_BASE_ANGLE",
        "FORAMEN_MAGNUM_INDEX", "BROW_RIDGE", "ZYGOMATIC_WIDTH", "INTERORBITAL",
        "FACIAL_PROGNATHISM", "CRANIAL_VAULT", "POSTORBITAL", "OCCIPITAL_CONDYLE",
        "BASILAR_LENGTH", "NASION_PROSTHION", "BASION_NASION", "BASION_PROSTHION",
        "NASION_BASION_ANGLE", "NASION_SELLA_ANGLE", "SELLA_NASION_BASION",
        "MAXILLARY_PROTRUSION", "MANDIBULAR_LENGTH", "RAMUS_HEIGHT", "CORONOID_HEIGHT",
        "GONIAL_ANGLE", "BIGONIAL_WIDTH", "MENTAL_FORAMEN", "SYMPHYSEAL_HEIGHT",
        "SYMPHYSEAL_THICKNESS", "CORPUS_LENGTH", "CORPUS_HEIGHT", "CORPUS_THICKNESS",
        "ASCENDING_RAMUS", "CONDYLE_WIDTH", "MANDIBULAR_NOTCH"
    };
    return features;
}

std::string PhylogeneticFeatureExtractor::getFeatureDescription(const std::string& name) const {
    std::map<std::string, std::string> descriptions = {
        {"MAX_LENGTH", "Maximum length of specimen"},
        {"MAX_WIDTH", "Maximum width of specimen"},
        {"MAX_HEIGHT", "Maximum height of specimen"},
        {"DIAGONAL", "Bounding box diagonal length"},
        {"BBOX_VOLUME", "Bounding box volume"},
        {"CONVEX_VOLUME", "Convex hull volume"},
        {"SURFACE_AREA", "Surface area"},
        {"SPHERICITY", "Sphericity index"},
        {"ELONGATION", "Elongation index"},
        {"FLATNESS", "Flatness index"},
        {"COMPACTNESS", "Compactness index"},
        {"ASPECT_RATIO", "Length/width ratio"},
        {"ROBUSTICITY", "Robusticity index"},
        {"CENTROID_OFFSET", "Centroid offset from bbox center"},
        {"SYMMETRY", "Bilateral symmetry index"},
        {"PCA_RATIO", "Primary variance ratio"},
        {"WIDTH_LENGTH", "Width/Length ratio"},
        {"HEIGHT_LENGTH", "Height/Length ratio"},
        {"HEIGHT_WIDTH", "Height/Width ratio"},
        {"MEAN_CURVATURE", "Mean curvature"},
        {"GAUSSIAN_CURVATURE", "Gaussian curvature"},
        {"ROUGHNESS", "Surface roughness"},
        {"COMPLEXITY", "Morphological complexity"},
        {"DENSITY", "Point density"},
        {"ENTROPY", "Distribution entropy"},
        {"CRANIAL_CAPACITY", "Cranial capacity"},
        {"FACIAL_LENGTH", "Facial length"},
        {"SKULL_WIDTH_INDEX", "Skull width index"},
        {"ORBITAL_INDEX", "Orbital index"},
        {"NASAL_INDEX", "Nasal index"},
        {"PALATAL_INDEX", "Palatal index"},
        {"MANDIBULAR_ANGLE", "Mandibular angle"},
        {"CRANIAL_BASE_ANGLE", "Cranial base angle"},
        {"FORAMEN_MAGNUM_INDEX", "Foramen magnum index"},
        {"BROW_RIDGE", "Brow ridge projection"},
        {"ZYGOMATIC_WIDTH", "Zygomatic width"},
        {"INTERORBITAL", "Interorbital distance"},
        {"FACIAL_PROGNATHISM", "Facial prognathism"},
        {"CRANIAL_VAULT", "Cranial vault height"},
        {"POSTORBITAL", "Postorbital constriction"},
        {"OCCIPITAL_CONDYLE", "Occipital condyle width"},
        {"BASILAR_LENGTH", "Basilar length"},
        {"NASION_PROSTHION", "Nasion-prosthion length"},
        {"BASION_NASION", "Basion-nasion length"},
        {"BASION_PROSTHION", "Basion-prosthion length"},
        {"NASION_BASION_ANGLE", "Nasion-basion angle"},
        {"NASION_SELLA_ANGLE", "Nasion-sella angle"},
        {"SELLA_NASION_BASION", "Sella-nasion-basion angle"},
        {"MAXILLARY_PROTRUSION", "Maxillary protrusion"},
        {"MANDIBULAR_LENGTH", "Mandibular length"},
        {"RAMUS_HEIGHT", "Ramus height"},
        {"CORONOID_HEIGHT", "Coronoid height"},
        {"GONIAL_ANGLE", "Gonial angle"},
        {"BIGONIAL_WIDTH", "Bigonial width"},
        {"MENTAL_FORAMEN", "Mental foramen position"},
        {"SYMPHYSEAL_HEIGHT", "Symphyseal height"},
        {"SYMPHYSEAL_THICKNESS", "Symphyseal thickness"},
        {"CORPUS_LENGTH", "Corpus length"},
        {"CORPUS_HEIGHT", "Corpus height"},
        {"CORPUS_THICKNESS", "Corpus thickness"},
        {"ASCENDING_RAMUS", "Ascending ramus width"},
        {"CONDYLE_WIDTH", "Condyle width"},
        {"MANDIBULAR_NOTCH", "Mandibular notch depth"}
    };

    auto it = descriptions.find(name);
    if (it != descriptions.end()) return it->second;
    return "Unknown feature";
}

}
