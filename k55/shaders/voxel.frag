#version 450

layout(location = 0) in vec3 fragColor;
layout(location = 1) in vec3 fragNormal;
layout(location = 2) in vec3 fragWorldPos;
layout(location = 3) in vec4 fragLightSpacePos;

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

layout(set = 0, binding = 2) uniform sampler2D shadowMap;

layout(location = 0) out vec4 outColor;

float calculateShadow(vec4 lightSpacePos) {
    vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w;
    projCoords = projCoords * 0.5 + 0.5;
    
    if (projCoords.z > 1.0) {
        return 0.0;
    }
    
    float currentDepth = projCoords.z;
    float shadow = 0.0;
    vec2 texelSize = 1.0 / textureSize(shadowMap, 0);
    
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            float pcfDepth = texture(shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
            shadow += currentDepth - light.shadowBias > pcfDepth ? 1.0 : 0.0;
        }
    }
    
    shadow /= 9.0;
    return shadow;
}

void main() {
    vec3 normal = normalize(fragNormal);
    vec3 viewDir = normalize(camera.cameraPos - fragWorldPos);
    vec3 lightDir = normalize(-light.lightDir);
    
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 ambient = light.ambient * light.lightColor;
    vec3 diffuse = diff * light.intensity * light.lightColor;
    
    float shadow = calculateShadow(fragLightSpacePos);
    vec3 lighting = (ambient + (1.0 - shadow) * diffuse) * fragColor;
    
    outColor = vec4(lighting, 1.0);
}
