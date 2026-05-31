#ifndef GEOLOGICALMODEL_H
#define GEOLOGICALMODEL_H

#include "ThreeDPosition.h"
#include "AnomalyRegion.h"
#include <QVector>
#include <QVector3D>
#include <QMatrix4x4>
#include <QColor>

struct Voxel {
    QVector3D position;
    QVector3D size;
    double waterProbability;
    double temperature;
    double resistivity;
    bool isWater;

    Voxel()
        : position(0, 0, 0)
        , size(1, 1, 1)
        , waterProbability(0)
        , temperature(25)
        , resistivity(100)
        , isWater(false)
    {}
};

struct WaterBody {
    QVector3D center;
    QVector3D size;
    QVector<QVector3D> vertices;
    QVector<unsigned int> indices;
    double confidence;
    QColor color;

    WaterBody()
        : center(0, 0, 0)
        , size(0, 0, 0)
        , confidence(0)
        , color(255, 0, 0, 100)
    {}
};

struct CutPlane {
    QVector3D origin;
    QVector3D normal;
    bool enabled;
    int axis;

    CutPlane()
        : origin(0, 0, 0)
        , normal(1, 0, 0)
        , enabled(false)
        , axis(0)
    {}
};

class GeologicalModel {
public:
    GeologicalModel();

    void setDimensions(double width, double height, double depth);
    QVector3D dimensions() const;

    void setVoxelResolution(int x, int y, int z);
    QVector3D voxelResolution() const;

    void buildFromAnomalies(const std::vector<AnomalyRegion>& anomalies,
                            const TEMProfile& temProfile);

    void updateWaterBodies(double confidenceThreshold);

    QVector<WaterBody> waterBodies() const;
    QVector<Voxel> voxels() const;

    QVector<QVector3D> tunnelOutline() const;

    CutPlane& cutPlane(int index);
    void setCutPlane(int index, const CutPlane& plane);

    bool isPointCutByPlane(const QVector3D& point, int planeIndex) const;

    void clear();

private:
    void generateVoxels();
    void generateTunnelOutline();
    WaterBody createWaterBodyFromVoxels(const QVector<int>& voxelIndices);

    double m_width;
    double m_height;
    double m_depth;
    int m_resX;
    int m_resY;
    int m_resZ;

    QVector<Voxel> m_voxels;
    QVector<WaterBody> m_waterBodies;
    QVector<QVector3D> m_tunnelOutline;
    CutPlane m_cutPlanes[3];
};

#endif
