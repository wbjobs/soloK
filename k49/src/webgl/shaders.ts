export const SIMULATE_VERT = `#version 300 es
in vec2 aPosition;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const SIMULATE_FRAG = `#version 300 es
precision highp float;
precision highp isampler2D;
uniform sampler2D uState;
uniform sampler2D uAge;
uniform vec2 uTexelSize;
uniform float uHeatStep;
layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outAge;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 size = textureSize(uState, 0);

    int sum = 0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;
            ivec2 n = coord + ivec2(x, y);
            n = (n + size) % size;
            float s = texelFetch(uState, n, 0).r;
            if (s > 0.5) sum++;
        }
    }

    float cur = texelFetch(uState, coord, 0).r;
    float nxt = 0.0;
    if (cur > 0.5) {
        nxt = (sum == 2 || sum == 3) ? 1.0 : 0.0;
    } else {
        nxt = (sum == 3) ? 1.0 : 0.0;
    }

    float curAge = texelFetch(uAge, coord, 0).r;
    float newAge = (abs(nxt - cur) > 0.5) ? 0.0 : min(curAge + uHeatStep, 1.0);

    outState = vec4(nxt, 0.0, 0.0, 1.0);
    outAge = vec4(newAge, 0.0, 0.0, 1.0);
}
`;

export const RENDER_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform sampler2D uAge;
uniform bool uHeatmap;
uniform vec2 uResolution;
uniform vec2 uGridSize;
uniform vec2 uOffset;
uniform float uZoom;
out vec4 fragColor;

vec3 heatmapColor(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.2) {
        return mix(vec3(0.0, 0.4, 1.0), vec3(0.0, 1.0, 0.78), t / 0.2);
    } else if (t < 0.45) {
        return mix(vec3(0.0, 1.0, 0.78), vec3(0.3, 1.0, 0.0), (t - 0.2) / 0.25);
    } else if (t < 0.7) {
        return mix(vec3(0.3, 1.0, 0.0), vec3(1.0, 0.85, 0.0), (t - 0.45) / 0.25);
    } else {
        return mix(vec3(1.0, 0.85, 0.0), vec3(1.0, 0.1, 0.0), (t - 0.7) / 0.3);
    }
}

void main() {
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float aspect = uResolution.x / uResolution.y;

    vec2 uv = screenUV;
    if (aspect > 1.0) {
        uv.x = (uv.x - 0.5) * aspect + 0.5;
    } else {
        uv.y = (uv.y - 0.5) / aspect + 0.5;
    }

    vec2 gridUV = (uv - 0.5) / uZoom + 0.5 - uOffset;
    gridUV = fract(gridUV);

    float state = texture(uState, gridUV).r;
    float age = texture(uAge, gridUV).r;

    if (state > 0.5) {
        if (uHeatmap) {
            fragColor = vec4(heatmapColor(age), 1.0);
        } else {
            float pulse = 0.85 + 0.15 * (1.0 - age);
            fragColor = vec4(0.0, pulse, 0.78 * pulse, 1.0);
        }
    } else {
        vec3 bg = vec3(0.039, 0.055, 0.09);
        if (uZoom > 2.0) {
            vec2 gp = gridUV * uGridSize;
            float gx = abs(fract(gp.x) - 0.5);
            float gy = abs(fract(gp.y) - 0.5);
            float gridLine = 1.0 - step(0.48 - 0.5 / uZoom, min(gx, gy));
            bg = mix(bg, vec3(0.06, 0.08, 0.13), gridLine * 0.5);
        }
        fragColor = vec4(bg, 1.0);
    }
}
`;

export const CLEAR_FRAG = `#version 300 es
precision highp float;
uniform vec4 uClearValue;
out vec4 fragColor;
void main() {
    fragColor = uClearValue;
}
`;
