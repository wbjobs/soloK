#include "registration/FossilRegistration.h"
#include <pcl/common/transforms.h>
#include <pcl/registration/correspondence_estimation.h>

namespace Fossil3D {

FossilRegistration::FossilRegistration()
    : m_maxIterations(100)
    , m_transformationEpsilon(1e-8)
    , m_maxCorrespondenceDistance(0.05)
    , m_voxelGridSize(0.005) {
}

FossilRegistration::~FossilRegistration() {
}

void FossilRegistration::setMaxIterations(int iterations) {
    m_maxIterations = iterations;
}

void FossilRegistration::setTransformationEpsilon(double epsilon) {
    m_transformationEpsilon = epsilon;
}

void FossilRegistration::setMaxCorrespondenceDistance(double distance) {
    m_maxCorrespondenceDistance = distance;
}

void FossilRegistration::setVoxelGridSize(double size) {
    m_voxelGridSize = size;
}

void FossilRegistration::addManualCorrespondence(const Eigen::Vector3d& sourcePoint,
                                                   const Eigen::Vector3d& targetPoint) {
    CorrespondencePair pair;
    pair.sourcePoint = sourcePoint;
    pair.targetPoint = targetPoint;
    pair.weight = 1.0;
    m_manualCorrespondences.push_back(pair);
}

void FossilRegistration::clearManualCorrespondences() {
    m_manualCorrespondences.clear();
}

const std::vector<CorrespondencePair>& FossilRegistration::getManualCorrespondences() const {
    return m_manualCorrespondences;
}

Eigen::Matrix4d FossilRegistration::manualRegistration(const std::vector<CorrespondencePair>& correspondences) {
    Logger::info("Performing manual registration with " + 
                 std::to_string(correspondences.size()) + " correspondences");

    if (correspondences.size() < 3) {
        Logger::warning("Not enough correspondences for manual registration (need at least 3)");
        return Eigen::Matrix4d::Identity();
    }

    std::vector<Eigen::Vector3d> sourcePoints, targetPoints;
    for (const auto& pair : correspondences) {
        sourcePoints.push_back(pair.sourcePoint);
        targetPoints.push_back(pair.targetPoint);
    }

    return computeRigidTransform(sourcePoints, targetPoints);
}

Eigen::Matrix4d FossilRegistration::computeRigidTransform(const std::vector<Eigen::Vector3d>& source,
                                                             const std::vector<Eigen::Vector3d>& target) {
    if (source.size() != target.size() || source.empty()) {
        return Eigen::Matrix4d::Identity();
    }

    Eigen::Vector3d sourceCentroid = MathUtils::computeCentroid(source);
    Eigen::Vector3d targetCentroid = MathUtils::computeCentroid(target);

    Eigen::MatrixXd sourceCentered(3, source.size());
    Eigen::MatrixXd targetCentered(3, target.size());
    
    for (size_t i = 0; i < source.size(); ++i) {
        sourceCentered.col(i) = source[i] - sourceCentroid;
        targetCentered.col(i) = target[i] - targetCentroid;
    }

    Eigen::Matrix3d H = sourceCentered * targetCentered.transpose();
    Eigen::JacobiSVD<Eigen::Matrix3d> svd(H, Eigen::ComputeFullU | Eigen::ComputeFullV);
    Eigen::Matrix3d U = svd.matrixU();
    Eigen::Matrix3d V = svd.matrixV();
    Eigen::Matrix3d R = V * U.transpose();

    if (R.determinant() < 0) {
        V.col(2) *= -1;
        R = V * U.transpose();
    }

    Eigen::Vector3d t = targetCentroid - R * sourceCentroid;

    return MathUtils::createTransformationMatrix(R, t);
}

Eigen::Matrix4d FossilRegistration::automaticRegistration(PointCloudXYZRGB::ConstPtr source,
                                                             PointCloudXYZRGB::ConstPtr target,
                                                             const std::string& method) {
    Logger::info("Performing automatic registration using: " + method);
    Timer timer;

    PointCloudXYZ::Ptr sourceXYZ = PointCloudUtils::convertToXYZ(source);
    PointCloudXYZ::Ptr targetXYZ = PointCloudUtils::convertToXYZ(target);

    PointCloudXYZ::Ptr sourceDown(new PointCloudXYZ);
    PointCloudXYZ::Ptr targetDown(new PointCloudXYZ);
    
    pcl::VoxelGrid<pcl::PointXYZ> voxel;
    voxel.setLeafSize(m_voxelGridSize, m_voxelGridSize, m_voxelGridSize);
    voxel.setInputCloud(sourceXYZ);
    voxel.filter(*sourceDown);
    voxel.setInputCloud(targetXYZ);
    voxel.filter(*targetDown);

    Eigen::Matrix4d transform = Eigen::Matrix4d::Identity();

    if (method == "icp") {
        pcl::IterativeClosestPoint<pcl::PointXYZ, pcl::PointXYZ> icp;
        icp.setMaximumIterations(m_maxIterations);
        icp.setTransformationEpsilon(m_transformationEpsilon);
        icp.setMaxCorrespondenceDistance(m_maxCorrespondenceDistance);
        icp.setInputSource(sourceDown);
        icp.setInputTarget(targetDown);

        PointCloudXYZ aligned;
        icp.align(aligned);

        transform = icp.getFinalTransformation().cast<double>();
        
        Logger::info("ICP fitness score: " + std::to_string(icp.getFitnessScore()));
        Logger::info("ICP has converged: " + std::string(icp.hasConverged() ? "yes" : "no"));
    } else if (method == "ndt") {
        pcl::NormalDistributionsTransform<pcl::PointXYZ, pcl::PointXYZ> ndt;
        ndt.setMaximumIterations(m_maxIterations);
        ndt.setTransformationEpsilon(m_transformationEpsilon);
        ndt.setStepSize(0.1);
        ndt.setResolution(1.0);
        ndt.setInputSource(sourceDown);
        ndt.setInputTarget(targetDown);

        PointCloudXYZ aligned;
        ndt.align(aligned);

        transform = ndt.getFinalTransformation().cast<double>();
        
        Logger::info("NDT fitness score: " + std::to_string(ndt.getFitnessScore()));
    } else {
        Logger::error("Unknown registration method: " + method);
    }

    Logger::info("Automatic registration completed in " + timer.elapsedString());
    return transform;
}

pcl::PointCloud<pcl::FPFHSignature33>::Ptr FossilRegistration::computeFPFHFeatures(
    PointCloudXYZRGB::ConstPtr cloud, double normalRadius, double featureRadius) {
    
    PointCloudXYZ::Ptr xyzCloud = PointCloudUtils::convertToXYZ(cloud);

    pcl::search::KdTree<pcl::PointXYZ>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZ>);
    
    PointCloudNormal::Ptr normals(new PointCloudNormal);
    pcl::NormalEstimation<pcl::PointXYZ, pcl::Normal> ne;
    ne.setInputCloud(xyzCloud);
    ne.setSearchMethod(tree);
    ne.setRadiusSearch(normalRadius);
    ne.compute(*normals);

    pcl::FPFHEstimation<pcl::PointXYZ, pcl::Normal, pcl::FPFHSignature33> fpfh;
    fpfh.setInputCloud(xyzCloud);
    fpfh.setInputNormals(normals);
    fpfh.setSearchMethod(tree);
    fpfh.setRadiusSearch(featureRadius);

    pcl::PointCloud<pcl::FPFHSignature33>::Ptr features(new pcl::PointCloud<pcl::FPFHSignature33>);
    fpfh.compute(*features);

    return features;
}

Eigen::Matrix4d FossilRegistration::curvatureBasedRegistration(PointCloudXYZRGB::ConstPtr source,
                                                                  PointCloudXYZRGB::ConstPtr target) {
    Logger::info("Performing curvature-based registration...");
    Timer timer;

    double cloudDiameter = PointCloudUtils::computeCloudDiameter(source);
    double normalRadius = 0.02 * cloudDiameter;
    double featureRadius = 0.05 * cloudDiameter;

    auto sourceFeatures = computeFPFHFeatures(source, normalRadius, featureRadius);
    auto targetFeatures = computeFPFHFeatures(target, normalRadius, featureRadius);

    PointCloudXYZ::Ptr sourceXYZ = PointCloudUtils::convertToXYZ(source);
    PointCloudXYZ::Ptr targetXYZ = PointCloudUtils::convertToXYZ(target);

    pcl::SampleConsensusInitialAlignment<pcl::PointXYZ, pcl::PointXYZ, pcl::FPFHSignature33> sac_ia;
    sac_ia.setMaximumIterations(m_maxIterations);
    sac_ia.setNumberOfSamples(5);
    sac_ia.setCorrespondenceRandomness(10);
    sac_ia.setInputSource(sourceXYZ);
    sac_ia.setSourceFeatures(sourceFeatures);
    sac_ia.setInputTarget(targetXYZ);
    sac_ia.setTargetFeatures(targetFeatures);

    PointCloudXYZ aligned;
    sac_ia.align(aligned);

    Eigen::Matrix4d initialTransform = sac_ia.getFinalTransformation().cast<double>();

    Logger::info("Initial SAC-IA fitness: " + std::to_string(sac_ia.getFitnessScore()));
    Logger::info("Refining with ICP...");

    PointCloudXYZRGB::Ptr sourceAligned = transformCloud(source, initialTransform);
    Eigen::Matrix4d refineTransform = automaticRegistration(sourceAligned, target, "icp");

    Eigen::Matrix4d finalTransform = refineTransform * initialTransform;

    Logger::info("Curvature-based registration completed in " + timer.elapsedString());
    return finalTransform;
}

PointCloudXYZRGB::Ptr FossilRegistration::transformCloud(PointCloudXYZRGB::ConstPtr cloud,
                                                           const Eigen::Matrix4d& transform) {
    PointCloudXYZRGB::Ptr transformed(new PointCloudXYZRGB);
    pcl::transformPointCloud(*cloud, *transformed, transform);
    return transformed;
}

pcl::PolygonMesh::Ptr FossilRegistration::transformMesh(pcl::PolygonMesh::ConstPtr mesh,
                                                          const Eigen::Matrix4d& transform) {
    PointCloudXYZRGB::Ptr vertices(new PointCloudXYZRGB);
    pcl::fromPCLPointCloud2(mesh->cloud, *vertices);

    PointCloudXYZRGB::Ptr transformedVertices = transformCloud(vertices, transform);

    pcl::PolygonMesh::Ptr transformedMesh(new pcl::PolygonMesh(*mesh));
    pcl::toPCLPointCloud2(*transformedVertices, transformedMesh->cloud);

    return transformedMesh;
}

PointCloudXYZRGB::Ptr FossilRegistration::fusePointClouds(const std::vector<PointCloudXYZRGB::Ptr>& clouds,
                                                             const std::vector<Eigen::Matrix4d>& transforms) {
    Logger::info("Fusing " + std::to_string(clouds.size()) + " point clouds...");
    Timer timer;

    PointCloudXYZRGB::Ptr fused(new PointCloudXYZRGB);

    for (size_t i = 0; i < clouds.size(); ++i) {
        if (i < transforms.size()) {
            PointCloudXYZRGB::Ptr transformed = transformCloud(clouds[i], transforms[i]);
            *fused += *transformed;
        } else {
            *fused += *clouds[i];
        }
    }

    fused->width = fused->size();
    fused->height = 1;
    fused->is_dense = false;

    Logger::info("Fused point cloud has " + std::to_string(fused->size()) + " points");
    Logger::info("Fusion completed in " + timer.elapsedString());

    return fused;
}

double FossilRegistration::computeFitnessScore(PointCloudXYZRGB::ConstPtr source,
                                                 PointCloudXYZRGB::ConstPtr target,
                                                 double maxDistance) {
    PointCloudXYZ::Ptr sourceXYZ = PointCloudUtils::convertToXYZ(source);
    PointCloudXYZ::Ptr targetXYZ = PointCloudUtils::convertToXYZ(target);

    pcl::registration::CorrespondenceEstimation<pcl::PointXYZ, pcl::PointXYZ> ce;
    ce.setInputSource(sourceXYZ);
    ce.setInputTarget(targetXYZ);

    pcl::Correspondences correspondences;
    ce.determineCorrespondences(correspondences, maxDistance);

    double score = 0.0;
    int count = 0;
    for (const auto& corr : correspondences) {
        score += corr.distance;
        count++;
    }

    return count > 0 ? score / count : std::numeric_limits<double>::max();
}

}
