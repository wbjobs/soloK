#pragma once
#include "Chunk.h"
#include "PerlinNoise.h"
#include "../math/Frustum.h"
#include <unordered_map>
#include <memory>
#include <vector>
#include <queue>
#include <mutex>
#include <atomic>

struct RenderChunk {
    Chunk* chunk;
    LODLevel lod;
    float distance;
    bool visible;
};

class ChunkManager {
public:
    ChunkManager(int renderDistance = 8, unsigned int seed = 12345)
        : renderDistance(renderDistance), noise(seed) {}

    void generateTerrain(int worldSize = 32);

    Chunk* getChunk(const IVec3& pos) {
        auto it = chunks.find(pos);
        if (it != chunks.end()) return it->second.get();
        return nullptr;
    }

    const Chunk* getChunk(const IVec3& pos) const {
        auto it = chunks.find(pos);
        if (it != chunks.end()) return it->second.get();
        return nullptr;
    }

    VoxelType getVoxelWorld(int x, int y, int z) const;
    void setVoxelWorld(int x, int y, int z, VoxelType type);

    void regenerateChunkMesh(Chunk& chunk);
    void regenerateDirtyMeshes();

    std::vector<RenderChunk> getVisibleChunks(const Frustum& frustum, const Vec3& cameraPos);

    void setRenderDistance(int distance) { renderDistance = distance; }
    int getRenderDistance() const { return renderDistance; }

    void updateVoxel(int worldX, int worldY, int worldZ, VoxelType type);

    size_t getTotalChunkCount() const { return chunks.size(); }

    LODLevel determineLOD(const Chunk& chunk, const Vec3& cameraPos) const;

private:
    int renderDistance;
    PerlinNoise noise;
    std::unordered_map<IVec3, std::unique_ptr<Chunk>> chunks;
    std::mutex chunkMutex;

    void generateChunkTerrain(Chunk& chunk);

    void generateMeshForLOD(Chunk& chunk, LODLevel lod,
                            Chunk* left, Chunk* right,
                            Chunk* front, Chunk* back,
                            Chunk* top, Chunk* bottom);

    void addFace(MeshData& mesh, const Vec3& pos, const Vec3& dir, const Vec3& color, int voxelStep);

    float getHeight(float x, float z) const;
    VoxelType getVoxelTypeForHeight(int y, int height, float moisture);

    static const std::array<Vec3, 6> faceDirections;
    static const std::array<std::array<Vec3, 4>, 6> faceVertices;
    static const std::array<uint32_t, 6> faceIndices;
};
