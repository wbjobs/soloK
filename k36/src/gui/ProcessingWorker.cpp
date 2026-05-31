#include "gui/ProcessingWorker.h"
#include "io/PointCloudLoader.h"
#include <QFileInfo>
#include <QDir>
#include <QDebug>

namespace forest
{

ProcessingWorker::ProcessingWorker(QObject* parent)
    : QObject(parent)
    , cancel_flag_(false)
{
}

ProcessingWorker::~ProcessingWorker()
{
}

void ProcessingWorker::setParams(const TerrainNormalizationParams& terrain_params,
                                 const TreeTopDetectionParams& treetop_params,
                                 const TreeSegmentationParams& segmentation_params,
                                 const FeatureExtractionParams& feature_params,
                                 const ExportOptions& export_options)
{
    terrain_params_ = terrain_params;
    treetop_params_ = treetop_params;
    segmentation_params_ = segmentation_params;
    feature_params_ = feature_params;
    export_options_ = export_options;
}

void ProcessingWorker::cancel()
{
    cancel_flag_ = true;
}

bool ProcessingWorker::processFile(const QString& filename,
                                   SegmentationResult::Ptr& result,
                                   PointCloudData::Ptr& data)
{
    cancel_flag_ = false;

    PointCloudLoader loader;
    loader.setProgressCallback([this](int p, const std::string& msg) {
        emit progress(p, QString::fromStdString(msg));
    });

    emit progress(0, "正在加载点云数据: " + filename);

    data = loader.load(filename.toStdString());
    if (!data || !data->getPointCloud() || data->getPointCloud()->empty())
    {
        emit error("点云数据加载失败");
        return false;
    }

    if (cancel_flag_) return false;

    emit progress(5, QString("点云加载完成，共 %1 个点").arg(data->getTotalPoints()));

    TerrainNormalizer normalizer;
    normalizer.setParams(terrain_params_);
    normalizer.setProgressCallback([this](int p, const std::string& msg) {
        emit progress(5 + p * 0.25, QString::fromStdString(msg));
    });

    PointCloudHPtr normalized_cloud;
    DEMGrid dem;
    float dem_resolution;
    Eigen::Vector2f dem_origin;

    if (!normalizer.process(*data, normalized_cloud, dem, dem_resolution, dem_origin))
    {
        emit error("地形归一化失败");
        return false;
    }

    if (cancel_flag_) return false;

    TreeTopDetector detector;
    detector.setParams(treetop_params_);
    detector.setProgressCallback([this](int p, const std::string& msg) {
        emit progress(30 + p * 0.2, QString::fromStdString(msg));
    });

    std::vector<Eigen::Vector3f> tree_tops;
    std::vector<int> top_indices;

    if (!detector.detect(*normalized_cloud, tree_tops, top_indices))
    {
        emit error("树顶检测失败");
        return false;
    }

    if (cancel_flag_) return false;

    emit progress(50, QString("检测到 %1 个树顶").arg(tree_tops.size()));

    TreeSegmenter segmenter;
    segmenter.setParams(segmentation_params_);
    segmenter.setProgressCallback([this](int p, const std::string& msg) {
        emit progress(50 + p * 0.25, QString::fromStdString(msg));
    });

    result = std::make_shared<SegmentationResult>();
    result->setDEM(dem);
    result->setDEMResolution(dem_resolution);
    result->setDEMOrigin(dem_origin);
    result->setGroundPoints(data->getGroundPoints());

    if (!segmenter.segment(*normalized_cloud, tree_tops, top_indices, result))
    {
        emit error("单木分割失败");
        return false;
    }

    if (cancel_flag_) return false;

    emit progress(75, QString("分割出 %1 棵树").arg(result->getTrees().size()));

    TreeParameterExtractor extractor;
    extractor.setParams(feature_params_);
    extractor.setProgressCallback([this](int p, const std::string& msg) {
        emit progress(75 + p * 0.2, QString::fromStdString(msg));
    });

    auto trees = result->getTrees();
    extractor.extractAll(trees, dem, dem_resolution, dem_origin);
    result->setTrees(trees);

    if (cancel_flag_) return false;

    emit progress(100, "处理完成");
    return true;
}

void ProcessingWorker::processSingle()
{
    SegmentationResult::Ptr result;
    PointCloudData::Ptr data;

    bool success = processFile(current_file_, result, data);

    if (success && !cancel_flag_)
    {
        emit singleFinished(result, data);
    }

    emit finished();
}

void ProcessingWorker::processBatch()
{
    int total = batch_files_.size();
    int success_count = 0;
    int failed_count = 0;

    for (int i = 0; i < total; ++i)
    {
        if (cancel_flag_) break;

        const QString& file = batch_files_[i];
        emit progress(0, QString("正在处理 (%1/%2): %3").arg(i + 1).arg(total).arg(file));

        SegmentationResult::Ptr result;
        PointCloudData::Ptr data;

        bool success = processFile(file, result, data);

        if (success && result && !cancel_flag_)
        {
            QFileInfo file_info(file);
            QString project_name = file_info.baseName();
            QString output_dir = output_dir_.isEmpty() ? file_info.absolutePath() : output_dir_;

            ResultExporter exporter;
            exporter.setOptions(export_options_);
            exporter.setProgressCallback([this](int p, const std::string& msg) {
                emit progress(p, QString::fromStdString(msg));
            });

            bool export_success = exporter.exportAll(*result, output_dir.toStdString(),
                                                      project_name.toStdString());

            if (export_success)
            {
                success_count++;
                emit batchFileFinished(file, true);
            }
            else
            {
                failed_count++;
                emit batchFileFinished(file, false);
            }
        }
        else
        {
            failed_count++;
            emit batchFileFinished(file, false);
        }
    }

    emit batchFinished(total, success_count, failed_count);
    emit finished();
}

}
