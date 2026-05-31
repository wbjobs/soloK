#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <pcl/PolygonMesh.h>
#include <Eigen/Geometry>
#include <vector>
#include <map>
#include <string>
#include <memory>

namespace Fossil3D {

struct PhylogeneticFeature {
    std::string name;
    std::string description;
    double value;
    std::string unit;
    std::string category;
    bool isDiscrete;
    int discreteState;
    int numStates;
    double uncertainty;
};

struct PhylogeneticDataset {
    std::string taxonName;
    std::string specimenID;
    std::vector<PhylogeneticFeature> features;
    std::map<std::string, double> featureMap;
    Eigen::Vector3d centroid;
    Eigen::Matrix3d principalAxes;
    Eigen::Vector3d axisLengths;
};

class PhylogeneticFeatureExtractor {
public:
PhylogeneticFeatureExtractor();
~PhylogeneticFeatureExtractor();

void setLandmarkPrecision(double precision);
void setCurvatureRadius(double radius);

PhylogeneticDataset extractAllFeatures(PointCloudXYZRGB::ConstPtr cloud,
                                         pcl::PolygonMesh::ConstPtr mesh = nullptr,
                                         const std::string& taxonName = "Unknown",
                                         const std::string& specimenID = "SP-001");

std::vector<PhylogeneticFeature> extractSizeFeatures(PointCloudXYZRGB::ConstPtr cloud);
std::vector<PhylogeneticFeature> extractShapeFeatures(PointCloudXYZRGB::ConstPtr cloud);
std::vector<PhylogeneticFeature> extractProportionFeatures(PointCloudXYZRGB::ConstPtr cloud);
std::vector<PhylogeneticFeature> extractSurfaceFeatures(PointCloudXYZRGB::ConstPtr cloud);
std::vector<PhylogeneticFeature> extractMorphologicalFeatures(PointCloudXYZRGB::ConstPtr cloud);

double computeFeature(const std::string& featureName,
                       PointCloudXYZRGB::ConstPtr cloud,
                       pcl::PolygonMesh::ConstPtr mesh = nullptr);

std::vector<std::string> getAvailableFeatures() const;
std::string getFeatureDescription(const std::string& name) const;

private:
double m_landmarkPrecision;
double m_curvatureRadius;

Eigen::Matrix3d computePrincipalAxes(PointCloudXYZRGB::ConstPtr cloud,
                                      Eigen::Vector3d& lengths);

double computeBoundingBoxVolume(PointCloudXYZRGB::ConstPtr cloud);
double computeConvexHullVolumePC(PointCloudXYZRGB::ConstPtr cloud);
double computeSurfaceArea(PointCloudXYZRGB::ConstPtr cloud);
double computeSphericity(PointCloudXYZRGB::ConstPtr cloud);
double computeElongation(PointCloudXYZRGB::ConstPtr cloud);
double computeFlatness(PointCloudXYZRGB::ConstPtr cloud);
double computeCompactness(PointCloudXYZRGB::ConstPtr cloud);
double computeAspectRatio(PointCloudXYZRGB::ConstPtr cloud);
double computeRobusticityIndex(PointCloudXYZRGB::ConstPtr cloud);

double computeMeanCurvature(PointCloudXYZRGB::ConstPtr cloud);
double computeGaussianCurvature(PointCloudXYZRGB::ConstPtr cloud);
double computeRoughnessIndex(PointCloudXYZRGB::ConstPtr cloud);
double computeFeatureComplexity(PointCloudXYZRGB::ConstPtr cloud);

double computeMaxLength(PointCloudXYZRGB::ConstPtr cloud);
double computeMaxWidth(PointCloudXYZRGB::ConstPtr cloud);
double computeMaxHeight(PointCloudXYZRGB::ConstPtr cloud);
double computeDiagonalLength(PointCloudXYZRGB::ConstPtr cloud);

double computeCentroidOffset(PointCloudXYZRGB::ConstPtr cloud);
double computeSymmetryIndex(PointCloudXYZRGB::ConstPtr cloud);
double computePCAVarianceRatio(PointCloudXYZRGB::ConstPtr cloud);

double computeDensityIndex(PointCloudXYZRGB::ConstPtr cloud);
double computePointDistributionEntropy(PointCloudXYZRGB::ConstPtr cloud);

double computeCranialCapacity(PointCloudXYZRGB::ConstPtr cloud);
double computeFacialLength(PointCloudXYZRGB::ConstPtr cloud);
double computeSkullWidthIndex(PointCloudXYZRGB::ConstPtr cloud);
double computeOrbitalIndex(PointCloudXYZRGB::ConstPtr cloud);
double computeNasalIndex(PointCloudXYZRGB::ConstPtr cloud);
double computePalatalIndex(PointCloudXYZRGB::ConstPtr cloud);
double computeMandibularAngle(PointCloudXYZRGB::ConstPtr cloud);
double computeCranialBaseAngle(PointCloudXYZRGB::ConstPtr cloud);
double computeForamenMagnumIndex(PointCloudXYZRGB::ConstPtr cloud);
double computeBrowRidgeProjection(PointCloudXYZRGB::ConstPtr cloud);
double computeZygomaticWidth(PointCloudXYZRGB::ConstPtr cloud);
double computeInterorbitalDistance(PointCloudXYZRGB::ConstPtr cloud);
double computeFacialPrognathism(PointCloudXYZRGB::ConstPtr cloud);
double computeCranialVaultHeight(PointCloudXYZRGB::ConstPtr cloud);
double computePostorbitalConstriction(PointCloudXYZRGB::ConstPtr cloud);
double computeOccipitalCondyleWidth(PointCloudXYZRGB::ConstPtr cloud);
double computeBasilarLength(PointCloudXYZRGB::ConstPtr cloud);
double computeNasionProsthionLength(PointCloudXYZRGB::ConstPtr cloud);
double computeBasionNasionLength(PointCloudXYZRGB::ConstPtr cloud);
double computeBasionProsthionLength(PointCloudXYZRGB::ConstPtr cloud);
double computeNasionBasionAngle(PointCloudXYZRGB::ConstPtr cloud);
double computeNasionSellaAngle(PointCloudXYZRGB::ConstPtr cloud);
double computeSellaNasionBasionAngle(PointCloudXYZRGB::ConstPtr cloud);
double computeMaxillaryProtrusion(PointCloudXYZRGB::ConstPtr cloud);
double computeMandibularLength(PointCloudXYZRGB::ConstPtr cloud);
double computeRamusHeight(PointCloudXYZRGB::ConstPtr cloud);
double computeCoronoidHeight(PointCloudXYZRGB::ConstPtr cloud);
double computeGonialAngle(PointCloudXYZRGB::ConstPtr cloud);
double computeBigonialWidth(PointCloudXYZRGB::ConstPtr cloud);
double computeMentalForamenPosition(PointCloudXYZRGB::ConstPtr cloud);
double computeSymphysealHeight(PointCloudXYZRGB::ConstPtr cloud);
double computeSymphysealThickness(PointCloudXYZRGB::ConstPtr cloud);
double computeCorpusLength(PointCloudXYZRGB::ConstPtr cloud);
double computeCorpusHeight(PointCloudXYZRGB::ConstPtr cloud);
double computeCorpusThickness(PointCloudXYZRGB::ConstPtr cloud);
double computeAscendingRamusWidth(PointCloudXYZRGB::ConstPtr cloud);
double computeCondyleWidth(PointCloudXYZRGB::ConstPtr cloud);
double computeMandibularNotchDepth(PointCloudXYZRGB::ConstPtr cloud);

int discretizeFeature(double value, double min, double max, int numStates);
void addFeature(std::vector<PhylogeneticFeature>& features,
                 const std::string& name,
                 const std::string& description,
                 double value,
                 const std::string& unit,
                 const std::string& category,
                 double uncertainty = 0.0,
                 bool isDiscrete = false,
                 int numStates = 3);
};

}
