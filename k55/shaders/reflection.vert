#version 450

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec3 inColor;
layout(location = 3) in vec2 inUV;

layout(push_constant) uniform PushConstants {
    mat4 model;
    float lodLevel;
    vec4 clipPlane;
} pc;

layout(set = 0, binding = 0) uniform CameraUbo {
    mat4 view;
    mat4 projection;
    mat4 viewProjection;
    vec3 cameraPos;
    float pad1;
} camera;

layout(location = 0) out vec3 fragWorldPos;
layout(location = 1) out vec3 fragColor;

void main() {
    vec4 worldPos = pc.model * vec4(inPosition, 1.0);
    gl_ClipDistance[0] = dot(worldPos, pc.clipPlane);
    gl_Position = camera.projection * camera.view * worldPos;

    fragWorldPos = worldPos.xyz;
    fragColor = inColor;
}
