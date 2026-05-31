#include "GeologicalModel.h"
#include <cmath>
#include <QDebug>

GeologicalModel::GeologicalModel()
    : m_width(20.0)
    , m_height(15.0)
    , m_depth(50.0)
    , m_resX(40)
    , m_resY(30)
    , m_resZ(100)
{
    generateVoxels();
    generateTunnelOutline();

    m_cutPlanes[0].normal = QVector3D(1, 0, 0);
    m_cutPlanes[0].axis = 0;
    m_cutPlanes[1].normal = QVector3D(0, 1, 0);
    m_cutPlanes[1].axis = 1;
    m_cutPlanes[2].normal = QVector3D(0, 0, 1);
    m_cutPlanes[2].axis = 2;
}

void GeologicalModel::setDimensions(double width, double height, double depth)
{
    m_width = width;
    m_height = height;
    m_depth = depth;
    generateVoxels();
    generateTunnelOutline();
}

QVector3D GeologicalModel::dimensions() const
{
    return QVector3D(m_width, m_height, m_depth);
}

void GeologicalModel::setVoxelResolution(int x, int y, int z)
{
    m_resX = x;
    m_resY = y;
    m_resZ = z;
    generateVoxels();
}

QVector3D GeologicalModel::voxelResolution() const
{
    return QVector3D(m_resX, m_resY, m_resZ);
}

void GeologicalModel::buildFromAnomalies(const std::vector<AnomalyRegion>& anomalies,
                                          const TEMProfile& temProfile)
{
    generateVoxels();

    double voxelSizeX = m_width / m_resX;
    double voxelSizeY = m_height / m_resY;
    double voxelSizeZ = m_depth / m_resZ;

    for (int z = 0; z < m_resZ; ++z) {
        for (int y = 0; y < m_resY; ++y) {
            for (int x = 0; x < m_resX; ++x) {
                int idx = z * m_resY * m_resX + y * m_resX + x;
                if (idx >= m_voxels.size()) continue;

                double worldX = (x - m_resX / 2.0) * voxelSizeX;
                double worldY = (y - m_resY / 2.0) * voxelSizeY;
                double worldZ = z * voxelSizeZ;

                double tempProb = 0;
                for (const auto& anomaly : anomalies) {
                    ThreeDPosition pos = anomaly.threeDPosition();
                    double dist = sqrt(
                        pow(worldX - pos.x, 2) +
                        pow(worldY - pos.y, 2) +
                        pow(worldZ - pos.z, 2)
                    );

                    double influenceRadius = 5.0;
                    if (dist < influenceRadius) {
                        double prob = (anomaly.waterProbability() == WaterProbability::High) ? 0.9 :
                                     (anomaly.waterProbability() == WaterProbability::Medium) ? 0.6 :
                                     (anomaly.waterProbability() == WaterProbability::Low) ? 0.3 : 0.1;
                        tempProb = std::max(tempProb, prob * (1 - dist / influenceRadius));
                    }
                }

                double resProb = 0;
                if (temProfile.isValid()) {
                    double stationX = worldX + m_width / 2.0;
                    double resistivity = temProfile.getResistivityAt(stationX, worldZ);
                    if (resistivity > 0) {
                        double normalizedRes = 1.0 - std::min(1.0, resistivity / 50.0);
                        resProb = normalizedRes * 0.5;
                    }
                }

                m_voxels[idx].waterProbability = 0.7 * tempProb + 0.3 * resProb;
                m_voxels[idx].isWater = (m_voxels[idx].waterProbability > 0.4);
            }
        }
    }

    updateWaterBodies(0.5);
}

void GeologicalModel::updateWaterBodies(double confidenceThreshold)
{
    m_waterBodies.clear();

    QVector<bool> visited(m_voxels.size(), false);
    double voxelSizeX = m_width / m_resX;
    double voxelSizeY = m_height / m_resY;
    double voxelSizeZ = m_depth / m_resZ;

    for (int z = 0; z < m_resZ; ++z) {
        for (int y = 0; y < m_resY; ++y) {
            for (int x = 0; x < m_resX; ++x) {
                int idx = z * m_resY * m_resX + y * m_resX + x;
                if (idx >= m_voxels.size() || visited[idx]) continue;

                if (m_voxels[idx].waterProbability >= confidenceThreshold) {
                    QVector<int> component;
                    QVector<int> stack;
                    stack.push_back(idx);

                    while (!stack.isEmpty()) {
                        int current = stack.last();
                        stack.removeLast();
                        if (visited[current]) continue;
                        visited[current] = true;

                        if (m_voxels[current].waterProbability >= confidenceThreshold) {
                            component.push_back(current);

                            int cx = (current % (m_resY * m_resX)) % m_resX;
                            int cy = (current % (m_resY * m_resX)) / m_resX;
                            int cz = current / (m_resY * m_resX);

                            if (cx > 0) stack.push_back(current - 1);
                            if (cx < m_resX - 1) stack.push_back(current + 1);
                            if (cy > 0) stack.push_back(current - m_resX);
                            if (cy < m_resY - 1) stack.push_back(current + m_resX);
                            if (cz > 0) stack.push_back(current - m_resY * m_resX);
                            if (cz < m_resZ - 1) stack.push_back(current + m_resY * m_resX);
                        }
                    }

                    if (component.size() >= 8) {
                        WaterBody body = createWaterBodyFromVoxels(component);
                        if (body.vertices.size() > 0) {
                            m_waterBodies.push_back(body);
                        }
                    }
                }
            }
        }
    }
}

WaterBody GeologicalModel::createWaterBodyFromVoxels(const QVector<int>& voxelIndices)
{
    WaterBody body;

    if (voxelIndices.isEmpty()) return body;

    double voxelSizeX = m_width / m_resX;
    double voxelSizeY = m_height / m_resY;
    double voxelSizeZ = m_depth / m_resZ;

    QVector3D sumCenter(0, 0, 0);
    double sumConfidence = 0;

    for (int vi : voxelIndices) {
        int cx = (vi % (m_resY * m_resX)) % m_resX;
        int cy = (vi % (m_resY * m_resX)) / m_resX;
        int cz = vi / (m_resY * m_resX);

        double wx = (cx - m_resX / 2.0) * voxelSizeX;
        double wy = (cy - m_resY / 2.0) * voxelSizeY;
        double wz = cz * voxelSizeZ;

        sumCenter += QVector3D(wx, wy, wz);
        sumConfidence += m_voxels[vi].waterProbability;

        QVector3D v1(wx - voxelSizeX/2, wy - voxelSizeY/2, wz - voxelSizeZ/2);
        QVector3D v2(wx + voxelSizeX/2, wy - voxelSizeY/2, wz - voxelSizeZ/2);
        QVector3D v3(wx + voxelSizeX/2, wy + voxelSizeY/2, wz - voxelSizeZ/2);
        QVector3D v4(wx - voxelSizeX/2, wy + voxelSizeY/2, wz - voxelSizeZ/2);
        QVector3D v5(wx - voxelSizeX/2, wy - voxelSizeY/2, wz + voxelSizeZ/2);
        QVector3D v6(wx + voxelSizeX/2, wy - voxelSizeY/2, wz + voxelSizeZ/2);
        QVector3D v7(wx + voxelSizeX/2, wy + voxelSizeY/2, wz + voxelSizeZ/2);
        QVector3D v8(wx - voxelSizeX/2, wy + voxelSizeY/2, wz + voxelSizeZ/2);

        int baseIndex = body.vertices.size();
        body.vertices << v1 << v2 << v3 << v4 << v5 << v6 << v7 << v8;

        body.indices << baseIndex+0 << baseIndex+1 << baseIndex+2 << baseIndex+0 << baseIndex+2 << baseIndex+3;
        body.indices << baseIndex+4 << baseIndex+6 << baseIndex+5 << baseIndex+4 << baseIndex+7 << baseIndex+6;
        body.indices << baseIndex+0 << baseIndex+4 << baseIndex+5 << baseIndex+0 << baseIndex+5 << baseIndex+1;
        body.indices << baseIndex+2 << baseIndex+6 << baseIndex+7 << baseIndex+2 << baseIndex+7 << baseIndex+3;
        body.indices << baseIndex+1 << baseIndex+5 << baseIndex+6 << baseIndex+1 << baseIndex+6 << baseIndex+2;
        body.indices << baseIndex+0 << baseIndex+3 << baseIndex+7 << baseIndex+0 << baseIndex+7 << baseIndex+4;
    }

    body.center = sumCenter / voxelIndices.size();
    body.confidence = sumConfidence / voxelIndices.size();

    if (body.confidence > 0.7) {
        body.color = QColor(255, 50, 50, 120);
    } else if (body.confidence > 0.5) {
        body.color = QColor(255, 150, 50, 100);
    } else {
        body.color = QColor(255, 200, 100, 80);
    }

    return body;
}

QVector<WaterBody> GeologicalModel::waterBodies() const
{
    return m_waterBodies;
}

QVector<Voxel> GeologicalModel::voxels() const
{
    return m_voxels;
}

QVector<QVector3D> GeologicalModel::tunnelOutline() const
{
    return m_tunnelOutline;
}

CutPlane& GeologicalModel::cutPlane(int index)
{
    if (index >= 0 && index < 3) {
        return m_cutPlanes[index];
    }
    return m_cutPlanes[0];
}

void GeologicalModel::setCutPlane(int index, const CutPlane& plane)
{
    if (index >= 0 && index < 3) {
        m_cutPlanes[index] = plane;
    }
}

bool GeologicalModel::isPointCutByPlane(const QVector3D& point, int planeIndex) const
{
    if (planeIndex < 0 || planeIndex >= 3) return false;
    if (!m_cutPlanes[planeIndex].enabled) return false;

    QVector3D diff = point - m_cutPlanes[planeIndex].origin;
    return QVector3D::dotProduct(diff, m_cutPlanes[planeIndex].normal) > 0;
}

void GeologicalModel::clear()
{
    m_voxels.clear();
    m_waterBodies.clear();
    generateVoxels();
}

void GeologicalModel::generateVoxels()
{
    m_voxels.clear();
    m_voxels.reserve(m_resX * m_resY * m_resZ);

    double voxelSizeX = m_width / m_resX;
    double voxelSizeY = m_height / m_resY;
    double voxelSizeZ = m_depth / m_resZ;

    for (int z = 0; z < m_resZ; ++z) {
        for (int y = 0; y < m_resY; ++y) {
            for (int x = 0; x < m_resX; ++x) {
                Voxel v;
                v.position = QVector3D(
                    (x - m_resX / 2.0) * voxelSizeX,
                    (y - m_resY / 2.0) * voxelSizeY,
                    z * voxelSizeZ
                );
                v.size = QVector3D(voxelSizeX, voxelSizeY, voxelSizeZ);
                m_voxels.push_back(v);
            }
        }
    }
}

void GeologicalModel::generateTunnelOutline()
{
    m_tunnelOutline.clear();

    double tunnelWidth = 10.0;
    double tunnelHeight = 8.0;

    for (double z = 0; z <= m_depth; z += 1.0) {
        int segments = 20;
        for (int i = 0; i <= segments; ++i) {
            double angle = (double)i / segments * M_PI * 2;
            double x = cos(angle) * tunnelWidth / 2;
            double y = sin(angle) * tunnelHeight / 2;
            m_tunnelOutline.append(QVector3D(x, y, z));
        }
    }
}
