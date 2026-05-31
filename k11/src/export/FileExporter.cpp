#include "export/FileExporter.h"
#include <pcl/io/ply_io.h>
#include <pcl/io/obj_io.h>
#include <pcl/io/stl_io.h>
#include <pcl/io/pcd_io.h>
#include <sstream>
#include <iomanip>

namespace Fossil3D {

MeshExporter::MeshExporter() {
}

MeshExporter::~MeshExporter() {
}

bool MeshExporter::exportOBJ(pcl::PolygonMesh::ConstPtr mesh,
                              const std::string& filename,
                              PointCloudXYZRGB::ConstPtr colors) {
    Logger::info("Exporting mesh to OBJ: " + filename);
    
    std::ofstream file(filename);
    if (!file.is_open()) {
        Logger::error("Failed to open file for writing: " + filename);
        return false;
    }

    PointCloudXYZRGB::Ptr vertices(new PointCloudXYZRGB);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    writeOBJHeader(file, vertices->size(), mesh->polygons.size());
    writeOBJVertices(file, vertices);

    if (colors && colors->size() == vertices->size()) {
        for (size_t i = 0; i < colors->size(); ++i) {
            const auto& pt = colors->points[i];
            file << "vt " << pt.x << " " << pt.y << "\n";
        }
    }

    writeOBJFaces(file, mesh->polygons);

    file.close();
    Logger::info("OBJ export completed successfully");
    return true;
}

void MeshExporter::writeOBJHeader(std::ofstream& file, int numVertices, int numFaces) {
    file << "# Fossil 3D Reconstruction OBJ File\n";
    file << "# Vertices: " << numVertices << "\n";
    file << "# Faces: " << numFaces << "\n\n";
}

void MeshExporter::writeOBJVertices(std::ofstream& file, PointCloudXYZRGB::ConstPtr vertices) {
    for (const auto& pt : vertices->points) {
        file << "v " << pt.x << " " << pt.y << " " << pt.z 
             << " " << static_cast<int>(pt.r) / 255.0 
             << " " << static_cast<int>(pt.g) / 255.0 
             << " " << static_cast<int>(pt.b) / 255.0 << "\n";
    }
    file << "\n";
}

void MeshExporter::writeOBJFaces(std::ofstream& file, const std::vector<pcl::Vertices>& faces) {
    for (const auto& face : faces) {
        file << "f";
        for (const auto& idx : face.vertices) {
            file << " " << (idx + 1);
        }
        file << "\n";
    }
}

bool MeshExporter::exportSTL(pcl::PolygonMesh::ConstPtr mesh,
                              const std::string& filename,
                              bool binary) {
    Logger::info("Exporting mesh to STL: " + filename);
    
    pcl::io::savePolygonFileSTL(filename, *mesh, binary);
    
    Logger::info("STL export completed successfully");
    return true;
}

bool MeshExporter::exportPLY(pcl::PolygonMesh::ConstPtr mesh,
                              const std::string& filename,
                              PointCloudXYZRGB::ConstPtr colors,
                              bool binary) {
    Logger::info("Exporting mesh to PLY: " + filename);
    
    if (colors && colors->size() > 0) {
        pcl::PolygonMesh coloredMesh = *mesh;
        pcl::toPCLPointCloud2(*colors, coloredMesh.cloud);
        pcl::io::savePLYFile(filename, coloredMesh, binary);
    } else {
        pcl::io::savePLYFile(filename, *mesh, binary);
    }
    
    Logger::info("PLY export completed successfully");
    return true;
}

bool MeshExporter::exportPointCloud(PointCloudXYZRGB::ConstPtr cloud,
                                     const std::string& filename) {
    Logger::info("Exporting point cloud: " + filename);
    
    std::string ext = FileUtils::getFileExtension(filename);
    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
    
    if (ext == ".pcd") {
        pcl::io::savePCDFileBinary(filename, *cloud);
    } else if (ext == ".ply") {
        pcl::io::savePLYFileBinary(filename, *cloud);
    } else {
        Logger::error("Unsupported point cloud format: " + ext);
        return false;
    }
    
    Logger::info("Point cloud export completed successfully");
    return true;
}

PDFReportGenerator::PDFReportGenerator() {
}

PDFReportGenerator::~PDFReportGenerator() {
}

void PDFReportGenerator::setFossilName(const std::string& name) {
    m_fossilName = name;
}

void PDFReportGenerator::setFossilDescription(const std::string& desc) {
    m_fossilDescription = desc;
}

void PDFReportGenerator::addMeasurement(const MeasurementResult& measurement) {
    m_measurements.push_back(measurement);
}

void PDFReportGenerator::addImage(const cv::Mat& image, const std::string& caption) {
    m_images.push_back(std::make_pair(image, caption));
}

void PDFReportGenerator::addPointCloudScreenshot(const cv::Mat& screenshot) {
    m_pointCloudScreenshot = screenshot;
}

void PDFReportGenerator::clear() {
    m_fossilName.clear();
    m_fossilDescription.clear();
    m_measurements.clear();
    m_images.clear();
    m_pointCloudScreenshot.release();
}

std::string PDFReportGenerator::escapeHTML(const std::string& text) {
    std::string result;
    for (char c : text) {
        switch (c) {
            case '<': result += "&lt;"; break;
            case '>': result += "&gt;"; break;
            case '&': result += "&amp;"; break;
            case '"': result += "&quot;"; break;
            case '\'': result += "&#39;"; break;
            default: result += c;
        }
    }
    return result;
}

std::string PDFReportGenerator::generateHTML() {
    std::ostringstream html;
    
    html << "<!DOCTYPE html>\n";
    html << "<html>\n<head>\n";
    html << "<meta charset=\"UTF-8\">\n";
    html << "<title>Fossil 3D Reconstruction Report</title>\n";
    html << "<style>\n";
    html << "body { font-family: Arial, sans-serif; margin: 40px; }\n";
    html << "h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }\n";
    html << "h2 { color: #34495e; margin-top: 30px; }\n";
    html << "table { border-collapse: collapse; width: 100%; margin: 20px 0; }\n";
    html << "th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }\n";
    html << "th { background-color: #3498db; color: white; }\n";
    html << "tr:nth-child(even) { background-color: #f2f2f2; }\n";
    html << ".header-info { background-color: #f8f9fa; padding: 20px; border-radius: 5px; }\n";
    html << ".image-container { margin: 20px 0; text-align: center; }\n";
    html << "img { max-width: 600px; border: 1px solid #ddd; border-radius: 4px; }\n";
    html << ".caption { font-style: italic; color: #666; margin-top: 10px; }\n";
    html << "</style>\n";
    html << "</head>\n<body>\n";

    html << "<h1>古生物化石三维重建报告</h1>\n";
    
    html << "<div class=\"header-info\">\n";
    html << "<h2>" << escapeHTML(m_fossilName) << "</h2>\n";
    html << "<p><strong>描述:</strong> " << escapeHTML(m_fossilDescription) << "</p>\n";
    
    std::time_t now = std::time(nullptr);
    char dateStr[100];
    std::strftime(dateStr, sizeof(dateStr), "%Y-%m-%d %H:%M:%S", std::localtime(&now));
    html << "<p><strong>生成日期:</strong> " << dateStr << "</p>\n";
    html << "</div>\n";

    if (!m_measurements.empty()) {
        html << "<h2>测量数据</h2>\n";
        html << "<table>\n";
        html << "<tr><th>测量类型</th><th>名称</th><th>测量值</th><th>不确定度</th><th>单位</th></tr>\n";
        
        for (const auto& meas : m_measurements) {
            html << "<tr>";
            html << "<td>" << escapeHTML(meas.type) << "</td>";
            html << "<td>" << escapeHTML(meas.name) << "</td>";
            html << "<td style=\"text-align: right;\">" << std::fixed << std::setprecision(3) << meas.value << "</td>";
            html << "<td style=\"text-align: right;\">" << std::fixed << std::setprecision(4) << meas.uncertainty << "</td>";
            html << "<td>" << escapeHTML(meas.unit) << "</td>";
            html << "</tr>\n";
        }
        html << "</table>\n";
    }

    if (!m_images.empty()) {
        html << "<h2>化石照片</h2>\n";
        for (size_t i = 0; i < m_images.size() && i < 5; ++i) {
            std::string imgPath = "image_" + std::to_string(i) + ".jpg";
            html << "<div class=\"image-container\">\n";
            html << "<img src=\"" << imgPath << "\" alt=\"Fossil image\">\n";
            html << "<p class=\"caption\">" << escapeHTML(m_images[i].second) << "</p>\n";
            html << "</div>\n";
        }
    }

    html << "<h2>备注</h2>\n";
    html << "<p>本报告由古生物化石三维重建系统自动生成。</p>\n";
    html << "<p>测量不确定度基于设备精度和算法误差综合估算。</p>\n";

    html << "</body>\n</html>\n";
    
    return html.str();
}

bool PDFReportGenerator::generateReport(const std::string& filename) {
    Logger::info("Generating report: " + filename);
    
    std::string htmlContent = generateHTML();
    
    std::string htmlFile = FileUtils::getParentDirectory(filename) + "/" + 
                           FileUtils::getFileName(filename) + ".html";
    
    std::ofstream file(htmlFile);
    if (!file.is_open()) {
        Logger::error("Failed to create report file: " + htmlFile);
        return false;
    }
    
    file << htmlContent;
    file.close();

    for (size_t i = 0; i < m_images.size() && i < 5; ++i) {
        std::string imgPath = FileUtils::getParentDirectory(filename) + "/image_" + 
                               std::to_string(i) + ".jpg";
        cv::imwrite(imgPath, m_images[i].first);
    }

    Logger::info("Report generated successfully: " + htmlFile);
    Logger::info("Note: HTML report generated. PDF conversion requires additional library support");
    
    return true;
}

}
