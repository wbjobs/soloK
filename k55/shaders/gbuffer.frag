#version 450

layout(location = 0) in vec3 fragWorldPos;
layout(location = 1) in vec3 fragNormal;
layout(location = 2) in vec3 fragColor;
layout(location = 3) in vec3 fragViewPos;

layout(location = 0) out vec4 outPosition;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outAlbedo;

void main() {
    vec3 normal = normalize(fragNormal);

    outPosition = vec4(fragWorldPos, 1.0);
    outNormal = vec4(normal * 0.5 + 0.5, 1.0);
    outAlbedo = vec4(fragColor, 1.0);
}
