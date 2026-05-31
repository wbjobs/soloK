#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include "core/AnimationAnalyzer.h"
#include "sfm/SfMReconstructor.h"
#include "mvs/DenseReconstructor.h"
#include "meshing/SurfaceReconstructor.h"
#include "measurement/MeasurementTools.h"
#include "registration/FossilRegistration.h"
#include "export/FileExporter.h"
#include "sampling/BoneThicknessAnalyzer.h"
#include "sampling/SamplingPathPlanner.h"
#include "phylogeny/PhylogeneticFeatures.h"
#include "phylogeny/NexusExporter.h"

#include <QMainWindow>
#include <QVTKOpenGLNativeWidget.h>
#include <vtkGenericOpenGLRenderWindow.h>
#include <vtkRenderer.h>
#include <vtkSmartPointer.h>
#include <vtkActor.h>
#include <vtkPointPicker.h>
#include <QProgressBar>
#include <QLabel>
#include <QListWidget>
#include <QTreeWidget>
#include <QComboBox>
#include <QPushButton>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QCheckBox>
#include <QGroupBox>
#include <QTextEdit>
#include <QThread>
#include <QMutex>
#include <QTimer>

#include <memory>
#include <vector>

namespace Ui {
class MainWindow;
}

namespace Fossil3D {

enum class WorkflowState {
    Idle,
    LoadingImages,
    SfMProcessing,
    DenseReconstruction,
    Filtering,
    Meshing,
    Texturing,
    Measuring,
    Registering,
    Exporting,
    Animating,
    AnalyzingRings,
    AnalyzingThickness,
    PlanningSampling,
    ExtractingFeatures,
    ExportingNexus
};

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);
    ~MainWindow();

    void logMessage(const std::string& message);

protected:
    void closeEvent(QCloseEvent* event) override;

private slots:
    void onImportImages();
    void onRunSfM();
    void onRunDenseReconstruction();
    void onFilterPointCloud();
    void onReconstructMesh();
    void onGenerateTexture();
    void onMeasureCurve();
    void onMeasureAngle();
    void onMeasureVolume();
    void onAnalyzeSymmetry();
    void onRegisterManual();
    void onRegisterAuto();
    void onRegisterCurvature();
    void onFuseFragments();
    void onExportOBJ();
    void onExportSTL();
    void onExportPLY();
    void onGenerateReport();
    void onGenerateOrbitAnimation();
    void onGenerateFlythrough();
    void onGenerateAxisAnimation();
    void onAnalyzeGrowthRings();
    void onAnalyzeThickness();
    void onPlanSampling();
    void onExtractPhyloFeatures();
    void onExportNexus();
    void onClearAll();
    void onAbout();

    void updateView();
    void onTimerUpdate();
    void onPointPicked(double x, double y, double z);

private:
    void setupUI();
    void setupVTK();
    void setupConnections();
    void updateWorkflowButtons();
    void showStatus(const QString& message, int timeout = 3000);
    void updateMeasurementList();
    void updateFragmentList();

    void addPointCloudToView(PointCloudXYZRGB::ConstPtr cloud, const std::string& name);
    void addMeshToView(pcl::PolygonMesh::ConstPtr mesh, const std::string& name);
    void removeFromView(const std::string& name);
    void clearView();

    void runInThread(std::function<void()> task);
    void threadFinished();

    Ui::MainWindow* ui;

    vtkSmartPointer<vtkGenericOpenGLRenderWindow> m_renderWindow;
    vtkSmartPointer<vtkRenderer> m_renderer;
    vtkSmartPointer<vtkPointPicker> m_pointPicker;

    QVTKOpenGLNativeWidget* m_vtkWidget;
    QProgressBar* m_progressBar;
    QLabel* m_statusLabel;
    QTextEdit* m_logWidget;
    QListWidget* m_objectList;
    QListWidget* m_measurementList;
    QTreeWidget* m_fragmentTree;

    QComboBox* m_featureTypeCombo;
    QSpinBox* m_maxFeaturesSpin;
    QDoubleSpinBox* m_matchingRatioSpin;
    QDoubleSpinBox* m_voxelSizeSpin;
    QSpinBox* m_poissonDepthSpin;
    QComboBox* m_animTypeCombo;
    QDoubleSpinBox* m_animDurationSpin;

    QCheckBox* m_checkDownsample;
    QCheckBox* m_checkRemoveOutliers;
    QCheckBox* m_checkSmooth;

    std::vector<std::string> m_imagePaths;
    std::vector<cv::Mat> m_fossilImages;

    std::shared_ptr<SfMReconstructor> m_sfm;
    std::shared_ptr<PointCloudFilter> m_filter;
    std::shared_ptr<DenseReconstructor> m_dense;
    std::shared_ptr<SurfaceReconstructor> m_mesher;
    std::shared_ptr<TextureMapper> m_textureMapper;
    std::shared_ptr<CurveMeasurement> m_curveMeasure;
    std::shared_ptr<AngleMeasurement> m_angleMeasure;
    std::shared_ptr<VolumeMeasurement> m_volumeMeasure;
    std::shared_ptr<SymmetryAnalyzer> m_symmetryAnalyzer;
    std::shared_ptr<FossilRegistration> m_registration;
    std::shared_ptr<MeshExporter> m_exporter;
    std::shared_ptr<PDFReportGenerator> m_reportGenerator;
    std::shared_ptr<ViewpointAnimator> m_animator;
    std::shared_ptr<GrowthRingAnalyzer> m_ringAnalyzer;
    std::shared_ptr<BoneThicknessAnalyzer> m_thicknessAnalyzer;
    std::shared_ptr<SamplingPathPlanner> m_samplingPlanner;
    std::shared_ptr<PhylogeneticFeatureExtractor> m_phyloExtractor;
    std::shared_ptr<NexusExporter> m_nexusExporter;

    ThicknessResult m_thicknessResult;
    std::vector<DenseRegion> m_denseRegions;
    SamplingPlan m_samplingPlan;
    PhylogeneticDataset m_phyloDataset;

    PointCloudXYZRGB::Ptr m_sparseCloud;
    PointCloudData m_filteredCloud;
    pcl::PolygonMesh::Ptr m_mesh;
    MeshData m_texturedMesh;

    std::vector<PointCloudXYZRGB::Ptr> m_fragments;
    std::vector<Eigen::Matrix4d> m_fragmentTransforms;
    std::vector<MeasurementResult> m_measurements;

    std::vector<Eigen::Vector3d> m_pickedPoints;
    WorkflowState m_state;

    QMutex m_mutex;
    QThread* m_workerThread;
    QTimer* m_updateTimer;

    bool m_pointPickingMode;
    int m_measurementType;
};

}
