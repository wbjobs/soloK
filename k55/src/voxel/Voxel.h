#pragma once
#include "../math/Vec3.h"
#include <cstdint>
#include <array>

enum class VoxelType : uint8_t {
    AIR = 0,
    GRASS = 1,
    DIRT = 2,
    STONE = 3,
    SAND = 4,
    WATER = 5,
    WOOD = 6,
    LEAVES = 7,
    SNOW = 8,
    BEDROCK = 9
};

struct VoxelColor {
    static Vec3 get(VoxelType type) {
        switch (type) {
            case VoxelType::GRASS:   return Vec3(0.3f, 0.7f, 0.2f);
            case VoxelType::DIRT:    return Vec3(0.5f, 0.35f, 0.2f);
            case VoxelType::STONE:   return Vec3(0.5f, 0.5f, 0.55f);
            case VoxelType::SAND:    return Vec3(0.9f, 0.85f, 0.5f);
            case VoxelType::WATER:   return Vec3(0.2f, 0.4f, 0.9f);
            case VoxelType::WOOD:    return Vec3(0.45f, 0.3f, 0.15f);
            case VoxelType::LEAVES:  return Vec3(0.2f, 0.6f, 0.15f);
            case VoxelType::SNOW:    return Vec3(0.9f, 0.9f, 0.95f);
            case VoxelType::BEDROCK: return Vec3(0.2f, 0.2f, 0.2f);
            default:                 return Vec3(1.0f, 0.0f, 1.0f);
        }
    }
};

struct Voxel {
    VoxelType type;

    Voxel() : type(VoxelType::AIR) {}
    explicit Voxel(VoxelType t) : type(t) {}

    bool isSolid() const {
        return type != VoxelType::AIR && type != VoxelType::WATER;
    }

    bool isOpaque() const {
        return type != VoxelType::AIR && type != VoxelType::WATER && type != VoxelType::LEAVES;
    }

    bool isTransparent() const {
        return type == VoxelType::WATER || type == VoxelType::LEAVES;
    }
};
