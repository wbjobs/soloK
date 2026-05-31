#pragma once

#include <QMainWindow>
#include <QThread>
#include <QTableWidgetItem>
#include <QListWidgetItem>
#include <memory>

#include "core/PointCloudData.h"
#include "core/SegmentationResult.h"
#include "visualization/PointCloudVisualizer.h"
#include "visualization/TreeVisualizer.h"
#include "gui/ProcessingWorker.h"
#include "segmentation/ManualCorrection.h"

class QVTKOpenGLWidget;
class QProgressBar;
class QLabel;

namespace Ui { class MainWindowClass; }

namespace forest
{

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(QWidget* parent = nullptr);
    ~MainWindow();

protected slots:
    void onOpenFile();
    void onBatchProcess();
    void onRunSegmentation();
    void onExportResults();
    void onExportPDF();
    void onClearResults();
    void onColorModeChanged(int index);
    void onShowTreesChanged(bool checked);
    void onShowTreetopsChanged(bool checked);
    void onShowGroundChanged(bool checked);
    void onAlgorithmChanged(int index);
    void onTreeSelected(QListWidgetItem* item);
    void onMergeTrees();
    void onSplitTree();
    void onDeleteTree();
    void onPointPicked(double x, double y, double z);
    void onBatchProgress(int value, const QString& message);
    void onProcessingFinished(SegmentationResult::Ptr result, PointCloudData::Ptr data);
    void onBatchFinished(int total, int success, int failed);
    void onProcessingError(const QString& message);

private:
    void setupUI();
    void setupConnections();
    void setupVisualization();
    void updateTreeList();
    void updateStatistics();
    void updateParametersTable();
    void loadParamsFromUI();
    void resetPicking();

    Ui::MainWindowClass* ui;

    QVTKOpenGLWidget* vtk_widget_;
    PointCloudVisualizer::Ptr cloud_visualizer_;
    TreeVisualizer::Ptr tree_visualizer_;
    ManualCorrection::Ptr manual_correction_;

    PointCloudData::Ptr current_data_;
    SegmentationResult::Ptr current_result_;

    QThread* worker_thread_;
    ProcessingWorker* worker_;

    QProgressBar* progress_bar_;
    QLabel* status_label_;

    std::vector<int> picked_points_;
    int merge_first_tree_;

    TerrainNormalizationParams terrain_params_;
    TreeTopDetectionParams treetop_params_;
    TreeSegmentationParams segmentation_params_;
    FeatureExtractionParams feature_params_;
    ExportOptions export_options_;
};

}
