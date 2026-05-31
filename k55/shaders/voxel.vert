#version 450

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec3 inColor;
layout(location = 3) in vec2 inUv;

layout(set = 0, binding = 0) uniform CameraUbo {
    mat4 view;
    mat4 projection;
    mat4 viewProjection;
    vec3 cameraPos;
    float pad1;
} camera;

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

layout(location = 0) out vec3 fragColor;
layout(location = 1) out vec3 fragNormal;
layout(location = 2) out vec3 fragWorldPos;
layout(location = 3) out vec4 fragLightSpacePos;

void main() {
    vec4 worldPos = pc.model * vec4(inPosition, 1.0);
    gl_Position = camera.projection * camera.view * worldPos;
    
    fragColor = inColor * pc.baseColor;
    fragNormal = mat3(transpose(inverse(pc.model))) * inNormal;
    fragWorldPos = worldPos.xyz;
    fragLightSpacePos = light.lightSpace * worldPos;
}
