#version 450

layout(location = 0) in vec2 fragUV;

layout(location = 0) out float outBlur;

layout(set = 0, binding = 0) uniform sampler2D ssaoTex;
layout(set = 0, binding = 1) uniform sampler2D normalTex;

layout(push_constant) uniform BlurParams {
    vec2 screenSize;
    float blurRadius;
    float edgeSharpness;
} params;

void main() {
    vec2 texelSize = 1.0 / params.screenSize;
    float result = 0.0;
    float weightSum = 0.0;

    vec3 centerNormal = texture(normalTex, fragUV).rgb * 2.0 - 1.0;
    float centerAO = texture(ssaoTex, fragUV).r;

    const int blurSize = 4;
    for (int x = -blurSize; x <= blurSize; x++) {
        for (int y = -blurSize; y <= blurSize; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            vec2 sampleUV = fragUV + offset;

            float sampleAO = texture(ssaoTex, sampleUV).r;
            vec3 sampleNormal = texture(normalTex, sampleUV).rgb * 2.0 - 1.0;

            float dist = length(vec2(float(x), float(y)));
            float spatialWeight = exp(-dist * dist / (2.0 * params.blurRadius * params.blurRadius));

            float normalDiff = dot(centerNormal, sampleNormal);
            float edgeWeight = pow(max(normalDiff, 0.0), params.edgeSharpness);

            float weight = spatialWeight * edgeWeight;
            result += sampleAO * weight;
            weightSum += weight;
        }
    }

    outBlur = weightSum > 0.0 ? result / weightSum : centerAO;
}
