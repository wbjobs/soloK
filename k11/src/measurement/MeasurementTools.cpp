#include "measurement/MeasurementTools.h"
#include <pcl/surface/convex_hull.h>
#include <pcl/common/centroid.h>
#include <pcl/common/pca.h>
#include <numeric>
#include <unordered_map>
#include <unordered_set>

namespace Fossil3D {

CurveMeasurement::CurveMeasurement()
    : m_searchRadius(0.02)
    , m_smoothingIterations(3) {
}

CurveMeasurement::~CurveMeasurement() {
}

void CurveMeasurement::setSearchRadius(double radius) {
    m_searchRadius = radius;
}

void CurveMeasurement::setSmoothingIterations(int iterations) {
    m_smoothingIterations = iterations;
}

MeasurementResult CurveMeasurement::measureLength(const std::vector<Eigen::Vector3d>& points,
                                                    const std::string& name) {
    MeasurementResult result;
    result.type = "Curve Length";
    result.name = name;
    result.unit = "mm";
    result.points = points;

    if (points.size() < 2) {
        result.value = 0.0;
        result.uncertainty = 0.0;
        return result;
    }

    double length = MathUtils::computeCurveLength(points);
    result.value = length * 1000.0;

    result.uncertainty = 0.001 * result.value + 0.1;

    Logger::info("Curve measurement: " + name + " = " + std::to_string(result.value) + " mm");
    return result;
}

MeasurementResult CurveMeasurement::measureAlongSurface(PointCloudXYZRGB::ConstPtr cloud,
                                                          const Eigen::Vector3d& start,
                                                          const Eigen::Vector3d& end,
                                                          const std::string& name) {
    std::vector<Eigen::Vector3d> path = samplePathOnSurface(cloud, start, end);
    return measureLength(path, name);
}

std::vector<Eigen::Vector3d> CurveMeasurement::samplePathOnSurface(PointCloudXYZRGB::ConstPtr cloud,
                                                                     const Eigen::Vector3d& start,
                                                                     const Eigen::Vector3d& end) {
    std::vector<Eigen::Vector3d> path;

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    Eigen::Vector3d direction = end - start;
    double totalDistance = direction.norm();
    int numSamples = static_cast<int>(totalDistance / m_searchRadius * 2) + 2;

    for (int i = 0; i <= numSamples; ++i) {
        double t = static_cast<double>(i) / numSamples;
        Eigen::Vector3d samplePt = start + t * direction;

        pcl::PointXYZRGB searchPt;
        searchPt.x = samplePt.x();
        searchPt.y = samplePt.y();
        searchPt.z = samplePt.z();

        std::vector<int> indices(10);
        std::vector<float> distances(10);

        if (tree->nearestKSearch(searchPt, 10, indices, distances) > 0) {
            Eigen::Vector3d centroid(0, 0, 0);
            int count = 0;
            for (size_t j = 0; j < indices.size(); ++j) {
                if (std::sqrt(distances[j]) < m_searchRadius * 2) {
                    const auto& pt = cloud->points[indices[j]];
                    centroid += Eigen::Vector3d(pt.x, pt.y, pt.z);
                    count++;
                }
            }
            if (count > 0) {
                centroid /= count;
                path.push_back(centroid);
            } else {
                path.push_back(samplePt);
            }
        } else {
            path.push_back(samplePt);
        }
    }

    for (int iter = 0; iter < m_smoothingIterations; ++iter) {
        std::vector<Eigen::Vector3d> smoothed = path;
        for (size_t i = 1; i < path.size() - 1; ++i) {
            smoothed[i] = (path[i-1] + 2 * path[i] + path[i+1]) / 4.0;
        }
        path = smoothed;
    }

    return path;
}

AngleMeasurement::AngleMeasurement() {
}

AngleMeasurement::~AngleMeasurement() {
}

MeasurementResult AngleMeasurement::measureThreePointAngle(const Eigen::Vector3d& p1,
                                                              const Eigen::Vector3d& vertex,
                                                              const Eigen::Vector3d& p2,
                                                              const std::string& name) {
    MeasurementResult result;
    result.type = "Angle";
    result.name = name;
    result.unit = "deg";
    result.points = {p1, vertex, p2};

    Eigen::Vector3d v1 = p1 - vertex;
    Eigen::Vector3d v2 = p2 - vertex;

    double angleRad = MathUtils::computeAngle(v1, v2);
    result.value = MathUtils::rad2deg(angleRad);
    result.uncertainty = 0.5;

    Logger::info("Angle measurement: " + name + " = " + std::to_string(result.value) + " deg");
    return result;
}

MeasurementResult AngleMeasurement::measureTwoLineAngle(const Eigen::Vector3d& line1Start,
                                                          const Eigen::Vector3d& line1End,
                                                          const Eigen::Vector3d& line2Start,
                                                          const Eigen::Vector3d& line2End,
                                                          const std::string& name) {
    Eigen::Vector3d v1 = line1End - line1Start;
    Eigen::Vector3d v2 = line2End - line2Start;

    MeasurementResult result;
    result.type = "Angle";
    result.name = name;
    result.unit = "deg";
    result.points = {line1Start, line1End, line2Start, line2End};

    double angleRad = MathUtils::computeAngle(v1, v2);
    result.value = MathUtils::rad2deg(angleRad);
    result.uncertainty = 0.5;

    Logger::info("Line angle measurement: " + name + " = " + std::to_string(result.value) + " deg");
    return result;
}

MeasurementResult AngleMeasurement::measureSurfaceAngle(PointCloudXYZRGB::ConstPtr cloud,
                                                         const Eigen::Vector3d& p1,
                                                         const Eigen::Vector3d& p2,
                                                         const Eigen::Vector3d& p3,
                                                         const std::string& name) {
    Eigen::Vector3d n1 = estimateSurfaceNormal(cloud, p1);
    Eigen::Vector3d n2 = estimateSurfaceNormal(cloud, p2);
    Eigen::Vector3d n3 = estimateSurfaceNormal(cloud, p3);

    Eigen::Vector3d centroid = (n1 + n2 + n3) / 3.0;

    Eigen::Vector3d v1 = (p1 - p2).normalized();
    Eigen::Vector3d v2 = (p3 - p2).normalized();

    return measureThreePointAngle(p1, p2, p3, name);
}

Eigen::Vector3d AngleMeasurement::estimateSurfaceNormal(PointCloudXYZRGB::ConstPtr cloud,
                                                         const Eigen::Vector3d& point,
                                                         double radius) {
    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    pcl::PointXYZRGB searchPt;
    searchPt.x = point.x();
    searchPt.y = point.y();
    searchPt.z = point.z();

    std::vector<int> indices;
    std::vector<float> distances;

    if (tree->radiusSearch(searchPt, radius, indices, distances) < 3) {
        tree->nearestKSearch(searchPt, 10, indices, distances);
    }

    Eigen::Vector4f centroid;
    pcl::compute3DCentroid(*cloud, indices, centroid);

    Eigen::Matrix3f covariance;
    pcl::computeCovarianceMatrix(*cloud, indices, centroid, covariance);

    Eigen::SelfAdjointEigenSolver<Eigen::Matrix3f> solver(covariance);
    Eigen::Vector3f normal = solver.eigenvectors().col(0);

    return Eigen::Vector3d(normal.x(), normal.y(), normal.z()).normalized();
}

VolumeMeasurement::VolumeMeasurement()
    : m_resolution(0.001)
    , m_voxelResolution(0.0005)
    , m_minHoleSize(3)
    , m_centerOfMass(0, 0, 0)
    , m_isWatertight(false)
    , m_holeCount(0) {
}

VolumeMeasurement::~VolumeMeasurement() {
}

void VolumeMeasurement::setResolution(double resolution) {
    m_resolution = resolution;
}

void VolumeMeasurement::setVoxelResolution(double resolution) {
    m_voxelResolution = resolution;
}

void VolumeMeasurement::setMinHoleSize(int edgeCount) {
    m_minHoleSize = edgeCount;
}

Eigen::Vector3d VolumeMeasurement::computeFaceNormal(const Eigen::Vector3d& p0,
                                                       const Eigen::Vector3d& p1,
                                                       const Eigen::Vector3d& p2) {
    Eigen::Vector3d e1 = p1 - p0;
    Eigen::Vector3d e2 = p2 - p0;
    return e1.cross(e2).normalized();
}

bool VolumeMeasurement::isWatertight(pcl::PolygonMesh::ConstPtr mesh) {
    PointCloudXYZ::Ptr vertices(new PointCloudXYZ);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    std::unordered_map<EdgeKey, int, EdgeKeyHash> edgeCount;

    for (const auto& polygon : mesh->polygons) {
        if (polygon.vertices.size() < 3) continue;
        for (size_t i = 0; i < polygon.vertices.size(); ++i) {
            int a = polygon.vertices[i];
            int b = polygon.vertices[(i + 1) % polygon.vertices.size()];
            EdgeKey key(a, b);
            edgeCount[key]++;
        }
    }

    int boundaryEdges = 0;
    for (const auto& pair : edgeCount) {
        if (pair.second == 1) boundaryEdges++;
        else if (pair.second > 2) return false;
    }

    return boundaryEdges == 0;
}

int VolumeMeasurement::countHoles(pcl::PolygonMesh::ConstPtr mesh) {
    PointCloudXYZ::Ptr vertices(new PointCloudXYZ);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    std::unordered_map<EdgeKey, int, EdgeKeyHash> edgeCount;
    std::unordered_map<EdgeKey, std::vector<int>, EdgeKeyHash> edgeFaces;

    for (size_t fi = 0; fi < mesh->polygons.size(); ++fi) {
        const auto& polygon = mesh->polygons[fi];
        if (polygon.vertices.size() < 3) continue;
        for (size_t i = 0; i < polygon.vertices.size(); ++i) {
            int a = polygon.vertices[i];
            int b = polygon.vertices[(i + 1) % polygon.vertices.size()];
            EdgeKey key(a, b);
            edgeCount[key]++;
            edgeFaces[key].push_back(static_cast<int>(fi));
        }
    }

    std::unordered_map<int, std::vector<int>> adjacency;
    for (const auto& pair : edgeCount) {
        if (pair.second == 1) {
            adjacency[pair.first.a].push_back(pair.first.b);
            adjacency[pair.first.b].push_back(pair.first.a);
        }
    }

    std::unordered_set<int> visited;
    int holeCount = 0;
    for (const auto& pair : adjacency) {
        if (visited.count(pair.first)) continue;

        std::vector<int> cycle;
        std::vector<int> stack;
        stack.push_back(pair.first);

        while (!stack.empty()) {
            int curr = stack.back();
            stack.pop_back();
            if (visited.count(curr)) continue;
            visited.insert(curr);
            cycle.push_back(curr);

            for (int neighbor : adjacency[curr]) {
                if (!visited.count(neighbor)) {
                    stack.push_back(neighbor);
                }
            }
        }

        if (cycle.size() >= static_cast<size_t>(m_minHoleSize)) {
            holeCount++;
        }
    }

    return holeCount;
}

bool VolumeMeasurement::checkFaceOrientation(pcl::PolygonMesh::ConstPtr mesh) {
    PointCloudXYZ::Ptr vertices(new PointCloudXYZ);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    if (mesh->polygons.empty()) return true;

    const auto& face0 = mesh->polygons[0];
    if (face0.vertices.size() < 3) return true;

    Eigen::Vector3d p0(vertices->points[face0.vertices[0]].x,
                       vertices->points[face0.vertices[0]].y,
                       vertices->points[face0.vertices[0]].z);
    Eigen::Vector3d p1(vertices->points[face0.vertices[1]].x,
                       vertices->points[face0.vertices[1]].y,
                       vertices->points[face0.vertices[1]].z);
    Eigen::Vector3d p2(vertices->points[face0.vertices[2]].x,
                       vertices->points[face0.vertices[2]].y,
                       vertices->points[face0.vertices[2]].z);

    Eigen::Vector3d refNormal = computeFaceNormal(p0, p1, p2);

    Eigen::Vector3d centroid(0, 0, 0);
    for (const auto& pt : vertices->points) {
        centroid += Eigen::Vector3d(pt.x, pt.y, pt.z);
    }
    centroid /= vertices->size();

    if (refNormal.dot(centroid - p0) > 0) {
        return false;
    }

    for (const auto& polygon : mesh->polygons) {
        if (polygon.vertices.size() < 3) continue;

        Eigen::Vector3d f0(vertices->points[polygon.vertices[0]].x,
                           vertices->points[polygon.vertices[0]].y,
                           vertices->points[polygon.vertices[0]].z);
        Eigen::Vector3d f1(vertices->points[polygon.vertices[1]].x,
                           vertices->points[polygon.vertices[1]].y,
                           vertices->points[polygon.vertices[1]].z);
        Eigen::Vector3d f2(vertices->points[polygon.vertices[2]].x,
                           vertices->points[polygon.vertices[2]].y,
                           vertices->points[polygon.vertices[2]].z);

        Eigen::Vector3d normal = computeFaceNormal(f0, f1, f2);
        if (normal.dot(refNormal) < 0) {
            return false;
        }
    }

    return true;
}

void VolumeMeasurement::fixFaceOrientation(pcl::PolygonMesh::Ptr mesh) {
    PointCloudXYZ::Ptr vertices(new PointCloudXYZ);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    if (mesh->polygons.empty()) return;

    Eigen::Vector3d centroid(0, 0, 0);
    for (const auto& pt : vertices->points) {
        centroid += Eigen::Vector3d(pt.x, pt.y, pt.z);
    }
    centroid /= vertices->size();

    const auto& face0 = mesh->polygons[0];
    if (face0.vertices.size() < 3) return;

    Eigen::Vector3d p0(vertices->points[face0.vertices[0]].x,
                       vertices->points[face0.vertices[0]].y,
                       vertices->points[face0.vertices[0]].z);
    Eigen::Vector3d p1(vertices->points[face0.vertices[1]].x,
                       vertices->points[face0.vertices[1]].y,
                       vertices->points[face0.vertices[1]].z);
    Eigen::Vector3d p2(vertices->points[face0.vertices[2]].x,
                       vertices->points[face0.vertices[2]].y,
                       vertices->points[face0.vertices[2]].z);

    Eigen::Vector3d normal = computeFaceNormal(p0, p1, p2);

    bool needsFlip = (normal.dot(centroid - p0) > 0);

    if (needsFlip) {
        for (auto& polygon : mesh->polygons) {
            if (polygon.vertices.size() >= 2) {
                std::reverse(polygon.vertices.begin(), polygon.vertices.end());
            }
        }
    }
}

double VolumeMeasurement::computeSignedVolumeWatertight(pcl::PolygonMesh::ConstPtr mesh) {
    PointCloudXYZ::Ptr vertices(new PointCloudXYZ);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    Eigen::Vector3d centroid(0, 0, 0);
    for (const auto& pt : vertices->points) {
        centroid += Eigen::Vector3d(pt.x, pt.y, pt.z);
    }
    if (!vertices->empty()) {
        centroid /= vertices->size();
    }

    m_centerOfMass = centroid;

    double totalVolume = 0.0;

    for (const auto& polygon : mesh->polygons) {
        if (polygon.vertices.size() >= 3) {
            Eigen::Vector3d p0(vertices->points[polygon.vertices[0]].x,
                               vertices->points[polygon.vertices[0]].y,
                               vertices->points[polygon.vertices[0]].z);
            Eigen::Vector3d p1(vertices->points[polygon.vertices[1]].x,
                               vertices->points[polygon.vertices[1]].y,
                               vertices->points[polygon.vertices[1]].z);
            Eigen::Vector3d p2(vertices->points[polygon.vertices[2]].x,
                               vertices->points[polygon.vertices[2]].y,
                               vertices->points[polygon.vertices[2]].z);

            double vol = computeTetrahedronVolume(centroid, p0, p1, p2);
            totalVolume += vol;
        }
    }

    return totalVolume;
}

double VolumeMeasurement::computeVoxelVolume(pcl::PolygonMesh::ConstPtr mesh) {
    PointCloudXYZ::Ptr vertices(new PointCloudXYZ);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    if (vertices->empty()) return 0.0;

    Eigen::Vector3d minPt(1e10, 1e10, 1e10);
    Eigen::Vector3d maxPt(-1e10, -1e10, -1e10);
    for (const auto& pt : vertices->points) {
        minPt[0] = std::min(minPt[0], pt.x);
        minPt[1] = std::min(minPt[1], pt.y);
        minPt[2] = std::min(minPt[2], pt.z);
        maxPt[0] = std::max(maxPt[0], pt.x);
        maxPt[1] = std::max(maxPt[1], pt.y);
        maxPt[2] = std::max(maxPt[2], pt.z);
    }

    int nx = static_cast<int>((maxPt[0] - minPt[0]) / m_voxelResolution) + 1;
    int ny = static_cast<int>((maxPt[1] - minPt[1]) / m_voxelResolution) + 1;
    int nz = static_cast<int>((maxPt[2] - minPt[2]) / m_voxelResolution) + 1;

    if (nx <= 0 || ny <= 0 || nz <= 0) return 0.0;

    if (nx > 512 || ny > 512 || nz > 512) {
        double oldRes = m_voxelResolution;
        m_voxelResolution = std::max({(maxPt[0] - minPt[0]) / 512.0,
                                      (maxPt[1] - minPt[1]) / 512.0,
                                      (maxPt[2] - minPt[2]) / 512.0});
        nx = static_cast<int>((maxPt[0] - minPt[0]) / m_voxelResolution) + 1;
        ny = static_cast<int>((maxPt[1] - minPt[1]) / m_voxelResolution) + 1;
        nz = static_cast<int>((maxPt[2] - minPt[2]) / m_voxelResolution) + 1;
        m_voxelResolution = oldRes;
    }

    nx = std::min(nx, 512);
    ny = std::min(ny, 512);
    nz = std::min(nz, 512);

    std::vector<std::vector<std::vector<bool>>> voxelGrid(
        nx, std::vector<std::vector<bool>>(ny, std::vector<bool>(nz, false)));

    for (const auto& polygon : mesh->polygons) {
        if (polygon.vertices.size() < 3) continue;

        Eigen::Vector3d p0(vertices->points[polygon.vertices[0]].x,
                           vertices->points[polygon.vertices[0]].y,
                           vertices->points[polygon.vertices[0]].z);
        Eigen::Vector3d p1(vertices->points[polygon.vertices[1]].x,
                           vertices->points[polygon.vertices[1]].y,
                           vertices->points[polygon.vertices[1]].z);
        Eigen::Vector3d p2(vertices->points[polygon.vertices[2]].x,
                           vertices->points[polygon.vertices[2]].y,
                           vertices->points[polygon.vertices[2]].z);

        Eigen::Vector3d faceMin = p0.cwiseMin(p1).cwiseMin(p2);
        Eigen::Vector3d faceMax = p0.cwiseMax(p1).cwiseMax(p2);

        int ixMin = std::max(0, static_cast<int>((faceMin[0] - minPt[0]) / m_voxelResolution));
        int ixMax = std::min(nx - 1, static_cast<int>((faceMax[0] - minPt[0]) / m_voxelResolution));
        int iyMin = std::max(0, static_cast<int>((faceMin[1] - minPt[1]) / m_voxelResolution));
        int iyMax = std::min(ny - 1, static_cast<int>((faceMax[1] - minPt[1]) / m_voxelResolution));
        int izMin = std::max(0, static_cast<int>((faceMin[2] - minPt[2]) / m_voxelResolution));
        int izMax = std::min(nz - 1, static_cast<int>((faceMax[2] - minPt[2]) / m_voxelResolution));

        for (int ix = ixMin; ix <= ixMax; ++ix) {
            for (int iy = iyMin; iy <= iyMax; ++iy) {
                for (int iz = izMin; iz <= izMax; ++iz) {
                    Eigen::Vector3d voxelCenter(
                        minPt[0] + (ix + 0.5) * m_voxelResolution,
                        minPt[1] + (iy + 0.5) * m_voxelResolution,
                        minPt[2] + (iz + 0.5) * m_voxelResolution);

                    Eigen::Vector3d edge0 = p1 - p0;
                    Eigen::Vector3d edge1 = p2 - p0;
                    Eigen::Vector3d diff = voxelCenter - p0;

                    double a = edge0.dot(edge0);
                    double b = edge0.dot(edge1);
                    double c = edge1.dot(edge1);
                    double d = edge0.dot(diff);
                    double e = edge1.dot(diff);

                    double denom = a * c - b * b;
                    if (std::abs(denom) < 1e-15) continue;

                    double beta = (c * d - b * e) / denom;
                    double gamma = (a * e - b * d) / denom;

                    if (beta >= 0 && gamma >= 0 && beta + gamma <= 1.0) {
                        voxelGrid[ix][iy][iz] = true;
                    }
                }
            }
        }
    }

    for (int ix = 0; ix < nx; ++ix) {
        for (int iy = 0; iy < ny; ++iy) {
            bool filled = false;
            for (int iz = 0; iz < nz; ++iz) {
                if (voxelGrid[ix][iy][iz]) filled = !filled;
                else if (filled) voxelGrid[ix][iy][iz] = true;
            }
        }
    }

    size_t filledCount = 0;
    for (int ix = 0; ix < nx; ++ix) {
        for (int iy = 0; iy < ny; ++iy) {
            for (int iz = 0; iz < nz; ++iz) {
                if (voxelGrid[ix][iy][iz]) filledCount++;
            }
        }
    }

    double voxelVolume = m_voxelResolution * m_voxelResolution * m_voxelResolution;
    return filledCount * voxelVolume;
}

MeasurementResult VolumeMeasurement::measureMeshVolume(pcl::PolygonMesh::ConstPtr mesh,
                                                         const std::string& name) {
    MeasurementResult result;
    result.type = "Volume";
    result.name = name;
    result.unit = "cm³";

    m_isWatertight = isWatertight(mesh);
    m_holeCount = countHoles(mesh);

    if (m_isWatertight) {
        Logger::info("Mesh is watertight, using signed volume method");
        double volume = computeSignedVolumeWatertight(mesh);
        result.value = std::abs(volume) * 1e6;
        result.uncertainty = 0.01 * result.value;
    } else {
        Logger::warning("Mesh is NOT watertight (detected " + 
                        std::to_string(m_holeCount) + 
                        " holes), using voxel-based volume estimation");
        
        pcl::PolygonMesh::Ptr meshCopy(new pcl::PolygonMesh(*mesh));
        fixFaceOrientation(meshCopy);
        
        double volume = computeVoxelVolume(meshCopy);
        result.value = volume * 1e6;
        result.uncertainty = 0.03 * result.value;

        std::string methodNote = " (voxel-based, non-watertight mesh, " + 
                                 std::to_string(m_holeCount) + " holes detected)";
        result.name += methodNote;
    }

    Logger::info("Volume measurement: " + name + " = " + std::to_string(result.value) + " cm³");
    return result;
}

MeasurementResult VolumeMeasurement::measurePointCloudVolume(PointCloudXYZRGB::ConstPtr cloud,
                                                               const std::string& name) {
    double volume = computeConvexHullVolume(cloud);

    MeasurementResult result;
    result.type = "Volume";
    result.name = name;
    result.unit = "cm³";
    result.value = volume * 1e6;
    result.uncertainty = 0.02 * result.value;

    Logger::info("Point cloud volume (convex hull): " + name + " = " + 
                 std::to_string(result.value) + " cm³");
    return result;
}

double VolumeMeasurement::computeConvexHullVolume(PointCloudXYZRGB::ConstPtr cloud) {
    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);

    pcl::ConvexHull<pcl::PointXYZ> convexHull;
    convexHull.setInputCloud(xyzCloud);
    convexHull.setComputeAreaVolume(true);

    pcl::PolygonMesh::Ptr hullMesh(new pcl::PolygonMesh);
    convexHull.reconstruct(*hullMesh);

    PointCloudXYZ::Ptr hullPoints(new PointCloudXYZ);
    pcl::fromPCLPointCloud2(hullMesh->cloud, *hullPoints);

    Eigen::Vector3d centroid(0, 0, 0);
    for (const auto& pt : hullPoints->points) {
        centroid += Eigen::Vector3d(pt.x, pt.y, pt.z);
    }
    if (!hullPoints->empty()) {
        centroid /= hullPoints->size();
    }

    double totalVolume = 0.0;

    for (const auto& polygon : hullMesh->polygons) {
        if (polygon.vertices.size() >= 3) {
            const auto& v0 = hullPoints->points[polygon.vertices[0]];
            const auto& v1 = hullPoints->points[polygon.vertices[1]];
            const auto& v2 = hullPoints->points[polygon.vertices[2]];

            Eigen::Vector3d p0(v0.x, v0.y, v0.z);
            Eigen::Vector3d p1(v1.x, v1.y, v1.z);
            Eigen::Vector3d p2(v2.x, v2.y, v2.z);

            totalVolume += computeTetrahedronVolume(centroid, p0, p1, p2);
        }
    }

    return std::abs(totalVolume);
}

double VolumeMeasurement::computeTetrahedronVolume(const Eigen::Vector3d& a,
                                                     const Eigen::Vector3d& b,
                                                     const Eigen::Vector3d& c,
                                                     const Eigen::Vector3d& d) {
    Eigen::Vector3d v0 = b - a;
    Eigen::Vector3d v1 = c - a;
    Eigen::Vector3d v2 = d - a;

    return v0.dot(v1.cross(v2)) / 6.0;
}

SymmetryAnalyzer::SymmetryAnalyzer()
    : m_symmetryAxis(0, 1, 0)
    , m_symmetryCenter(0, 0, 0) {
}

SymmetryAnalyzer::~SymmetryAnalyzer() {
}

void SymmetryAnalyzer::setSymmetryAxis(const Eigen::Vector3d& axis) {
    m_symmetryAxis = axis.normalized();
}

void SymmetryAnalyzer::autoDetectSymmetryAxis(PointCloudXYZRGB::ConstPtr cloud) {
    Logger::info("Auto-detecting symmetry axis using PCA...");

    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);

    pcl::PCA<pcl::PointXYZ> pca;
    pca.setInputCloud(xyzCloud);

    Eigen::Matrix3f eigenVectors = pca.getEigenVectors();
    
    m_symmetryAxis = Eigen::Vector3d(
        eigenVectors(0, 1),
        eigenVectors(1, 1),
        eigenVectors(2, 1)
    ).normalized();

    Eigen::Vector4f centroid;
    pcl::compute3DCentroid(*cloud, centroid);
    m_symmetryCenter = Eigen::Vector3d(centroid[0], centroid[1], centroid[2]);

    Logger::info("Symmetry axis: (" + std::to_string(m_symmetryAxis.x()) + ", " +
                 std::to_string(m_symmetryAxis.y()) + ", " + 
                 std::to_string(m_symmetryAxis.z()) + ")");
}

SymmetryResult SymmetryAnalyzer::analyzeSymmetry(PointCloudXYZRGB::ConstPtr cloud,
                                                   const std::string& name) {
    Logger::info("Analyzing symmetry...");
    Timer timer;

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(cloud);

    std::vector<double> deviations(cloud->size());
    double sumDev = 0.0;
    double sumSqDev = 0.0;
    double maxDev = 0.0;

    for (size_t i = 0; i < cloud->size(); ++i) {
        const auto& pt = cloud->points[i];
        Eigen::Vector3d point(pt.x, pt.y, pt.z);
        Eigen::Vector3d mirrored = mirrorPoint(point);

        pcl::PointXYZRGB searchPt;
        searchPt.x = mirrored.x();
        searchPt.y = mirrored.y();
        searchPt.z = mirrored.z();

        std::vector<int> indices(5);
        std::vector<float> distances(5);

        if (tree->nearestKSearch(searchPt, 5, indices, distances) > 0) {
            double avgDist = 0.0;
            int count = 0;
            for (size_t j = 0; j < indices.size(); ++j) {
                avgDist += std::sqrt(distances[j]);
                count++;
            }
            avgDist /= count;

            deviations[i] = avgDist;
            sumDev += avgDist;
            sumSqDev += avgDist * avgDist;
            maxDev = std::max(maxDev, avgDist);
        } else {
            deviations[i] = -1;
        }
    }

    SymmetryResult result;
    result.deviations = deviations;
    
    int validCount = 0;
    for (double d : deviations) {
        if (d >= 0) validCount++;
    }

    if (validCount > 0) {
        result.meanDeviation = sumDev / validCount;
        result.rmse = std::sqrt(sumSqDev / validCount);
    }
    result.maxDeviation = maxDev;
    result.heatmapCloud = generateHeatmapCloud(cloud, deviations);

    Logger::info("Symmetry analysis completed in " + timer.elapsedString());
    Logger::info("Mean deviation: " + std::to_string(result.meanDeviation * 1000) + " mm");
    Logger::info("Max deviation: " + std::to_string(result.maxDeviation * 1000) + " mm");
    Logger::info("RMSE: " + std::to_string(result.rmse * 1000) + " mm");

    return result;
}

Eigen::Vector3d SymmetryAnalyzer::mirrorPoint(const Eigen::Vector3d& point) {
    Eigen::Vector3d rel = point - m_symmetryCenter;
    double proj = rel.dot(m_symmetryAxis);
    Eigen::Vector3d projVec = proj * m_symmetryAxis;
    Eigen::Vector3d perp = rel - projVec;
    Eigen::Vector3d mirroredRel = rel - 2 * perp;
    return m_symmetryCenter + mirroredRel;
}

PointCloudXYZRGB::Ptr SymmetryAnalyzer::generateHeatmapCloud(PointCloudXYZRGB::ConstPtr cloud,
                                                               const std::vector<double>& deviations) {
    PointCloudXYZRGB::Ptr heatmap(new PointCloudXYZRGB(*cloud));

    double maxDev = 0.0;
    for (double d : deviations) {
        if (d > 0) maxDev = std::max(maxDev, d);
    }

    for (size_t i = 0; i < deviations.size() && i < heatmap->size(); ++i) {
        if (deviations[i] >= 0) {
            uint8_t r, g, b;
            colorCodeDeviation(deviations[i], maxDev, r, g, b);
            heatmap->points[i].r = r;
            heatmap->points[i].g = g;
            heatmap->points[i].b = b;
        }
    }

    return heatmap;
}

void SymmetryAnalyzer::colorCodeDeviation(double deviation, double maxDev,
                                            uint8_t& r, uint8_t& g, uint8_t& b) {
    if (maxDev < 1e-10) {
        r = g = b = 0;
        return;
    }

    double normalized = deviation / maxDev;
    
    if (normalized < 0.25) {
        double t = normalized / 0.25;
        r = 0;
        g = static_cast<uint8_t>(255 * t);
        b = 255;
    } else if (normalized < 0.5) {
        double t = (normalized - 0.25) / 0.25;
        r = 0;
        g = 255;
        b = static_cast<uint8_t>(255 * (1 - t));
    } else if (normalized < 0.75) {
        double t = (normalized - 0.5) / 0.25;
        r = static_cast<uint8_t>(255 * t);
        g = 255;
        b = 0;
    } else {
        double t = (normalized - 0.75) / 0.25;
        r = 255;
        g = static_cast<uint8_t>(255 * (1 - t));
        b = 0;
    }
}

}
