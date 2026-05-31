#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform int u_kernelSize;

float gaussianWeight(float x, float y, float sigma) {
    return exp(-(x * x + y * y) / (2.0 * sigma * sigma)) / (2.0 * 3.14159265 * sigma * sigma);
}

void main() {
    ivec2 texSize = textureSize(u_image, 0);
    vec2 texel = 1.0 / vec2(texSize);

    int halfSize;
    float sigma;

    if (u_kernelSize == 3) {
        halfSize = 1;
        sigma = 1.0;
    } else if (u_kernelSize == 5) {
        halfSize = 2;
        sigma = 1.4;
    } else {
        halfSize = 3;
        sigma = 1.8;
    }

    vec4 sum = vec4(0.0);
    float totalWeight = 0.0;

    for (int x = -halfSize; x <= halfSize; x++) {
        for (int y = -halfSize; y <= halfSize; y++) {
            float weight = gaussianWeight(float(x), float(y), sigma);
            sum += texture(u_image, v_texCoord + texel * vec2(float(x), float(y))) * weight;
            totalWeight += weight;
        }
    }

    fragColor = sum / totalWeight;
}
