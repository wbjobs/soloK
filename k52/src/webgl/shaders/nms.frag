#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_gradient;

void main() {
    ivec2 texSize = textureSize(u_gradient, 0);
    vec2 texel = 1.0 / vec2(texSize);

    vec4 center = texture(u_gradient, v_texCoord);
    float magnitude = center.r;
    float angle = center.g * 6.2831853 - 3.14159265;

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

    float mag1 = texture(u_gradient, v_texCoord + offset1).r;
    float mag2 = texture(u_gradient, v_texCoord + offset2).r;

    float nmsMag = magnitude;
    if (magnitude < mag1 || magnitude < mag2) {
        nmsMag = 0.0;
    }

    fragColor = vec4(nmsMag, center.g, 0.0, 1.0);
}
