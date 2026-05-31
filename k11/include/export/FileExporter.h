#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <pcl/PolygonMesh.h>
#include <string>
#include <vector>
#include <fstream>

namespace Fossil3D {

class MeshExporter {
public:
    MeshExporter();
    ~MeshExporter();

    bool exportOBJ(pcl::PolygonMesh::ConstPtr mesh,
                    const std::string& filename,
                    PointCloudXYZRGB::ConstPtr colors = nullptr);

    bool exportSTL(pcl::PolygonMesh::ConstPtr mesh,
                    const std::string& filename,
                    bool binary = true);

    bool exportPLY(pcl::PolygonMesh::ConstPtr mesh,
                    const std::string& filename,
                    PointCloudXYZRGB::ConstPtr colors = nullptr,
                    bool binary = true);

    bool exportPointCloud(PointCloudXYZRGB::ConstPtr cloud,
                           const std::string& filename);

private:
    void writeOBJHeader(std::ofstream& file, int numVertices, int numFaces);
    void writeOBJVertices(std::ofstream& file, PointCloudXYZRGB::ConstPtr vertices);
    void writeOBJFaces(std::ofstream& file, const std::vector<pcl::Vertices>& faces);
};

class PDFReportGenerator {
public:
    PDFReportGenerator();
    ~PDFReportGenerator();

    void setFossilName(const std::string& name);
    void setFossilDescription(const std::string& desc);
    void addMeasurement(const MeasurementResult& measurement);
    void addImage(const cv::Mat& image, const std::string& caption = "");
    void addPointCloudScreenshot(const cv::Mat& screenshot);

    bool generateReport(const std::string& filename);

    void clear();

private:
    std::string m_fossilName;
    std::string m_fossilDescription;
    std::vector<MeasurementResult> m_measurements;
    std::vector<std::pair<cv::Mat, std::string>> m_images;
    cv::Mat m_pointCloudScreenshot;

    std::string generateHTML();
    std::string escapeHTML(const std::string& text);
};

}
