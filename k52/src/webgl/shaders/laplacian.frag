#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_intensity;
uniform bool u_grayscale;
uniform int u_kernelSize;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    ivec2 texSize = textureSize(u_image, 0);
    vec2 texel = 1.0 / vec2(texSize);

    float center = luminance(texture(u_image, v_texCoord).rgb);
    float laplacian;

    if (u_kernelSize == 3) {
        float m0 = luminance(texture(u_image, v_texCoord + texel * vec2(-1.0, 0.0)).rgb);
        float m1 = luminance(texture(u_image, v_texCoord + texel * vec2(1.0, 0.0)).rgb);
        float m2 = luminance(texture(u_image, v_texCoord + texel * vec2(0.0, -1.0)).rgb);
        float m3 = luminance(texture(u_image, v_texCoord + texel * vec2(0.0, 1.0)).rgb);
        laplacian = m0 + m1 + m2 + m3 - 4.0 * center;
    } else if (u_kernelSize == 5) {
        float sum = 0.0;
        float totalWeight = 0.0;
        for (int x = -2; x <= 2; x++) {
            for (int y = -2; y <= 2; y++) {
                if (x == 0 && y == 0) continue;
                float dist = float(x * x + y * y);
                float weight = 1.0 / dist;
                sum += luminance(texture(u_image, v_texCoord + texel * vec2(float(x), float(y))).rgb) * weight;
                totalWeight += weight;
            }
        }
        laplacian = sum - totalWeight * center;
    } else {
        float sum = 0.0;
        float totalWeight = 0.0;
        for (int x = -3; x <= 3; x++) {
            for (int y = -3; y <= 3; y++) {
                if (x == 0 && y == 0) continue;
                float dist = float(x * x + y * y);
                float weight = 1.0 / dist;
                sum += luminance(texture(u_image, v_texCoord + texel * vec2(float(x), float(y))).rgb) * weight;
                totalWeight += weight;
            }
        }
        laplacian = sum - totalWeight * center;
    }

    float magnitude = abs(laplacian) * u_intensity;
    magnitude = clamp(magnitude, 0.0, 1.0);

    vec3 edgeColor = vec3(magnitude);
    vec3 originalColor = texture(u_image, v_texCoord).rgb;

    if (u_grayscale) {
        fragColor = vec4(edgeColor, 1.0);
    } else {
        fragColor = vec4(originalColor * edgeColor, 1.0);
    }
}
