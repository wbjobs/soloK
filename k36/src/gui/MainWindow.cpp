#include "gui/MainWindow.h"
#include "ui_MainWindow.h"

#include <QFileDialog>
#include <QMessageBox>
#include <QVTKOpenGLWidget.h>
#include <vtkGenericOpenGLRenderWindow.h>
#include <vtkRenderer.h>
#include <vtkCamera.h>
#include <QColor>
#include <QHeaderView>

namespace forest
{

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindowClass())
    , vtk_widget_(nullptr)
    , cloud_visualizer_(std::make_shared<PointCloudVisualizer>())
    , tree_visualizer_(std::make_shared<TreeVisualizer>())
    , manual_correction_(std::make_shared<ManualCorrection>())
    , worker_thread_(new QThread(this))
    , worker_(new ProcessingWorker())
    , merge_first_tree_(-1)
{
    ui->setupUi(this);

    progress_bar_ = new QProgressBar(this);
    progress_bar_->setMaximumWidth(200);
    progress_bar_->setVisible(false);
    statusBar()->addPermanentWidget(progress_bar_);

    status_label_ = new QLabel("就绪", this);
    statusBar()->addWidget(status_label_, 1);

    setupUI();
    setupVisualization();
    setupConnections();

    worker_->moveToThread(worker_thread_);
    worker_thread_->start();

    loadParamsFromUI();
}

MainWindow::~MainWindow()
{
    worker_->cancel();
    worker_thread_->quit();
    worker_thread_->wait(3000);
    delete worker_;
    delete ui;
}

void MainWindow::setupUI()
{
    ui->listTrees->setSelectionMode(QAbstractItemView::ExtendedSelection);

    QStringList headers;
    headers << "ID" << "树高(m)" << "冠幅X(m)" << "冠幅Y(m)"
            << "DBH(cm)" << "校正DBH(cm)" << "树冠体积(m³)"
            << "坡度(°)" << "坡向(°)";
    ui->tableParams->setColumnCount(headers.size());
    ui->tableParams->setHorizontalHeaderLabels(headers);
    ui->tableParams->horizontalHeader()->setStretchLastSection(true);
    ui->tableParams->setAlternatingRowColors(true);
    ui->tableParams->setEditTriggers(QAbstractItemView::NoEditTriggers);
    ui->tableParams->setSelectionBehavior(QAbstractItemView::SelectRows);
}

void MainWindow::setupVisualization()
{
    vtk_widget_ = new QVTKOpenGLWidget(ui->vtkContainer);
    ui->vtkLayout->addWidget(vtk_widget_);

    auto render_window = vtkSmartPointer<vtkGenericOpenGLRenderWindow>::New();
    vtk_widget_->SetRenderWindow(render_window);

    auto renderer = vtkSmartPointer<vtkRenderer>::New();
    renderer->SetBackground(0.1, 0.15, 0.2);
    render_window->AddRenderer(renderer);

    cloud_visualizer_->setRenderer(renderer);
    cloud_visualizer_->setRenderWindow(render_window);
    tree_visualizer_->setRenderer(renderer);
    tree_visualizer_->setRenderWindow(render_window);

    cloud_visualizer_->setPointPickingCallback([this](double x, double y, double z) {
        onPointPicked(x, y, z);
    });

    cloud_visualizer_->setEnablePointPicking(true);
}

void MainWindow::setupConnections()
{
    connect(ui->btnOpen, &QPushButton::clicked, this, &MainWindow::onOpenFile);
    connect(ui->btnBatch, &QPushButton::clicked, this, &MainWindow::onBatchProcess);
    connect(ui->btnRun, &QPushButton::clicked, this, &MainWindow::onRunSegmentation);
    connect(ui->btnExport, &QPushButton::clicked, this, &MainWindow::onExportResults);
    connect(ui->btnPDF, &QPushButton::clicked, this, &MainWindow::onExportPDF);
    connect(ui->btnClear, &QPushButton::clicked, this, &MainWindow::onClearResults);

    connect(ui->comboColorMode, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onColorModeChanged);
    connect(ui->checkShowTrees, &QCheckBox::toggled, this, &MainWindow::onShowTreesChanged);
    connect(ui->checkShowTreetops, &QCheckBox::toggled, this, &MainWindow::onShowTreetopsChanged);
    connect(ui->checkShowGround, &QCheckBox::toggled, this, &MainWindow::onShowGroundChanged);
    connect(ui->comboAlgorithm, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onAlgorithmChanged);

    connect(ui->btnMerge, &QPushButton::clicked, this, &MainWindow::onMergeTrees);
    connect(ui->btnSplit, &QPushButton::clicked, this, &MainWindow::onSplitTree);
    connect(ui->btnDelete, &QPushButton::clicked, this, &MainWindow::onDeleteTree);
    connect(ui->btnResetPick, &QPushButton::clicked, this, &MainWindow::resetPicking);

    connect(ui->listTrees, &QListWidget::itemClicked, this, &MainWindow::onTreeSelected);

    connect(worker_, &ProcessingWorker::progress, this, &MainWindow::onBatchProgress);
    connect(worker_, &ProcessingWorker::singleFinished, this, &MainWindow::onProcessingFinished);
    connect(worker_, &ProcessingWorker::batchFinished, this, &MainWindow::onBatchFinished);
    connect(worker_, &ProcessingWorker::error, this, &MainWindow::onProcessingError);
    connect(worker_, &ProcessingWorker::finished, this, [this]() {
        progress_bar_->setVisible(false);
        ui->btnRun->setEnabled(true);
        ui->btnBatch->setEnabled(true);
    });

    connect(ui->checkTopView, &QCheckBox::toggled, this, [this](bool checked) {
        if (cloud_visualizer_) {
            cloud_visualizer_->setTopView(checked);
        }
    });
}

void MainWindow::loadParamsFromUI()
{
    terrain_params_.dem_resolution = ui->spinDemRes->value();
    terrain_params_.hole_fill_window = 3;
    terrain_params_.use_classification = true;

    treetop_params_.window_size = ui->spinWindow->value();
    treetop_params_.min_height = ui->spinMinHeight->value();
    treetop_params_.gaussian_sigma = 0.5f;

    segmentation_params_.method = static_cast<TreeSegmentationMethod>(ui->comboAlgorithm->currentIndex());
    segmentation_params_.min_points_per_tree = 50;
    segmentation_params_.max_distance = 5.0f;

    feature_params_.dbh_height = ui->spinDBHHeight->value();
    feature_params_.dbh_tolerance = 0.2f;
    feature_params_.min_dbh_points = 8;
    feature_params_.enable_slope_correction = ui->checkSlopeCorrect->isChecked();
    feature_params_.volume_method = VOLUME_CONVEX_HULL;

    export_options_.export_csv = true;
    export_options_.export_point_clouds = true;
    export_options_.export_pdf = true;
    export_options_.export_dem = true;
    export_options_.export_projection = true;
    export_options_.point_cloud_format = "ply";
    export_options_.downsample_points = false;
    export_options_.downsample_resolution = 0.05f;

    worker_->setParams(terrain_params_, treetop_params_, segmentation_params_,
                       feature_params_, export_options_);
}

void MainWindow::onOpenFile()
{
    QString filename = QFileDialog::getOpenFileName(
        this,
        "选择点云文件",
        "",
        "点云文件 (*.las *.laz *.ply *.pcd);;所有文件 (*.*)"
    );

    if (filename.isEmpty()) return;

    onClearResults();
    loadParamsFromUI();
    worker_->setCurrentFile(filename);

    status_label_->setText("正在加载: " + filename);
    progress_bar_->setVisible(true);
    progress_bar_->setRange(0, 100);
    ui->btnRun->setEnabled(false);
    ui->btnBatch->setEnabled(false);

    QMetaObject::invokeMethod(worker_, "processSingle");
}

void MainWindow::onBatchProcess()
{
    QStringList files = QFileDialog::getOpenFileNames(
        this,
        "选择批量处理文件",
        "",
        "点云文件 (*.las *.laz *.ply *.pcd)"
    );

    if (files.isEmpty()) return;

    QString output_dir = QFileDialog::getExistingDirectory(
        this,
        "选择输出目录",
        ""
    );

    if (output_dir.isEmpty()) return;

    loadParamsFromUI();
    worker_->setBatchFiles(files);
    worker_->setOutputDir(output_dir);

    status_label_->setText(QString("批量处理 %1 个文件...").arg(files.size()));
    progress_bar_->setVisible(true);
    progress_bar_->setRange(0, 100);
    ui->btnRun->setEnabled(false);
    ui->btnBatch->setEnabled(false);

    QMetaObject::invokeMethod(worker_, "processBatch");
}

void MainWindow::onRunSegmentation()
{
    if (!current_data_ || !current_data_->getPointCloud() || current_data_->getPointCloud()->empty())
    {
        QMessageBox::warning(this, "提示", "请先加载点云数据");
        return;
    }

    loadParamsFromUI();
    worker_->setCurrentFile("");

    status_label_->setText("正在执行分割...");
    progress_bar_->setVisible(true);
    progress_bar_->setRange(0, 100);
    ui->btnRun->setEnabled(false);
    ui->btnBatch->setEnabled(false);

    current_result_.reset();
    QMetaObject::invokeMethod(worker_, "processSingle");
}

void MainWindow::onExportResults()
{
    if (!current_result_)
    {
        QMessageBox::warning(this, "提示", "没有可导出的分割结果");
        return;
    }

    QString output_dir = QFileDialog::getExistingDirectory(
        this,
        "选择导出目录",
        ""
    );

    if (output_dir.isEmpty()) return;

    loadParamsFromUI();
    ResultExporter exporter;
    exporter.setOptions(export_options_);
    exporter.setProgressCallback([this](int p, const std::string& msg) {
        onBatchProgress(p, QString::fromStdString(msg));
    });

    progress_bar_->setVisible(true);
    progress_bar_->setRange(0, 100);

    bool success = exporter.exportAll(*current_result_, output_dir.toStdString(), "result");

    progress_bar_->setVisible(false);

    if (success)
    {
        QMessageBox::information(this, "成功", "结果导出成功");
        status_label_->setText("导出完成: " + output_dir);
    }
    else
    {
        QMessageBox::critical(this, "错误", "导出失败");
        status_label_->setText("导出失败");
    }
}

void MainWindow::onExportPDF()
{
    if (!current_result_)
    {
        QMessageBox::warning(this, "提示", "没有可导出的分割结果");
        return;
    }

    QString filename = QFileDialog::getSaveFileName(
        this,
        "保存PDF报告",
        "report.pdf",
        "PDF文件 (*.pdf)"
    );

    if (filename.isEmpty()) return;

    ResultExporter exporter;
    exporter.setOptions(export_options_);

    tree_visualizer_->setSegmentationResult(current_result_);
    tree_visualizer_->setCloudData(current_data_);
    auto projection = tree_visualizer_->createTopViewProjection(true);

    bool success = exporter.exportPDFReport(*current_result_, filename.toStdString(),
                                             "TreeLidar 3D Project");

    if (success)
    {
        QMessageBox::information(this, "成功", "PDF报告导出成功");
        status_label_->setText("PDF报告导出: " + filename);
    }
    else
    {
        QMessageBox::critical(this, "错误", "PDF导出失败");
    }
}

void MainWindow::onClearResults()
{
    current_result_.reset();
    ui->listTrees->clear();
    ui->tableParams->setRowCount(0);
    ui->labelStats->setText("总株数: - | 平均树高: - | 平均DBH: - | 样地面积: -");

    if (cloud_visualizer_)
    {
        cloud_visualizer_->clear();
    }
    if (tree_visualizer_)
    {
        tree_visualizer_->clear();
    }

    resetPicking();
    status_label_->setText("就绪");
}

void MainWindow::onColorModeChanged(int index)
{
    if (!cloud_visualizer_) return;

    switch (index)
    {
    case 0:
        cloud_visualizer_->setColorMode(COLOR_HEIGHT);
        break;
    case 1:
        cloud_visualizer_->setColorMode(COLOR_TREE_ID);
        break;
    case 2:
        cloud_visualizer_->setColorMode(COLOR_LABEL);
        break;
    case 3:
        cloud_visualizer_->setColorMode(COLOR_INTENSITY);
        break;
    default:
        cloud_visualizer_->setColorMode(COLOR_HEIGHT);
    }
}

void MainWindow::onShowTreesChanged(bool checked)
{
    if (tree_visualizer_)
    {
        tree_visualizer_->setShowTrunks(checked);
        tree_visualizer_->setShowCrowns(checked);
    }
}

void MainWindow::onShowTreetopsChanged(bool checked)
{
    if (tree_visualizer_)
    {
        tree_visualizer_->setShowTreetops(checked);
    }
}

void MainWindow::onShowGroundChanged(bool checked)
{
    if (cloud_visualizer_)
    {
        cloud_visualizer_->setShowGroundPoints(checked);
    }
}

void MainWindow::onAlgorithmChanged(int index)
{
    segmentation_params_.method = static_cast<TreeSegmentationMethod>(index);
}

void MainWindow::onTreeSelected(QListWidgetItem* item)
{
    if (!current_result_ || !item) return;

    bool ok = false;
    int tree_id = item->data(Qt::UserRole).toInt(&ok);
    if (!ok) return;

    auto tree = current_result_->findTree(tree_id);
    if (!tree) return;

    for (int i = 0; i < ui->tableParams->rowCount(); ++i)
    {
        auto* cell = ui->tableParams->item(i, 0);
        if (cell && cell->text().toInt() == tree_id)
        {
            ui->tableParams->selectRow(i);
            break;
        }
    }

    if (tree_visualizer_)
    {
        tree_visualizer_->highlightTree(tree_id);
    }
}

void MainWindow::onMergeTrees()
{
    if (!current_result_) return;

    auto selected = ui->listTrees->selectedItems();
    if (selected.size() != 2)
    {
        QMessageBox::information(this, "提示", "请选择两棵树进行合并");
        return;
    }

    int id1 = selected[0]->data(Qt::UserRole).toInt();
    int id2 = selected[1]->data(Qt::UserRole).toInt();

    if (manual_correction_->mergeTrees(*current_result_, id1, id2))
    {
        updateTreeList();
        updateStatistics();
        updateParametersTable();

        if (tree_visualizer_ && current_data_)
        {
            tree_visualizer_->clear();
            tree_visualizer_->visualize(*current_result_, current_data_);
        }
        if (cloud_visualizer_ && current_data_)
        {
            cloud_visualizer_->updateTreeIds(*current_result_);
        }

        status_label_->setText(QString("合并成功: 树 %1 和 %2").arg(id1).arg(id2));
    }
    else
    {
        QMessageBox::critical(this, "错误", "合并失败");
    }
}

void MainWindow::onSplitTree()
{
    if (!current_result_) return;

    if (picked_points_.size() < 3)
    {
        QMessageBox::information(this, "提示", "请在点云中拾取至少3个属于新树的点");
        return;
    }

    auto selected = ui->listTrees->selectedItems();
    if (selected.size() != 1)
    {
        QMessageBox::information(this, "提示", "请选择一棵要切分的树");
        return;
    }

    int id = selected[0]->data(Qt::UserRole).toInt();

    TreePtr new_tree;
    if (manual_correction_->splitTree(*current_result_, id, picked_points_, new_tree))
    {
        updateTreeList();
        updateStatistics();
        updateParametersTable();

        if (tree_visualizer_ && current_data_)
        {
            tree_visualizer_->clear();
            tree_visualizer_->visualize(*current_result_, current_data_);
        }
        if (cloud_visualizer_ && current_data_)
        {
            cloud_visualizer_->updateTreeIds(*current_result_);
        }

        resetPicking();
        status_label_->setText(QString("切分成功: 新树 ID = %1").arg(new_tree->getId()));
    }
    else
    {
        QMessageBox::critical(this, "错误", "切分失败");
    }
}

void MainWindow::onDeleteTree()
{
    if (!current_result_) return;

    auto selected = ui->listTrees->selectedItems();
    if (selected.isEmpty())
    {
        QMessageBox::information(this, "提示", "请选择要删除的树");
        return;
    }

    int ret = QMessageBox::question(this, "确认",
        QString("确定删除选中的 %1 棵树吗？").arg(selected.size()));

    if (ret != QMessageBox::Yes) return;

    for (auto* item : selected)
    {
        int id = item->data(Qt::UserRole).toInt();
        manual_correction_->removeTree(*current_result_, id);
    }

    updateTreeList();
    updateStatistics();
    updateParametersTable();

    if (tree_visualizer_ && current_data_)
    {
        tree_visualizer_->clear();
        tree_visualizer_->visualize(*current_result_, current_data_);
    }
    if (cloud_visualizer_ && current_data_)
    {
        cloud_visualizer_->updateTreeIds(*current_result_);
    }

    status_label_->setText(QString("已删除 %1 棵树").arg(selected.size()));
}

void MainWindow::onPointPicked(double x, double y, double z)
{
    if (!current_data_ || !current_result_) return;

    const auto& cloud = *current_data_->getPointCloud();
    double min_dist = std::numeric_limits<double>::max();
    int nearest_idx = -1;

    for (size_t i = 0; i < cloud.size(); ++i)
    {
        double dx = cloud[i].x - x;
        double dy = cloud[i].y - y;
        double dz = cloud[i].z - z;
        double dist = dx * dx + dy * dy + dz * dz;
        if (dist < min_dist && dist < 0.5)
        {
            min_dist = dist;
            nearest_idx = static_cast<int>(i);
        }
    }

    if (nearest_idx >= 0)
    {
        picked_points_.push_back(nearest_idx);
        status_label_->setText(QString("已拾取 %1 个点").arg(picked_points_.size()));

        if (cloud_visualizer_)
        {
            cloud_visualizer_->addPickedPoint(x, y, z);
        }
    }
}

void MainWindow::resetPicking()
{
    picked_points_.clear();
    merge_first_tree_ = -1;
    if (cloud_visualizer_)
    {
        cloud_visualizer_->clearPickedPoints();
    }
    status_label_->setText("选择已重置");
}

void MainWindow::onBatchProgress(int value, const QString& message)
{
    progress_bar_->setValue(value);
    status_label_->setText(message);
}

void MainWindow::onProcessingFinished(SegmentationResult::Ptr result, PointCloudData::Ptr data)
{
    current_result_ = result;
    current_data_ = data;

    if (current_data_ && current_data_->getPointCloud())
    {
        cloud_visualizer_->visualize(current_data_);
        cloud_visualizer_->updateTreeIds(*current_result_);
    }

    if (tree_visualizer_ && current_data_)
    {
        tree_visualizer_->clear();
        tree_visualizer_->visualize(*current_result_, current_data_);
    }

    updateTreeList();
    updateStatistics();
    updateParametersTable();

    status_label_->setText(QString("处理完成，检测到 %1 棵树").arg(result->getTrees().size()));
}

void MainWindow::onBatchFinished(int total, int success, int failed)
{
    QString msg = QString("批量处理完成: 共 %1 个文件，成功 %2，失败 %3")
        .arg(total).arg(success).arg(failed);
    status_label_->setText(msg);
    QMessageBox::information(this, "批量处理完成", msg);
}

void MainWindow::onProcessingError(const QString& message)
{
    QMessageBox::critical(this, "错误", message);
    status_label_->setText("错误: " + message);
}

void MainWindow::updateTreeList()
{
    ui->listTrees->clear();
    if (!current_result_) return;

    const auto& trees = current_result_->getTrees();
    for (const auto& tree : trees)
    {
        if (!tree) continue;
        QString text = QString("树 %1: 高=%2m, DBH=%3cm")
            .arg(tree->getId(), 3)
            .arg(tree->getHeight(), 5, 'f', 1)
            .arg(tree->getDBH() * 100, 5, 'f', 1);

        auto* item = new QListWidgetItem(text);
        item->setData(Qt::UserRole, tree->getId());
        ui->listTrees->addItem(item);
    }
}

void MainWindow::updateStatistics()
{
    if (!current_result_) return;

    const auto& trees = current_result_->getTrees();
    if (trees.empty())
    {
        ui->labelStats->setText("总株数: - | 平均树高: - | 平均DBH: - | 样地面积: -");
        return;
    }

    double sum_h = 0.0, sum_dbh = 0.0;
    int valid_count = 0;
    for (const auto& tree : trees)
    {
        if (!tree) continue;
        sum_h += tree->getHeight();
        if (tree->getDBH() > 0)
        {
            sum_dbh += tree->getDBH();
            valid_count++;
        }
    }

    double area = current_result_->computePlotArea();
    double avg_h = sum_h / trees.size();
    double avg_dbh = valid_count > 0 ? (sum_dbh / valid_count) * 100 : 0.0;

    ui->labelStats->setText(
        QString("总株数: %1 | 平均树高: %2 m | 平均DBH: %3 cm | 样地面积: %4 公顷")
            .arg(trees.size())
            .arg(avg_h, 0, 'f', 1)
            .arg(avg_dbh, 0, 'f', 1)
            .arg(area / 10000.0, 0, 'f', 3)
    );
}

void MainWindow::updateParametersTable()
{
    ui->tableParams->setRowCount(0);
    if (!current_result_) return;

    const auto& trees = current_result_->getTrees();
    ui->tableParams->setRowCount(trees.size());

    for (size_t i = 0; i < trees.size(); ++i)
    {
        const auto& tree = trees[i];
        if (!tree) continue;

        const auto& params = tree->getParameters();

        auto addItem = [&](int col, const QString& text) {
            auto* item = new QTableWidgetItem(text);
            item->setTextAlignment(Qt::AlignCenter);
            ui->tableParams->setItem(i, col, item);
        };

        addItem(0, QString::number(tree->getId()));
        addItem(1, QString::number(params.height, 'f', 2));
        addItem(2, QString::number(params.crown_diameter_x, 'f', 2));
        addItem(3, QString::number(params.crown_diameter_y, 'f', 2));
        addItem(4, QString::number(params.dbh * 100, 'f', 1));
        addItem(5, QString::number(params.dbh_corrected * 100, 'f', 1));
        addItem(6, QString::number(params.crown_volume, 'f', 2));
        addItem(7, QString::number(params.slope_angle * 180.0 / M_PI, 'f', 1));
        addItem(8, QString::number(params.aspect_angle * 180.0 / M_PI, 'f', 0));
    }
}

}
