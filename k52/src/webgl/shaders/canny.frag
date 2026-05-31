#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_lowThreshold;
uniform float u_highThreshold;
uniform float u_intensity;
uniform bool u_grayscale;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

float getGray(vec2 coord) {
    return luminance(texture(u_image, coord).rgb);
}

void main() {
    ivec2 texSize = textureSize(u_image, 0);
    vec2 texel = 1.0 / vec2(texSize);

    float tl = getGray(v_texCoord + texel * vec2(-1.0, -1.0));
    float ml = getGray(v_texCoord + texel * vec2(-1.0,  0.0));
    float bl = getGray(v_texCoord + texel * vec2(-1.0,  1.0));
    float tm = getGray(v_texCoord + texel * vec2( 0.0, -1.0));
    float bm = getGray(v_texCoord + texel * vec2( 0.0,  1.0));
    float tr = getGray(v_texCoord + texel * vec2( 1.0, -1.0));
    float mr = getGray(v_texCoord + texel * vec2( 1.0,  0.0));
    float br = getGray(v_texCoord + texel * vec2( 1.0,  1.0));

    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;

    float magnitude = sqrt(gx * gx + gy * gy);
    float angle = atan(gy, gx);

    float angleDeg = degrees(angle);
    if (angleDeg < 0.0) angleDeg += 180.0;

    vec2 offset1 = vec2(0.0);
    vec2 offset2 = vec2(0.0);

    if (angleDeg < 22.5 || angleDeg >= 157.5) {
        offset1 = vec2(texel.x, 0.0);
        offset2 = vec2(-texel.x, 0.0);
    } else if (angleDeg < 67.5) {
        offset1 = vec2(texel.x, -texel.y);
        offset2 = vec2(-texel.x, texel.y);
    } else if (angleDeg < 112.5) {
        offset1 = vec2(0.0, texel.y);
        offset2 = vec2(0.0, -texel.y);
    } else {
        offset1 = vec2(texel.x, texel.y);
        offset2 = vec2(-texel.x, -texel.y);
    }

    float mag1 = 0.0;
    float g1x = -1.0, g1y = 0.0;
    {
        float ntl = getGray(v_texCoord + offset1 + texel * vec2(-1.0, -1.0));
        float nml = getGray(v_texCoord + offset1 + texel * vec2(-1.0,  0.0));
        float nbl = getGray(v_texCoord + offset1 + texel * vec2(-1.0,  1.0));
        float ntm = getGray(v_texCoord + offset1 + texel * vec2( 0.0, -1.0));
        float nbm = getGray(v_texCoord + offset1 + texel * vec2( 0.0,  1.0));
        float ntr = getGray(v_texCoord + offset1 + texel * vec2( 1.0, -1.0));
        float nmr = getGray(v_texCoord + offset1 + texel * vec2( 1.0,  0.0));
        float nbr = getGray(v_texCoord + offset1 + texel * vec2( 1.0,  1.0));
        float nx = -ntl - 2.0 * nml - nbl + ntr + 2.0 * nmr + nbr;
        float ny = -ntl - 2.0 * ntm - ntr + nbl + 2.0 * nbm + nbr;
        mag1 = sqrt(nx * nx + ny * ny);
    }

    float mag2 = 0.0;
    {
        float ntl = getGray(v_texCoord + offset2 + texel * vec2(-1.0, -1.0));
        float nml = getGray(v_texCoord + offset2 + texel * vec2(-1.0,  0.0));
        float nbl = getGray(v_texCoord + offset2 + texel * vec2(-1.0,  1.0));
        float ntm = getGray(v_texCoord + offset2 + texel * vec2( 0.0, -1.0));
        float nbm = getGray(v_texCoord + offset2 + texel * vec2( 0.0,  1.0));
        float ntr = getGray(v_texCoord + offset2 + texel * vec2( 1.0, -1.0));
        float nmr = getGray(v_texCoord + offset2 + texel * vec2( 1.0,  0.0));
        float nbr = getGray(v_texCoord + offset2 + texel * vec2( 1.0,  1.0));
        float nx = -ntl - 2.0 * nml - nbl + ntr + 2.0 * nmr + nbr;
        float ny = -ntl - 2.0 * ntm - ntr + nbl + 2.0 * nbm + nbr;
        mag2 = sqrt(nx * nx + ny * ny);
    }

    float nmsMag = magnitude;
    if (magnitude < mag1 || magnitude < mag2) {
        nmsMag = 0.0;
    }

    float normLow = u_lowThreshold / 255.0;
    float normHigh = u_highThreshold / 255.0;

    float edgeStrength = 0.0;
    if (nmsMag >= normHigh) {
        edgeStrength = 1.0;
    } else if (nmsMag >= normLow) {
        bool hasStrong = false;
        for (int i = -1; i <= 1 && !hasStrong; i++) {
            for (int j = -1; j <= 1 && !hasStrong; j++) {
                if (i == 0 && j == 0) continue;
                float ntl = getGray(v_texCoord + vec2(float(j), float(i)) * texel + texel * vec2(-1.0, -1.0));
                float nml = getGray(v_texCoord + vec2(float(j), float(i)) * texel + texel * vec2(-1.0,  0.0));
                float nbl = getGray(v_texCoord + vec2(float(j), float(i)) * texel + texel * vec2(-1.0,  1.0));
                float ntm = getGray(v_texCoord + vec2(float(j), float(i)) * texel + texel * vec2( 0.0, -1.0));
                float nbm = getGray(v_texCoord + vec2(float(j), float(i)) * texel + texel * vec2( 0.0,  1.0));
                float ntr = getGray(v_texCoord + vec2(float(j), float(i)) * texel + texel * vec2( 1.0, -1.0));
                float nmr = getGray(v_texCoord + vec2(float(j), float(i)) * texel + texel * vec2( 1.0,  0.0));
                float nbr = getGray(v_texCoord + vec2(float(j), float(i)) * texel + texel * vec2( 1.0,  1.0));
                float nx = -ntl - 2.0 * nml - nbl + ntr + 2.0 * nmr + nbr;
                float ny = -ntl - 2.0 * ntm - ntr + nbl + 2.0 * nbm + nbr;
                float nmag = sqrt(nx * nx + ny * ny);
                if (nmag >= normHigh) {
                    hasStrong = true;
                }
            }
        }
        edgeStrength = hasStrong ? 1.0 : 0.0;
    }

    edgeStrength = edgeStrength * u_intensity;
    edgeStrength = clamp(edgeStrength, 0.0, 1.0);

    vec3 edgeColor = vec3(edgeStrength);
    vec3 originalColor = texture(u_image, v_texCoord).rgb;

    if (u_grayscale) {
        fragColor = vec4(edgeColor, 1.0);
    } else {
        fragColor = vec4(originalColor * edgeColor, 1.0);
    }
}
