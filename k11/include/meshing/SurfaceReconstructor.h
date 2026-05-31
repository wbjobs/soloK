#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <pcl/surface/poisson.h>
#include <pcl/surface/gp3.h>
#include <pcl/surface/mls.h>
#include <pcl/surface/texture_mapping.h>
#include <pcl/surface/processing.h>
#include <pcl/features/normal_3d.h>
#include <memory>

namespace Fossil3D {

class SurfaceReconstructor {
public:
    SurfaceReconstructor();
    ~SurfaceReconstructor();

    void setPoissonDepth(int depth);
    void setPoissonSamplesPerNode(int samples);
    void setGP3Radius(double radius);
    void setGP3Mu(double mu);
    void setMaxNearestNeighbors(int nn);

    pcl::PolygonMesh::Ptr poissonReconstruction(PointCloudXYZRGB::ConstPtr cloud,
                                                  PointCloudNormal::ConstPtr normals = nullptr);

    pcl::PolygonMesh::Ptr greedyProjectionReconstruction(PointCloudXYZRGB::ConstPtr cloud,
                                                           PointCloudNormal::ConstPtr normals = nullptr);

    pcl::PolygonMesh::Ptr reconstruct(PointCloudData& cloudData,
                                        const std::string& method = "poisson");

    pcl::PolygonMesh::Ptr simplifyMesh(pcl::PolygonMesh::ConstPtr mesh,
                                        int targetVertices);

    pcl::PolygonMesh::Ptr smoothMesh(pcl::PolygonMesh::ConstPtr mesh,
                                       int iterations = 10);

    pcl::PolygonMesh::Ptr cleanMesh(pcl::PolygonMesh::ConstPtr mesh);

private:
    int m_poissonDepth;
    int m_poissonSamplesPerNode;
    double m_gp3Radius;
    double m_gp3Mu;
    int m_maxNearestNeighbors;
};

class TextureMapper {
public:
    TextureMapper();
    ~TextureMapper();

    void setTextureResolution(int width, int height);
    void setUVPadding(int padding);

    bool generateTextureCoordinates(pcl::PolygonMesh::Ptr mesh,
                                     PointCloudXYZRGB::ConstPtr coloredCloud);

    MeshData createTexturedMesh(pcl::PolygonMesh::Ptr mesh,
                                 PointCloudXYZRGB::ConstPtr coloredCloud);

    cv::Mat generateTextureImage(pcl::PolygonMesh::Ptr mesh,
                                  PointCloudXYZRGB::ConstPtr coloredCloud);

    bool hasUVCoordinates(pcl::PolygonMesh::ConstPtr mesh);

private:
    int m_textureWidth;
    int m_textureHeight;
    int m_uvPadding;
};

}
