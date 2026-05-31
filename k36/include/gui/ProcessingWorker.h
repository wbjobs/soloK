#pragma once

#include <QObject>
#include <QThread>
#include <QStringList>
#include <memory>
#include <string>
#include <vector>

#include "core/PointCloudData.h"
#include "core/SegmentationResult.h"
#include "segmentation/TerrainNormalizer.h"
#include "segmentation/TreeTopDetector.h"
#include "segmentation/TreeSegmenter.h"
#include "features/TreeParameterExtractor.h"
#include "io/ResultExporter.h"

namespace forest
{

class ProcessingWorker : public QObject
{
    Q_OBJECT

public:
    explicit ProcessingWorker(QObject* parent = nullptr);
    ~ProcessingWorker();

    void setParams(const TerrainNormalizationParams& terrain_params,
                   const TreeTopDetectionParams& treetop_params,
                   const TreeSegmentationParams& segmentation_params,
                   const FeatureExtractionParams& feature_params,
                   const ExportOptions& export_options);

    void setBatchFiles(const QStringList& files) { batch_files_ = files; }
    void setOutputDir(const QString& dir) { output_dir_ = dir; }
    void setCurrentFile(const QString& file) { current_file_ = file; }

public slots:
    void processSingle();
    void processBatch();
    void cancel();

signals:
    void progress(int value, const QString& message);
    void singleFinished(SegmentationResult::Ptr result, PointCloudData::Ptr data);
    void batchFileFinished(const QString& file, bool success);
    void batchFinished(int total, int success, int failed);
    void error(const QString& message);
    void finished();

private:
    bool processFile(const QString& filename, SegmentationResult::Ptr& result,
                     PointCloudData::Ptr& data);

    QString current_file_;
    QStringList batch_files_;
    QString output_dir_;
    bool cancel_flag_;

    TerrainNormalizationParams terrain_params_;
    TreeTopDetectionParams treetop_params_;
    TreeSegmentationParams segmentation_params_;
    FeatureExtractionParams feature_params_;
    ExportOptions export_options_;
};

}
