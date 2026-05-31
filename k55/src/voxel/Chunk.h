#pragma once
#include "Voxel.h"
#include "../math/Vec3.h"
#include "../math/Frustum.h"
#include <array>
#include <vector>
#include <memory>

constexpr int CHUNK_SIZE = 16;
constexpr int CHUNK_HEIGHT = 16;
constexpr int CHUNK_SIZE_SQ = CHUNK_SIZE * CHUNK_SIZE;
constexpr int CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

struct Vertex {
    Vec3 position;
    Vec3 normal;
    Vec3 color;
    Vec2 uv;

    Vertex() = default;
    Vertex(const Vec3& p, const Vec3& n, const Vec3& c, const Vec2& u)
        : position(p), normal(n), color(c), uv(u) {}
};

enum class LODLevel {
    LOD0 = 0,
    LOD1 = 1,
    LOD2 = 2,
    COUNT = 3
};

struct MeshData {
    std::vector<Vertex> vertices;
    std::vector<uint32_t> indices;
    size_t vertexCount() const { return vertices.size(); }
    size_t indexCount() const { return indices.size(); }
    bool empty() const { return vertices.empty(); }
    void clear() { vertices.clear(); indices.clear(); }
};

class Chunk {
public:
    IVec3 position;
    bool dirty = true;
    bool meshed = false;
    uint64_t meshVersion = 0;

    Chunk() : position(0, 0, 0) {
        voxels.fill(Voxel(VoxelType::AIR));
    }

    explicit Chunk(const IVec3& pos) : position(pos) {
        voxels.fill(Voxel(VoxelType::AIR));
    }

    const Voxel& getVoxel(int x, int y, int z) const {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            static Voxel air(VoxelType::AIR);
            return air;
        }
        return voxels[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
    }

    Voxel& getVoxel(int x, int y, int z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            static Voxel air(VoxelType::AIR);
            return air;
        }
        return voxels[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
    }

    void setVoxel(int x, int y, int z, VoxelType type) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
        voxels[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = Voxel(type);
        dirty = true;
    }

    bool isFaceVisible(int x, int y, int z, const Vec3& dir,
                       Chunk* left, Chunk* right,
                       Chunk* front, Chunk* back,
                       Chunk* top, Chunk* bottom) const {
        int nx = x + static_cast<int>(dir.x);
        int ny = y + static_cast<int>(dir.y);
        int nz = z + static_cast<int>(dir.z);

        const Voxel* neighbor = nullptr;

        if (nx < 0 && left) neighbor = &left->getVoxel(CHUNK_SIZE - 1, y, z);
        else if (nx >= CHUNK_SIZE && right) neighbor = &right->getVoxel(0, y, z);
        else if (ny < 0 && bottom) neighbor = &bottom->getVoxel(x, CHUNK_HEIGHT - 1, z);
        else if (ny >= CHUNK_HEIGHT && top) neighbor = &top->getVoxel(x, 0, z);
        else if (nz < 0 && front) neighbor = &front->getVoxel(x, y, CHUNK_SIZE - 1);
        else if (nz >= CHUNK_SIZE && back) neighbor = &back->getVoxel(x, y, 0);
        else if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT && nz >= 0 && nz < CHUNK_SIZE)
            neighbor = &getVoxel(nx, ny, nz);

        const Voxel& current = getVoxel(x, y, z);
        if (!neighbor) return true;
        if (neighbor->type == VoxelType::AIR) return true;
        if (neighbor->isTransparent()) return true;
        if (current.isTransparent() && neighbor->type != current.type) return true;
        return false;
    }

    AABB getBoundingBox() const {
        Vec3 worldMin(static_cast<float>(position.x * CHUNK_SIZE),
                      static_cast<float>(position.y * CHUNK_HEIGHT),
                      static_cast<float>(position.z * CHUNK_SIZE));
        Vec3 worldMax = worldMin + Vec3(static_cast<float>(CHUNK_SIZE),
                                        static_cast<float>(CHUNK_HEIGHT),
                                        static_cast<float>(CHUNK_SIZE));
        return AABB(worldMin, worldMax);
    }

    Vec3 getWorldCenter() const {
        return Vec3(
            static_cast<float>(position.x * CHUNK_SIZE + CHUNK_SIZE / 2.0f),
            static_cast<float>(position.y * CHUNK_HEIGHT + CHUNK_HEIGHT / 2.0f),
            static_cast<float>(position.z * CHUNK_SIZE + CHUNK_SIZE / 2.0f)
        );
    }

    float distanceTo(const Vec3& point) const {
        return (getWorldCenter() - point).length();
    }

    void clearMeshes() {
        for (auto& mesh : meshes) {
            mesh.clear();
        }
        meshed = false;
    }

    MeshData& getMesh(LODLevel lod) {
        return meshes[static_cast<int>(lod)];
    }

    const MeshData& getMesh(LODLevel lod) const {
        return meshes[static_cast<int>(lod)];
    }

private:
    std::array<Voxel, CHUNK_VOLUME> voxels;
    std::array<MeshData, static_cast<int>(LODLevel::COUNT)> meshes;
};
