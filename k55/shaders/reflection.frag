#version 450

layout(location = 0) in vec3 fragWorldPos;
layout(location = 1) in vec3 fragColor;

layout(location = 0) out vec4 outColor;

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

void main() {
    vec3 normal = vec3(0.0, 1.0, 0.0);
    vec3 lightDir = normalize(-light.lightDir);
    float diff = max(dot(normal, lightDir), 0.0);

    vec3 ambient = light.ambient * light.lightColor;
    vec3 diffuse = diff * light.intensity * light.lightColor;
    vec3 lighting = (ambient + diffuse) * fragColor;

    outColor = vec4(lighting, 1.0);
}
