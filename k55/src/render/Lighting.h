#pragma once
#include "../math/Vec3.h"
#include "../math/Mat4.h"

struct LightData {
    Vec3 direction;
    float intensity;
    Vec3 color;
    float ambient;
    Vec3 position;
    float shadowBias;
};

struct CameraUniforms {
    Mat4 view;
    Mat4 projection;
    Mat4 viewProjection;
    Vec3 cameraPos;
    float pad1;
};

struct LightUniforms {
    Mat4 lightSpace;
    Vec3 lightDir;
    float pad1;
    Vec3 lightColor;
    float intensity;
    float ambient;
    float shadowBias;
    Vec2 pad2;
};

struct PushConstants {
    Mat4 model;
    Vec3 baseColor;
    float lodLevel;
};
