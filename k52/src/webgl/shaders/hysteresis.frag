#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_nms;
uniform float u_lowThreshold;
uniform float u_highThreshold;
uniform float u_intensity;
uniform bool u_grayscale;
uniform sampler2D u_original;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    ivec2 texSize = textureSize(u_nms, 0);
    vec2 texel = 1.0 / vec2(texSize);

    float nmsMag = texture(u_nms, v_texCoord).r;
    float normLow = u_lowThreshold / 255.0;
    float normHigh = u_highThreshold / 255.0;

    float edgeStrength = 0.0;

    if (nmsMag >= normHigh) {
        edgeStrength = 1.0;
    } else if (nmsMag >= normLow) {
        bool hasStrong = false;
        for (int i = -1; i <= 1; i++) {
            for (int j = -1; j <= 1; j++) {
                if (i == 0 && j == 0) continue;
                float neighborMag = texture(u_nms, v_texCoord + vec2(float(j), float(i)) * texel).r;
                if (neighborMag >= normHigh) {
                    hasStrong = true;
                    break;
                }
            }
            if (hasStrong) break;
        }
        edgeStrength = hasStrong ? 1.0 : 0.0;
    }

    edgeStrength = clamp(edgeStrength * u_intensity, 0.0, 1.0);

    if (u_grayscale) {
        fragColor = vec4(vec3(edgeStrength), 1.0);
    } else {
        vec3 originalColor = texture(u_original, v_texCoord).rgb;
        fragColor = vec4(originalColor * edgeStrength, 1.0);
    }
}
