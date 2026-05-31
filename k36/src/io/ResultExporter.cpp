#include "io/ResultExporter.h"
#include "visualization/TreeVisualizer.h"
#include <pcl/io/ply_io.h>
#include <pcl/io/pcd_io.h>
#include <pcl/filters/voxel_grid.h>
#include <QFile>
#include <QTextStream>
#include <QDir>
#include <QPainter>
#include <QPdfWriter>
#include <QImage>
#include <QDateTime>
#include <fstream>
#include <sstream>
#include <cmath>
#include <numeric>
#include <algorithm>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>
#endif

namespace forest
{

ResultExporter::ResultExporter()
{
}

ResultExporter::~ResultExporter()
{
}

void ResultExporter::setProgressCallback(std::function<void(int, const std::string&)> callback)
{
    progress_callback_ = callback;
}

bool ResultExporter::ensureDirectory(const std::string& path)
{
    QDir dir(QString::fromStdString(path));
    if (!dir.exists())
    {
        return dir.mkpath(".");
    }
    return true;
}

std::string ResultExporter::generateTreeFilename(int tree_id, const std::string& format)
{
    char filename[256];
    std::snprintf(filename, sizeof(filename), "tree_%04d%s", tree_id, format.c_str());
    return std::string(filename);
}

bool ResultExporter::exportAll(const SegmentationResult& result, const std::string& output_dir,
                                const std::string& project_name)
{
    if (!ensureDirectory(output_dir))
    {
        std::cerr << "无法创建输出目录: " << output_dir << std::endl;
        return false;
    }

    bool success = true;
    int steps = 0;
    int total_steps = (options_.export_csv ? 1 : 0) +
                      (options_.export_point_clouds ? 1 : 0) +
                      (options_.export_pdf_report ? 1 : 0) +
                      (options_.export_dem ? 1 : 0) +
                      (options_.export_projection ? 1 : 0);

    if (total_steps == 0)
    {
        std::cerr << "没有选择导出选项" << std::endl;
        return false;
    }

    if (options_.export_csv)
    {
        if (progress_callback_)
        {
            progress_callback_(++steps * 100 / total_steps, "正在导出CSV表格...");
        }
        std::string csv_path = output_dir + "/" + project_name + "_tree_params.csv";
        success &= exportCSV(result, csv_path);
    }

    if (options_.export_point_clouds)
    {
        if (progress_callback_)
        {
            progress_callback_(++steps * 100 / total_steps, "正在导出单木点云...");
        }
        std::string pc_dir = output_dir + "/trees";
        success &= exportPointClouds(result, pc_dir, project_name);
    }

    if (options_.export_pdf_report)
    {
        if (progress_callback_)
        {
            progress_callback_(++steps * 100 / total_steps, "正在生成PDF报告...");
        }
        std::string pdf_path = output_dir + "/" + project_name + "_report.pdf";
        success &= exportPDFReport(result, pdf_path, project_name);
    }

    if (options_.export_dem)
    {
        if (progress_callback_)
        {
            progress_callback_(++steps * 100 / total_steps, "正在导出DEM...");
        }
        std::string dem_path = output_dir + "/" + project_name + "_dem.csv";
        success &= exportDEM(result.getDEM(), result.getDEMResolution(),
                             result.getDEMOrigin(), dem_path);
    }

    if (options_.export_projection)
    {
        if (progress_callback_)
        {
            progress_callback_(++steps * 100 / total_steps, "正在导出投影图...");
        }
        std::string proj_path = output_dir + "/" + project_name + "_projection.png";
        success &= exportProjection(result, proj_path);
    }

    if (progress_callback_)
    {
        progress_callback_(100, success ? "导出完成" : "导出失败");
    }

    return success;
}

bool ResultExporter::exportCSV(const SegmentationResult& result, const std::string& filename)
{
    QFile file(QString::fromStdString(filename));
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text))
    {
        std::cerr << "无法打开CSV文件: " << filename << std::endl;
        return false;
    }

    QTextStream out(&file);
    out.setCodec("UTF-8");

    out << "树ID,树高(m),冠幅X(m),冠幅Y(m),平均冠幅(m),冠幅面积(m²),"
        << "DBH(m),校正DBH(m),胸高断面积(m²),树冠体积(m³),树干体积(m³),"
        << "总体积(m³),坡度(°),坡向(°),树顶X,树顶Y,树顶Z,树干基X,树干基Y,树干基Z,点数\n";

    const auto& trees = result.getTrees();
    for (const auto& tree : trees)
    {
        if (!tree) continue;

        const auto& params = tree->getParameters();
        out << params.tree_id << ","
            << QString::number(params.height, 'f', 2) << ","
            << QString::number(params.crown_diameter_x, 'f', 2) << ","
            << QString::number(params.crown_diameter_y, 'f', 2) << ","
            << QString::number(params.crown_diameter_mean, 'f', 2) << ","
            << QString::number(params.crown_area, 'f', 2) << ","
            << QString::number(params.dbh, 'f', 3) << ","
            << QString::number(params.dbh_corrected, 'f', 3) << ","
            << QString::number(params.basal_area, 'f', 4) << ","
            << QString::number(params.crown_volume, 'f', 2) << ","
            << QString::number(params.trunk_volume, 'f', 2) << ","
            << QString::number(params.total_volume, 'f', 2) << ","
            << QString::number(params.slope_angle, 'f', 1) << ","
            << QString::number(params.aspect_angle, 'f', 1) << ","
            << QString::number(params.treetop.x(), 'f', 3) << ","
            << QString::number(params.treetop.y(), 'f', 3) << ","
            << QString::number(params.treetop.z(), 'f', 3) << ","
            << QString::number(params.trunk_base.x(), 'f', 3) << ","
            << QString::number(params.trunk_base.y(), 'f', 3) << ","
            << QString::number(params.trunk_base.z(), 'f', 3) << ","
            << tree->getPointCount() << "\n";
    }

    file.close();
    return true;
}

bool ResultExporter::exportPointClouds(const SegmentationResult& result, const std::string& output_dir,
                                        const std::string& project_name)
{
    if (!ensureDirectory(output_dir))
    {
        std::cerr << "无法创建点云输出目录: " << output_dir << std::endl;
        return false;
    }

    const auto& trees = result.getTrees();
    bool success = true;

    for (size_t i = 0; i < trees.size(); ++i)
    {
        const auto& tree = trees[i];
        if (!tree || !tree->getPointCloud()) continue;

        auto cloud = tree->getPointCloud();

        if (options_.point_cloud_downsample > 0.0f)
        {
            pcl::VoxelGrid<PointXYZIL> voxel_grid;
            voxel_grid.setInputCloud(cloud);
            voxel_grid.setLeafSize(options_.point_cloud_downsample,
                                   options_.point_cloud_downsample,
                                   options_.point_cloud_downsample);

            PointCloudPtr filtered(new PointCloud);
            voxel_grid.filter(*filtered);
            cloud = filtered;
        }

        std::string filename = output_dir + "/" + generateTreeFilename(tree->getId(), options_.point_cloud_format);

        int save_result = -1;
        if (options_.point_cloud_format == ".ply")
        {
            save_result = pcl::io::savePLYFile(filename, *cloud);
        }
        else if (options_.point_cloud_format == ".pcd")
        {
            save_result = pcl::io::savePCDFile(filename, *cloud);
        }

        if (save_result != 0)
        {
            std::cerr << "保存点云失败: " << filename << std::endl;
            success = false;
        }
    }

    if (result.getPointCloud() && !options_.separate_by_tree_id)
    {
        std::string all_filename = output_dir + "/" + project_name + "_segmented" + options_.point_cloud_format;

        pcl::PointCloud<pcl::PointXYZRGB> colored_cloud;
        colored_cloud.reserve(result.getPointCloud()->size());

        for (const auto& p : result.getPointCloud()->points)
        {
            pcl::PointXYZRGB cp;
            cp.x = p.x;
            cp.y = p.y;
            cp.z = p.z;

            if (p.tree_id < 0)
            {
                cp.r = 128; cp.g = 128; cp.b = 128;
            }
            else
            {
                unsigned char r, g, b;
                int id = p.tree_id % 24;
                static const unsigned char colors[][3] = {
                    {255,0,0},{0,255,0},{0,0,255},{255,255,0},
                    {255,0,255},{0,255,255},{255,128,0},{128,0,255},
                    {255,0,128},{0,255,128},{128,255,0},{0,128,255}
                };
                cp.r = colors[id][0];
                cp.g = colors[id][1];
                cp.b = colors[id][2];
            }
            colored_cloud.push_back(cp);
        }

        colored_cloud.width = colored_cloud.size();
        colored_cloud.height = 1;
        colored_cloud.is_dense = true;

        if (options_.point_cloud_format == ".ply")
        {
            pcl::io::savePLYFile(all_filename, colored_cloud);
        }
        else if (options_.point_cloud_format == ".pcd")
        {
            pcl::io::savePCDFile(all_filename, colored_cloud);
        }
    }

    return success;
}

void ResultExporter::computePlotStatistics(const SegmentationResult& result, PlotStatistics& stats)
{
    const auto& trees = result.getTrees();

    stats.tree_count = trees.size();

    if (result.getPointCloud())
    {
        stats.total_points = result.getPointCloud()->size();
    }

    if (result.getGroundPoints())
    {
        stats.ground_points = result.getGroundPoints()->size();
    }

    stats.vegetation_points = stats.total_points - stats.ground_points;

    if (result.getPointCloud())
    {
        float min_x = std::numeric_limits<float>::max();
        float max_x = -std::numeric_limits<float>::max();
        float min_y = std::numeric_limits<float>::max();
        float max_y = -std::numeric_limits<float>::max();
        float min_z = std::numeric_limits<float>::max();
        float max_z = -std::numeric_limits<float>::max();

        for (const auto& p : result.getPointCloud()->points)
        {
            min_x = std::min(min_x, p.x);
            max_x = std::max(max_x, p.x);
            min_y = std::min(min_y, p.y);
            max_y = std::max(max_y, p.y);
            min_z = std::min(min_z, p.z);
            max_z = std::max(max_z, p.z);
        }

        stats.plot_area = (max_x - min_x) * (max_y - min_y) / 10000.0f;
        stats.elevation_min = min_z;
        stats.elevation_max = max_z;
        stats.elevation_mean = (min_z + max_z) / 2.0f;
    }

    if (stats.plot_area > 0)
    {
        stats.density = stats.tree_count / stats.plot_area;
    }

    float sum_height = 0.0f;
    float sum_dbh = 0.0f;
    float sum_crown = 0.0f;
    float sum_slope = 0.0f;
    stats.max_height = 0.0f;

    int valid_count = 0;
    for (const auto& tree : trees)
    {
        if (!tree) continue;

        const auto& params = tree->getParameters();
        sum_height += params.height;
        sum_dbh += params.dbh_corrected > 0 ? params.dbh_corrected : params.dbh;
        sum_crown += params.crown_diameter_mean;
        sum_slope += params.slope_angle;
        stats.total_basal_area += params.basal_area;
        stats.total_volume += params.total_volume;
        stats.max_height = std::max(stats.max_height, params.height);
        valid_count++;
    }

    if (valid_count > 0)
    {
        stats.mean_height = sum_height / valid_count;
        stats.mean_dbh = sum_dbh / valid_count;
        stats.mean_crown_diameter = sum_crown / valid_count;
        stats.mean_slope = sum_slope / valid_count;
    }
}

bool ResultExporter::exportPDFReport(const SegmentationResult& result, const std::string& filename,
                                      const std::string& project_name)
{
    PlotStatistics stats;
    computePlotStatistics(result, stats);
    const_cast<SegmentationResult&>(result).setStatistics(stats);

    QPdfWriter pdf_writer(QString::fromStdString(filename));
    pdf_writer.setPageSize(QPageSize(QPageSize::A4));
    pdf_writer.setResolution(300);
    pdf_writer.setPageMargins(QMarginsF(20, 20, 20, 20), QPageLayout::Millimeter);

    QPainter painter(&pdf_writer);
    painter.setRenderHint(QPainter::Antialiasing);

    int page_width = painter.viewport().width();
    int page_height = painter.viewport().height();
    int margin = 50;
    int content_width = page_width - 2 * margin;
    int y_pos = margin;

    QFont title_font("Arial", 24, QFont::Bold);
    painter.setFont(title_font);
    painter.drawText(margin, y_pos, content_width, 50, Qt::AlignCenter,
                     QString::fromStdString("林地LiDAR单木分割测量报告"));
    y_pos += 70;

    QFont subtitle_font("Arial", 14);
    painter.setFont(subtitle_font);
    painter.drawText(margin, y_pos, content_width, 30, Qt::AlignCenter,
                     "项目名称: " + QString::fromStdString(project_name));
    y_pos += 40;
    painter.drawText(margin, y_pos, content_width, 30, Qt::AlignCenter,
                     "生成时间: " + QDateTime::currentDateTime().toString("yyyy-MM-dd HH:mm:ss"));
    y_pos += 60;

    QFont section_font("Arial", 16, QFont::Bold);
    painter.setFont(section_font);
    painter.drawText(margin, y_pos, content_width, 30, Qt::AlignLeft, "一、样地概况");
    y_pos += 40;

    QFont content_font("Arial", 11);
    painter.setFont(content_font);

    QStringList stat_items;
    stat_items << QString("样地面积: %1 公顷").arg(stats.plot_area, 0, 'f', 2)
               << QString("总点数: %1").arg(stats.total_points)
               << QString("地面点数: %1").arg(stats.ground_points)
               << QString("植被点数: %1").arg(stats.vegetation_points)
               << QString("海拔范围: %1 - %2 m").arg(stats.elevation_min, 0, 'f', 1).arg(stats.elevation_max, 0, 'f', 1)
               << QString("平均坡度: %1 °").arg(stats.mean_slope, 0, 'f', 1);

    int col_width = content_width / 2;
    for (int i = 0; i < stat_items.size(); ++i)
    {
        int col = i % 2;
        int row = i / 2;
        painter.drawText(margin + col * col_width, y_pos + row * 25, col_width, 25, Qt::AlignLeft, stat_items[i]);
    }
    y_pos += ((stat_items.size() + 1) / 2) * 30 + 20;

    painter.setFont(section_font);
    painter.drawText(margin, y_pos, content_width, 30, Qt::AlignLeft, "二、林木统计");
    y_pos += 40;

    painter.setFont(content_font);
    QStringList tree_items;
    tree_items << QString("林木株数: %1 株").arg(stats.tree_count)
               << QString("林分密度: %1 株/公顷").arg(stats.density, 0, 'f', 1)
               << QString("平均树高: %1 m").arg(stats.mean_height, 0, 'f', 2)
               << QString("最大树高: %1 m").arg(stats.max_height, 0, 'f', 2)
               << QString("平均胸径: %1 cm").arg(stats.mean_dbh * 100, 0, 'f', 1)
               << QString("平均冠幅: %1 m").arg(stats.mean_crown_diameter, 0, 'f', 2)
               << QString("总断面积: %1 m²").arg(stats.total_basal_area, 0, 'f', 2)
               << QString("总蓄积量: %1 m³").arg(stats.total_volume, 0, 'f', 2);

    for (int i = 0; i < tree_items.size(); ++i)
    {
        int col = i % 2;
        int row = i / 2;
        painter.drawText(margin + col * col_width, y_pos + row * 25, col_width, 25, Qt::AlignLeft, tree_items[i]);
    }
    y_pos += ((tree_items.size() + 1) / 2) * 30 + 30;

    painter.setFont(section_font);
    painter.drawText(margin, y_pos, content_width, 30, Qt::AlignLeft, "三、单木参数表（前10株）");
    y_pos += 40;

    painter.setFont(content_font);
    int table_y = y_pos;
    int row_height = 25;
    int col1 = margin;
    int col2 = col1 + 60;
    int col3 = col2 + 80;
    int col4 = col3 + 90;
    int col5 = col4 + 90;
    int col6 = col5 + 100;
    int col7 = col6 + 100;

    QFont header_font("Arial", 10, QFont::Bold);
    painter.setFont(header_font);
    painter.drawText(col1, table_y, 60, row_height, Qt::AlignCenter, "树ID");
    painter.drawText(col2, table_y, 80, row_height, Qt::AlignCenter, "树高(m)");
    painter.drawText(col3, table_y, 90, row_height, Qt::AlignCenter, "胸径(cm)");
    painter.drawText(col4, table_y, 90, row_height, Qt::AlignCenter, "冠幅(m)");
    painter.drawText(col5, table_y, 100, row_height, Qt::AlignCenter, "树冠体积(m³)");
    painter.drawText(col6, table_y, 100, row_height, Qt::AlignCenter, "坡度(°)");

    painter.setFont(content_font);
    table_y += row_height;

    const auto& trees = result.getTrees();
    int display_count = std::min(10, (int)trees.size());
    for (int i = 0; i < display_count; ++i)
    {
        if (!trees[i]) continue;
        const auto& params = trees[i]->getParameters();

        painter.drawText(col1, table_y, 60, row_height, Qt::AlignCenter, QString::number(params.tree_id));
        painter.drawText(col2, table_y, 80, row_height, Qt::AlignCenter, QString::number(params.height, 'f', 2));
        float dbh = params.dbh_corrected > 0 ? params.dbh_corrected : params.dbh;
        painter.drawText(col3, table_y, 90, row_height, Qt::AlignCenter, QString::number(dbh * 100, 'f', 1));
        painter.drawText(col4, table_y, 90, row_height, Qt::AlignCenter, QString::number(params.crown_diameter_mean, 'f', 2));
        painter.drawText(col5, table_y, 100, row_height, Qt::AlignCenter, QString::number(params.crown_volume, 'f', 2));
        painter.drawText(col6, table_y, 100, row_height, Qt::AlignCenter, QString::number(params.slope_angle, 'f', 1));

        table_y += row_height;
    }

    y_pos = table_y + 40;

    pdf_writer.newPage();
    y_pos = margin;

    painter.setFont(section_font);
    painter.drawText(margin, y_pos, content_width, 30, Qt::AlignLeft, "四、俯视投影图");
    y_pos += 40;

    TreeVisualizer viz;
    viz.setSegmentationResult(std::make_shared<SegmentationResult>(result));
    auto projection = viz.createTopViewProjection(true);

    if (projection)
    {
        int img_width = projection->GetDimensions()[0];
        int img_height = projection->GetDimensions()[1];

        QImage image(img_width, img_height, QImage::Format_RGB888);
        for (int y = 0; y < img_height; ++y)
        {
            for (int x = 0; x < img_width; ++x)
            {
                unsigned char* pixel = static_cast<unsigned char*>(projection->GetScalarPointer(x, y, 0));
                image.setPixel(x, y, qRgb(pixel[0], pixel[1], pixel[2]));
            }
        }

        int plot_width = content_width - 40;
        int plot_height = plot_width * img_height / img_width;

        if (y_pos + plot_height > page_height - margin)
        {
            pdf_writer.newPage();
            y_pos = margin;
        }

        painter.drawImage(QRect(margin + 20, y_pos, plot_width, plot_height), image);
        y_pos += plot_height + 30;
    }

    painter.setFont(section_font);
    painter.drawText(margin, y_pos, content_width, 30, Qt::AlignLeft, "五、备注");
    y_pos += 40;

    painter.setFont(content_font);
    painter.drawText(margin, y_pos, content_width, 200, Qt::AlignLeft | Qt::TextWordWrap,
                     "本报告由ForestLiDAR三维点云单木分割测量系统自动生成。"
                     "测量精度受点云密度、地形复杂度、分割算法参数等因素影响。"
                     "建议对关键测树因子进行实地验证。");

    painter.end();
    return true;
}

bool ResultExporter::exportDEM(const DEMGrid& dem, float resolution, const Eigen::Vector2f& origin,
                                const std::string& filename)
{
    QFile file(QString::fromStdString(filename));
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text))
    {
        std::cerr << "无法打开DEM文件: " << filename << std::endl;
        return false;
    }

    QTextStream out(&file);
    out.setCodec("UTF-8");

    out << "ncols " << dem.cols() << "\n";
    out << "nrows " << dem.rows() << "\n";
    out << "xllcorner " << origin.x() << "\n";
    out << "yllcorner " << origin.y() << "\n";
    out << "cellsize " << resolution << "\n";
    out << "NODATA_value -9999\n";

    for (int row = dem.rows() - 1; row >= 0; --row)
    {
        for (int col = 0; col < dem.cols(); ++col)
        {
            float val = dem(row, col);
            if (std::isnan(val))
            {
                out << "-9999 ";
            }
            else
            {
                out << QString::number(val, 'f', 3) << " ";
            }
        }
        out << "\n";
    }

    file.close();
    return true;
}

bool ResultExporter::exportProjection(const SegmentationResult& result, const std::string& filename)
{
    TreeVisualizer viz;
    viz.setSegmentationResult(std::make_shared<SegmentationResult>(result));
    auto projection = viz.createTopViewProjection(true);

    if (!projection)
    {
        std::cerr << "生成投影图失败" << std::endl;
        return false;
    }

    int img_width = projection->GetDimensions()[0];
    int img_height = projection->GetDimensions()[1];

    QImage image(img_width, img_height, QImage::Format_RGB888);
    for (int y = 0; y < img_height; ++y)
    {
        for (int x = 0; x < img_width; ++x)
        {
            unsigned char* pixel = static_cast<unsigned char*>(projection->GetScalarPointer(x, y, 0));
            image.setPixel(x, y, qRgb(pixel[0], pixel[1], pixel[2]));
        }
    }

    return image.save(QString::fromStdString(filename), "PNG");
}

}
