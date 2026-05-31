#version 450

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec3 inColor;
layout(location = 3) in vec2 inUv;

layout(set = 0, binding = 1) uniform LightUbo {
    mat4 lightSpace;
    vec3 lightDir;
    float pad1;
    vec3 lightColor;
    float intensity;
    float ambient;
    float shadowBias;
    vec2 pad2;
} light;

layout(push_constant) uniform PushConstants {
    mat4 model;
    vec3 baseColor;
    float lodLevel;
} pc;

void main() {
    vec4 worldPos = pc.model * vec4(inPosition, 1.0);
    gl_Position = light.lightSpace * worldPos;
}
