#include "ChunkManager.h"
#include <algorithm>
#include <cmath>

const std::array<Vec3, 6> ChunkManager::faceDirections = {{
    Vec3( 1,  0,  0),
    Vec3(-1,  0,  0),
    Vec3( 0,  1,  0),
    Vec3( 0, -1,  0),
    Vec3( 0,  0,  1),
    Vec3( 0,  0, -1),
}};

const std::array<std::array<Vec3, 4>, 6> ChunkManager::faceVertices = {{
    {{ Vec3(1, 1, 1), Vec3(1, 0, 1), Vec3(1, 0, 0), Vec3(1, 1, 0) }},
    {{ Vec3(0, 1, 0), Vec3(0, 0, 0), Vec3(0, 0, 1), Vec3(0, 1, 1) }},
    {{ Vec3(0, 1, 1), Vec3(0, 1, 0), Vec3(1, 1, 0), Vec3(1, 1, 1) }},
    {{ Vec3(0, 0, 0), Vec3(0, 0, 1), Vec3(1, 0, 1), Vec3(1, 0, 0) }},
    {{ Vec3(1, 0, 1), Vec3(0, 0, 1), Vec3(0, 1, 1), Vec3(1, 1, 1) }},
    {{ Vec3(0, 0, 0), Vec3(1, 0, 0), Vec3(1, 1, 0), Vec3(0, 1, 0) }},
}};

const std::array<uint32_t, 6> ChunkManager::faceIndices = { 0, 1, 2, 0, 2, 3 };

float ChunkManager::getHeight(float x, float z) const {
    float height = 0.0f;
    height += noise.fbm(x * 0.015f, z * 0.015f, 6, 0.5f, 2.0f) * 30.0f;
    height += noise.ridgedMulti(x * 0.04f, z * 0.04f, 4, 0.5f, 2.1f) * 12.0f;
    height += noise.noise2D(x * 0.1f, z * 0.1f) * 3.0f;
    return height;
}

VoxelType ChunkManager::getVoxelTypeForHeight(int y, int height, float moisture) {
    if (y == 0) return VoxelType::BEDROCK;
    if (y > height) return VoxelType::AIR;
    if (y < height - 4) return VoxelType::STONE;
    if (y == height) {
        if (y > 28) return VoxelType::SNOW;
        if (moisture > 0.6f) return VoxelType::GRASS;
        if (moisture < 0.25f) return VoxelType::SAND;
        return VoxelType::GRASS;
    }
    if (y > height - 4) {
        if (y > 28) return VoxelType::SNOW;
        if (moisture < 0.25f && y > height - 2) return VoxelType::SAND;
        return VoxelType::DIRT;
    }
    return VoxelType::STONE;
}

void ChunkManager::generateTerrain(int worldSize) {
    chunks.clear();
    int halfSize = worldSize / 2;

    for (int cx = -halfSize; cx < halfSize; cx++) {
        for (int cz = -halfSize; cz < halfSize; cz++) {
            for (int cy = 0; cy < 4; cy++) {
                IVec3 chunkPos(cx, cy, cz);
                auto chunk = std::make_unique<Chunk>(chunkPos);
                generateChunkTerrain(*chunk);
                chunks[chunkPos] = std::move(chunk);
            }
        }
    }

    for (auto& [pos, chunk] : chunks) {
        regenerateChunkMesh(*chunk);
    }
}

void ChunkManager::generateChunkTerrain(Chunk& chunk) {
    for (int x = 0; x < CHUNK_SIZE; x++) {
        for (int z = 0; z < CHUNK_SIZE; z++) {
            int worldX = chunk.position.x * CHUNK_SIZE + x;
            int worldZ = chunk.position.z * CHUNK_SIZE + z;

            float height = getHeight(static_cast<float>(worldX), static_cast<float>(worldZ));
            float moisture = (noise.fbm(worldX * 0.02f + 100.0f, worldZ * 0.02f + 100.0f, 3) + 1.0f) * 0.5f;
            int heightInt = static_cast<int>(std::floor(height));

            for (int y = 0; y < CHUNK_HEIGHT; y++) {
                int worldY = chunk.position.y * CHUNK_HEIGHT + y;
                VoxelType type = getVoxelTypeForHeight(worldY, heightInt, moisture);

                if (worldY > 0 && worldY <= heightInt) {
                    float treeNoise = noise.noise(worldX * 0.15f, worldZ * 0.15f, worldY * 0.1f);
                    if (type == VoxelType::GRASS && treeNoise > 0.82f && worldY == heightInt) {
                        for (int ty = 1; ty <= 4; ty++) {
                            if (worldY + ty < 64) {
                                int ly = y + ty;
                                if (ly >= 0 && ly < CHUNK_HEIGHT) {
                                    chunk.setVoxel(x, ly, z, ty <= 3 ? VoxelType::WOOD : VoxelType::LEAVES);
                                }
                            }
                        }
                    }
                }

                chunk.setVoxel(x, y, z, type);
            }
        }
    }
    chunk.dirty = true;
}

void ChunkManager::addFace(MeshData& mesh, const Vec3& pos, const Vec3& dir, const Vec3& color, int voxelStep) {
    uint32_t baseIndex = static_cast<uint32_t>(mesh.vertices.size());
    int faceIdx = 0;

    for (int i = 0; i < 6; i++) {
        if (faceDirections[i] == dir) {
            faceIdx = i;
            break;
        }
    }

    for (int i = 0; i < 4; i++) {
        const Vec3& v = faceVertices[faceIdx][i];
        Vec3 worldPos = pos + v * static_cast<float>(voxelStep);
        Vec2 uv(static_cast<float>(i == 0 || i == 3), static_cast<float>(i < 2));
        mesh.vertices.emplace_back(worldPos, dir, color, uv);
    }

    for (uint32_t idx : faceIndices) {
        mesh.indices.push_back(baseIndex + idx);
    }
}

void ChunkManager::generateMeshForLOD(Chunk& chunk, LODLevel lod,
                                       Chunk* left, Chunk* right,
                                       Chunk* front, Chunk* back,
                                       Chunk* top, Chunk* bottom) {
    int step = 1 << static_cast<int>(lod);
    MeshData& mesh = chunk.getMesh(lod);
    mesh.clear();

    Vec3 worldOffset(
        static_cast<float>(chunk.position.x * CHUNK_SIZE),
        static_cast<float>(chunk.position.y * CHUNK_HEIGHT),
        static_cast<float>(chunk.position.z * CHUNK_SIZE)
    );

    for (int x = 0; x < CHUNK_SIZE; x += step) {
        for (int y = 0; y < CHUNK_HEIGHT; y += step) {
            for (int z = 0; z < CHUNK_SIZE; z += step) {
                const Voxel& voxel = chunk.getVoxel(x, y, z);
                if (voxel.type == VoxelType::AIR) continue;

                Vec3 color = VoxelColor::get(voxel.type);
                Vec3 pos(static_cast<float>(x), static_cast<float>(y), static_cast<float>(z));
                pos += worldOffset;

                for (const auto& dir : faceDirections) {
                    if (chunk.isFaceVisible(x, y, z, dir, left, right, front, back, top, bottom)) {
                        addFace(mesh, pos, dir, color, step);
                    }
                }
            }
        }
    }
}

void ChunkManager::regenerateChunkMesh(Chunk& chunk) {
    std::lock_guard<std::mutex> lock(chunkMutex);

    IVec3 pos = chunk.position;
    Chunk* left = getChunk(IVec3(pos.x - 1, pos.y, pos.z));
    Chunk* right = getChunk(IVec3(pos.x + 1, pos.y, pos.z));
    Chunk* front = getChunk(IVec3(pos.x, pos.y, pos.z - 1));
    Chunk* back = getChunk(IVec3(pos.x, pos.y, pos.z + 1));
    Chunk* top = getChunk(IVec3(pos.x, pos.y + 1, pos.z));
    Chunk* bottom = getChunk(IVec3(pos.x, pos.y - 1, pos.z));

    for (int i = 0; i < static_cast<int>(LODLevel::COUNT); i++) {
        LODLevel lod = static_cast<LODLevel>(i);
        generateMeshForLOD(chunk, lod, left, right, front, back, top, bottom);
    }

    chunk.dirty = false;
    chunk.meshed = true;
    chunk.meshVersion++;
}

void ChunkManager::regenerateDirtyMeshes() {
    for (auto& [pos, chunk] : chunks) {
        if (chunk->dirty) {
            regenerateChunkMesh(*chunk);
        }
    }
}

LODLevel ChunkManager::determineLOD(const Chunk& chunk, const Vec3& cameraPos) const {
    float distance = chunk.distanceTo(cameraPos);
    if (distance < 32.0f) return LODLevel::LOD0;
    if (distance < 64.0f) return LODLevel::LOD1;
    return LODLevel::LOD2;
}

std::vector<RenderChunk> ChunkManager::getVisibleChunks(const Frustum& frustum, const Vec3& cameraPos) {
    std::vector<RenderChunk> visible;

    for (auto& [pos, chunk] : chunks) {
        AABB bbox = chunk->getBoundingBox();
        bool inFrustum = frustum.isAABBVisible(bbox);
        float dist = chunk->distanceTo(cameraPos);
        LODLevel lod = determineLOD(*chunk, cameraPos);

        float renderDist = static_cast<float>(renderDistance * CHUNK_SIZE);
        if (inFrustum && dist < renderDist) {
            visible.push_back({ chunk.get(), lod, dist, true });
        }
    }

    std::sort(visible.begin(), visible.end(), [](const RenderChunk& a, const RenderChunk& b) {
        return a.distance > b.distance;
    });

    return visible;
}

VoxelType ChunkManager::getVoxelWorld(int x, int y, int z) const {
    int cx = x >> 4;
    int cy = y >> 4;
    int cz = z >> 4;
    int lx = x & 15;
    int ly = y & 15;
    int lz = z & 15;

    const Chunk* chunk = getChunk(IVec3(cx, cy, cz));
    if (!chunk) return VoxelType::AIR;
    return chunk->getVoxel(lx, ly, lz).type;
}

void ChunkManager::setVoxelWorld(int x, int y, int z, VoxelType type) {
    int cx = x >> 4;
    int cy = y >> 4;
    int cz = z >> 4;
    int lx = x & 15;
    int ly = y & 15;
    int lz = z & 15;

    Chunk* chunk = getChunk(IVec3(cx, cy, cz));
    if (!chunk) return;

    chunk->setVoxel(lx, ly, lz, type);

    if (lx == 0) {
        Chunk* neighbor = getChunk(IVec3(cx - 1, cy, cz));
        if (neighbor) neighbor->dirty = true;
    } else if (lx == CHUNK_SIZE - 1) {
        Chunk* neighbor = getChunk(IVec3(cx + 1, cy, cz));
        if (neighbor) neighbor->dirty = true;
    }

    if (ly == 0) {
        Chunk* neighbor = getChunk(IVec3(cx, cy - 1, cz));
        if (neighbor) neighbor->dirty = true;
    } else if (ly == CHUNK_HEIGHT - 1) {
        Chunk* neighbor = getChunk(IVec3(cx, cy + 1, cz));
        if (neighbor) neighbor->dirty = true;
    }

    if (lz == 0) {
        Chunk* neighbor = getChunk(IVec3(cx, cy, cz - 1));
        if (neighbor) neighbor->dirty = true;
    } else if (lz == CHUNK_SIZE - 1) {
        Chunk* neighbor = getChunk(IVec3(cx, cy, cz + 1));
        if (neighbor) neighbor->dirty = true;
    }
}

void ChunkManager::updateVoxel(int worldX, int worldY, int worldZ, VoxelType type) {
    std::lock_guard<std::mutex> lock(chunkMutex);
    setVoxelWorld(worldX, worldY, worldZ, type);
    regenerateDirtyMeshes();
}
