#version 450

layout(location = 0) in vec2 fragUV;

layout(location = 0) out vec4 outColor;

layout(set = 0, binding = 0) uniform sampler2D positionTex;
layout(set = 0, binding = 1) uniform sampler2D normalTex;
layout(set = 0, binding = 2) uniform sampler2D albedoTex;
layout(set = 0, binding = 3) uniform sampler2D ssaoTex;
layout(set = 0, binding = 4) uniform sampler2D shadowTex;
layout(set = 0, binding = 5) uniform sampler2D reflectionTex;

layout(set = 0, binding = 6) uniform CameraUbo {
    mat4 view;
    mat4 projection;
    mat4 viewProjection;
    vec3 cameraPos;
    float pad1;
} camera;

layout(set = 0, binding = 7) uniform LightUbo {
    mat4 lightSpace;
    vec3 lightDir;
    float pad1;
    vec3 lightColor;
    float intensity;
    float ambient;
    float shadowBias;
    vec2 pad2;
} light;

layout(push_constant) uniform PostprocessParams {
    vec2 screenSize;
    float ssaoStrength;
    float reflectionStrength;
    float waterLevel;
} params;

float calculateShadow(vec3 worldPos) {
    vec4 lightSpacePos = light.lightSpace * vec4(worldPos, 1.0);
    vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w;
    projCoords = projCoords * 0.5 + 0.5;

    if (projCoords.z > 1.0) {
        return 0.0;
    }

    float currentDepth = projCoords.z;
    float shadow = 0.0;
    vec2 texelSize = 1.0 / textureSize(shadowTex, 0);

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            float pcfDepth = texture(shadowTex, projCoords.xy + vec2(x, y) * texelSize).r;
            shadow += currentDepth - light.shadowBias > pcfDepth ? 1.0 : 0.0;
        }
    }

    shadow /= 9.0;
    return shadow;
}

float fresnel(vec3 viewDir, vec3 normal, float power) {
    return pow(1.0 - max(dot(viewDir, normal), 0.0), power);
}

void main() {
    vec3 worldPos = texture(positionTex, fragUV).xyz;
    vec3 normal = texture(normalTex, fragUV).rgb * 2.0 - 1.0;
    vec3 albedo = texture(albedoTex, fragUV).rgb;
    float ao = texture(ssaoTex, fragUV).r;

    if (length(worldPos) < 0.01) {
        outColor = vec4(0.5, 0.7, 0.9, 1.0);
        return;
    }

    vec3 viewDir = normalize(camera.cameraPos - worldPos);
    vec3 lightDir = normalize(-light.lightDir);

    float diff = max(dot(normal, lightDir), 0.0);
    vec3 ambient = light.ambient * light.lightColor;
    vec3 diffuse = diff * light.intensity * light.lightColor;

    float shadow = calculateShadow(worldPos);
    vec3 lighting = (ambient * mix(1.0, ao, params.ssaoStrength) + (1.0 - shadow) * diffuse) * albedo;

    float distToWater = worldPos.y - params.waterLevel;
    if (distToWater < 0.5 && distToWater > -0.5 && normal.y > 0.8) {
        vec3 reflectDir = reflect(-viewDir, normal);
        vec2 reflectUV = fragUV;
        reflectUV.y = 1.0 - reflectUV.y;
        reflectUV.y += reflectDir.y * 0.1;

        vec3 reflectionColor = texture(reflectionTex, reflectUV).rgb;

        float fresnelFactor = fresnel(viewDir, normal, 3.0);
        float reflectivity = mix(0.2, 0.8, fresnelFactor) * params.reflectionStrength;

        vec3 waterColor = vec3(0.2, 0.4, 0.7);
        float depthFactor = smoothstep(0.0, 2.0, abs(distToWater));
        vec3 finalWaterColor = mix(waterColor, albedo, depthFactor);

        lighting = mix(finalWaterColor, reflectionColor, reflectivity);
    }

    vec3 finalColor = lighting / (lighting + vec3(1.0));
    finalColor = pow(finalColor, vec3(1.0 / 2.2));

    outColor = vec4(finalColor, 1.0);
}
