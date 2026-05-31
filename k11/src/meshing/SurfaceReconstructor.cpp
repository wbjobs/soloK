#include "meshing/SurfaceReconstructor.h"
#include <pcl/io/ply_io.h>
#include <pcl/io/obj_io.h>
#include <pcl/common/transforms.h>
#include <pcl/features/fpfh.h>

namespace Fossil3D {

SurfaceReconstructor::SurfaceReconstructor()
    : m_poissonDepth(8)
    , m_poissonSamplesPerNode(15)
    , m_gp3Radius(0.05)
    , m_gp3Mu(2.5)
    , m_maxNearestNeighbors(100) {
}

SurfaceReconstructor::~SurfaceReconstructor() {
}

void SurfaceReconstructor::setPoissonDepth(int depth) {
    m_poissonDepth = depth;
}

void SurfaceReconstructor::setPoissonSamplesPerNode(int samples) {
    m_poissonSamplesPerNode = samples;
}

void SurfaceReconstructor::setGP3Radius(double radius) {
    m_gp3Radius = radius;
}

void SurfaceReconstructor::setGP3Mu(double mu) {
    m_gp3Mu = mu;
}

void SurfaceReconstructor::setMaxNearestNeighbors(int nn) {
    m_maxNearestNeighbors = nn;
}

pcl::PolygonMesh::Ptr SurfaceReconstructor::poissonReconstruction(PointCloudXYZRGB::ConstPtr cloud,
                                                                     PointCloudNormal::ConstPtr normals) {
    Logger::info("Poisson surface reconstruction (depth: " + std::to_string(m_poissonDepth) + ")...");
    Timer timer;

    if (!normals || normals->empty()) {
        Logger::warning("No normals provided, estimating normals...");
        PointCloudFilter filter;
        normals = filter.estimateNormals(cloud);
    }

    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);

    pcl::PointCloud<pcl::PointNormal>::Ptr cloudWithNormals(new pcl::PointCloud<pcl::PointNormal>);
    pcl::concatenateFields(*xyzCloud, *normals, *cloudWithNormals);

    pcl::Poisson<pcl::PointNormal> poisson;
    poisson.setDepth(m_poissonDepth);
    poisson.setInputCloud(cloudWithNormals);
    poisson.setSamplesPerNode(m_poissonSamplesPerNode);

    pcl::PolygonMesh::Ptr mesh(new pcl::PolygonMesh);
    poisson.reconstruct(*mesh);

    Logger::info("Poisson reconstruction completed in " + timer.elapsedString());
    Logger::info("Mesh has " + std::to_string(mesh->cloud.width * mesh->cloud.height) + 
                 " vertices and " + std::to_string(mesh->polygons.size()) + " faces");

    return mesh;
}

pcl::PolygonMesh::Ptr SurfaceReconstructor::greedyProjectionReconstruction(PointCloudXYZRGB::ConstPtr cloud,
                                                                              PointCloudNormal::ConstPtr normals) {
    Logger::info("Greedy projection triangulation...");
    Timer timer;

    if (!normals || normals->empty()) {
        Logger::warning("No normals provided, estimating normals...");
        PointCloudFilter filter;
        normals = filter.estimateNormals(cloud);
    }

    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);

    pcl::PointCloud<pcl::PointNormal>::Ptr cloudWithNormals(new pcl::PointCloud<pcl::PointNormal>);
    pcl::concatenateFields(*xyzCloud, *normals, *cloudWithNormals);

    pcl::search::KdTree<pcl::PointNormal>::Ptr tree(new pcl::search::KdTree<pcl::PointNormal>);
    tree->setInputCloud(cloudWithNormals);

    pcl::GreedyProjectionTriangulation<pcl::PointNormal> gp3;
    pcl::PolygonMesh::Ptr mesh(new pcl::PolygonMesh);

    gp3.setSearchRadius(m_gp3Radius);
    gp3.setMu(m_gp3Mu);
    gp3.setMaximumNearestNeighbors(m_maxNearestNeighbors);
    gp3.setMaximumSurfaceAngle(M_PI / 4);
    gp3.setMinimumAngle(M_PI / 18);
    gp3.setMaximumAngle(2 * M_PI / 3);
    gp3.setNormalConsistency(true);

    gp3.setInputCloud(cloudWithNormals);
    gp3.setSearchMethod(tree);
    gp3.reconstruct(*mesh);

    Logger::info("Greedy projection completed in " + timer.elapsedString());
    Logger::info("Mesh has " + std::to_string(mesh->cloud.width * mesh->cloud.height) + 
                 " vertices and " + std::to_string(mesh->polygons.size()) + " faces");

    return mesh;
}

pcl::PolygonMesh::Ptr SurfaceReconstructor::reconstruct(PointCloudData& cloudData,
                                                          const std::string& method) {
    if (!cloudData.cloud || cloudData.cloud->empty()) {
        Logger::error("Input point cloud is empty");
        return nullptr;
    }

    if (method == "poisson") {
        return poissonReconstruction(cloudData.cloud, cloudData.normals);
    } else if (method == "gp3") {
        return greedyProjectionReconstruction(cloudData.cloud, cloudData.normals);
    } else {
        Logger::error("Unknown reconstruction method: " + method);
        return nullptr;
    }
}

pcl::PolygonMesh::Ptr SurfaceReconstructor::simplifyMesh(pcl::PolygonMesh::ConstPtr mesh,
                                                           int targetVertices) {
    Logger::info("Simplifying mesh to " + std::to_string(targetVertices) + " vertices...");
    Timer timer;

    pcl::PolygonMesh::Ptr simplified(new pcl::PolygonMesh(*mesh));

    pcl::MeshSimplification<pcl::PolygonMesh> simplifier;
    simplifier.setInputMesh(mesh);
    simplifier.setTargetVertices(targetVertices);
    simplifier.process(*simplified);

    Logger::info("Mesh simplification completed in " + timer.elapsedString());
    return simplified;
}

pcl::PolygonMesh::Ptr SurfaceReconstructor::smoothMesh(pcl::PolygonMesh::ConstPtr mesh,
                                                         int iterations) {
    Logger::info("Smoothing mesh with " + std::to_string(iterations) + " iterations...");
    Timer timer;

    pcl::PolygonMesh::Ptr smoothed(new pcl::PolygonMesh(*mesh));
    pcl::MeshSmoothing<pcl::PolygonMesh> smoother;
    smoother.setInputMesh(mesh);
    smoother.setNumIterations(iterations);
    smoother.process(*smoothed);

    Logger::info("Mesh smoothing completed in " + timer.elapsedString());
    return smoothed;
}

pcl::PolygonMesh::Ptr SurfaceReconstructor::cleanMesh(pcl::PolygonMesh::ConstPtr mesh) {
    Logger::info("Cleaning mesh...");
    Timer timer;

    pcl::PolygonMesh::Ptr cleaned(new pcl::PolygonMesh(*mesh));
    pcl::MeshCleaning<pcl::PolygonMesh> cleaner;
    cleaner.setInputMesh(mesh);
    cleaner.process(*cleaned);

    Logger::info("Mesh cleaning completed in " + timer.elapsedString());
    return cleaned;
}

TextureMapper::TextureMapper()
    : m_textureWidth(2048)
    , m_textureHeight(2048)
    , m_uvPadding(2) {
}

TextureMapper::~TextureMapper() {
}

void TextureMapper::setTextureResolution(int width, int height) {
    m_textureWidth = width;
    m_textureHeight = height;
}

void TextureMapper::setUVPadding(int padding) {
    m_uvPadding = padding;
}

bool TextureMapper::generateTextureCoordinates(pcl::PolygonMesh::Ptr mesh,
                                                 PointCloudXYZRGB::ConstPtr coloredCloud) {
    Logger::info("Generating texture coordinates...");
    Timer timer;

    pcl::PointCloud<pcl::PointUV>::Ptr uvCloud(new pcl::PointCloud<pcl::PointUV>);
    
    pcl::PointCloud<pcl::PointXYZ>::Ptr meshCloud(new pcl::PointCloud<pcl::PointXYZ>);
    pcl::fromPCLPointCloud2(mesh->cloud, *meshCloud);

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(coloredCloud);

    uvCloud->resize(meshCloud->size());
    
    double minX = 1e10, maxX = -1e10;
    double minY = 1e10, maxY = -1e10;
    std::vector<double> projX(meshCloud->size()), projY(meshCloud->size());

    for (size_t i = 0; i < meshCloud->size(); ++i) {
        pcl::PointXYZRGB searchPoint;
        searchPoint.x = meshCloud->points[i].x;
        searchPoint.y = meshCloud->points[i].y;
        searchPoint.z = meshCloud->points[i].z;

        std::vector<int> indices(1);
        std::vector<float> distances(1);
        
        if (tree->nearestKSearch(searchPoint, 1, indices, distances) > 0) {
            const auto& pt = coloredCloud->points[indices[0]];
            
            Eigen::Vector3f normal = Eigen::Vector3f(pt.x, pt.y, pt.z).normalized();
            Eigen::Vector3f axis1, axis2;
            
            if (std::abs(normal.z()) < 0.9) {
                axis1 = Eigen::Vector3f(0, 0, 1).cross(normal).normalized();
            } else {
                axis1 = Eigen::Vector3f(1, 0, 0).cross(normal).normalized();
            }
            axis2 = normal.cross(axis1).normalized();
            
            projX[i] = Eigen::Vector3f(pt.x, pt.y, pt.z).dot(axis1);
            projY[i] = Eigen::Vector3f(pt.x, pt.y, pt.z).dot(axis2);
            
            minX = std::min(minX, projX[i]);
            maxX = std::max(maxX, projX[i]);
            minY = std::min(minY, projY[i]);
            maxY = std::max(maxY, projY[i]);
        }
    }

    double rangeX = maxX - minX;
    double rangeY = maxY - minY;

    for (size_t i = 0; i < meshCloud->size(); ++i) {
        uvCloud->points[i].u = (projX[i] - minX) / rangeX;
        uvCloud->points[i].v = (projY[i] - minY) / rangeY;
    }

    pcl::toPCLPointCloud2(*uvCloud, mesh->tex_coordinates);
    Logger::info("Texture coordinates generated in " + timer.elapsedString());
    return true;
}

MeshData TextureMapper::createTexturedMesh(pcl::PolygonMesh::Ptr mesh,
                                             PointCloudXYZRGB::ConstPtr coloredCloud) {
    Logger::info("Creating textured mesh...");
    Timer timer;

    MeshData meshData;
    meshData.mesh = mesh;
    meshData.name = "textured_mesh";
    meshData.hasTexture = true;

    if (!hasUVCoordinates(mesh)) {
        generateTextureCoordinates(mesh, coloredCloud);
    }

    PointCloudXYZRGB::Ptr coloredVertices(new PointCloudXYZRGB);
    pcl::fromPCLPointCloud2(mesh->cloud, *coloredVertices);

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(coloredCloud);

    for (size_t i = 0; i < coloredVertices->size(); ++i) {
        pcl::PointXYZRGB searchPoint = coloredVertices->points[i];
        std::vector<int> indices(5);
        std::vector<float> distances(5);

        if (tree->nearestKSearch(searchPoint, 5, indices, distances) > 0) {
            int r = 0, g = 0, b = 0;
            for (size_t j = 0; j < indices.size(); ++j) {
                const auto& pt = coloredCloud->points[indices[j]];
                r += pt.r;
                g += pt.g;
                b += pt.b;
            }
            coloredVertices->points[i].r = static_cast<uint8_t>(r / indices.size());
            coloredVertices->points[i].g = static_cast<uint8_t>(g / indices.size());
            coloredVertices->points[i].b = static_cast<uint8_t>(b / indices.size());
        }
    }

    meshData.coloredCloud = coloredVertices;
    Logger::info("Textured mesh created in " + timer.elapsedString());
    return meshData;
}

cv::Mat TextureMapper::generateTextureImage(pcl::PolygonMesh::Ptr mesh,
                                             PointCloudXYZRGB::ConstPtr coloredCloud) {
    Logger::info("Generating texture image...");
    
    cv::Mat texture = cv::Mat::zeros(m_textureHeight, m_textureWidth, CV_8UC3);
    texture.setTo(cv::Scalar(255, 255, 255));

    pcl::PointCloud<pcl::PointXYZ>::Ptr meshCloud(new pcl::PointCloud<pcl::PointXYZ>);
    pcl::fromPCLPointCloud2(mesh->cloud, *meshCloud);

    pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>);
    tree->setInputCloud(coloredCloud);

    for (size_t i = 0; i < meshCloud->size(); ++i) {
        pcl::PointXYZRGB searchPoint;
        searchPoint.x = meshCloud->points[i].x;
        searchPoint.y = meshCloud->points[i].y;
        searchPoint.z = meshCloud->points[i].z;

        std::vector<int> indices(1);
        std::vector<float> distances(1);

        if (tree->nearestKSearch(searchPoint, 1, indices, distances) > 0) {
            const auto& pt = coloredCloud->points[indices[0]];
            
            int x = static_cast<int>((static_cast<float>(i) / meshCloud->size()) * m_textureWidth);
            int y = i % m_textureHeight;
            x = std::min(std::max(x, 0), m_textureWidth - 1);
            y = std::min(std::max(y, 0), m_textureHeight - 1);
            
            texture.at<cv::Vec3b>(y, x) = cv::Vec3b(pt.b, pt.g, pt.r);
        }
    }

    cv::GaussianBlur(texture, texture, cv::Size(5, 5), 0);
    return texture;
}

bool TextureMapper::hasUVCoordinates(pcl::PolygonMesh::ConstPtr mesh) {
    return !mesh->tex_coordinates.data.empty();
}

}
