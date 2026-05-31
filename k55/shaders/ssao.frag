#version 450

layout(location = 0) in vec2 fragUV;

layout(location = 0) out float outSSAO;

layout(set = 0, binding = 0) uniform sampler2D positionTex;
layout(set = 0, binding = 1) uniform sampler2D normalTex;
layout(set = 0, binding = 2) uniform sampler2D noiseTex;
layout(set = 0, binding = 3) uniform CameraUbo {
    mat4 view;
    mat4 projection;
    mat4 viewProjection;
    vec3 cameraPos;
    float pad1;
} camera;

layout(push_constant) uniform SSAOParams {
    vec2 screenSize;
    float bias;
    float radius;
    float power;
    int kernelSize;
} params;

const int MAX_KERNEL_SIZE = 64;
layout(set = 0, binding = 4) uniform KernelUbo {
    vec4 samples[MAX_KERNEL_SIZE];
} kernel;

void main() {
    vec3 fragPos = texture(positionTex, fragUV).xyz;
    vec3 normal = texture(normalTex, fragUV).rgb * 2.0 - 1.0;

    if (length(fragPos) < 0.01) {
        outSSAO = 1.0;
        return;
    }

    vec2 noiseScale = params.screenSize / 4.0;
    vec3 randomVec = texture(noiseTex, fragUV * noiseScale).rgb * 2.0 - 1.0;

    vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
    vec3 bitangent = cross(normal, tangent);
    mat3 TBN = mat3(tangent, bitangent, normal);

    float occlusion = 0.0;
    vec3 viewPos = (camera.view * vec4(fragPos, 1.0)).xyz;

    for (int i = 0; i < params.kernelSize; i++) {
        vec3 samplePos = TBN * kernel.samples[i].xyz;
        samplePos = fragPos + samplePos * params.radius;

        vec4 offset = vec4(samplePos, 1.0);
        offset = camera.projection * camera.view * offset;
        offset.xyz /= offset.w;
        offset.xyz = offset.xyz * 0.5 + 0.5;

        vec3 sampleViewPos = texture(positionTex, offset.xy).xyz;
        sampleViewPos = (camera.view * vec4(sampleViewPos, 1.0)).xyz;

        float rangeCheck = smoothstep(0.0, 1.0, params.radius / abs(viewPos.z - sampleViewPos.z));
        occlusion += (sampleViewPos.z >= viewPos.z + params.bias ? 1.0 : 0.0) * rangeCheck;
    }

    occlusion = 1.0 - (occlusion / float(params.kernelSize));
    outSSAO = pow(occlusion, params.power);
}
