#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    ivec2 texSize = textureSize(u_image, 0);
    vec2 texel = 1.0 / vec2(texSize);

    float p00 = luminance(texture(u_image, v_texCoord + texel * vec2(-1.0, -1.0)).rgb);
    float p01 = luminance(texture(u_image, v_texCoord + texel * vec2(-1.0,  0.0)).rgb);
    float p02 = luminance(texture(u_image, v_texCoord + texel * vec2(-1.0,  1.0)).rgb);
    float p10 = luminance(texture(u_image, v_texCoord + texel * vec2( 0.0, -1.0)).rgb);
    float p12 = luminance(texture(u_image, v_texCoord + texel * vec2( 0.0,  1.0)).rgb);
    float p20 = luminance(texture(u_image, v_texCoord + texel * vec2( 1.0, -1.0)).rgb);
    float p21 = luminance(texture(u_image, v_texCoord + texel * vec2( 1.0,  0.0)).rgb);
    float p22 = luminance(texture(u_image, v_texCoord + texel * vec2( 1.0,  1.0)).rgb);

    float gx = -p00 - 2.0 * p01 - p02 + p20 + 2.0 * p21 + p22;
    float gy = -p00 - 2.0 * p10 - p20 + p02 + 2.0 * p12 + p22;

    float magnitude = sqrt(gx * gx + gy * gy);

    float angle = atan(gy, gx);
    float angleNorm = (angle + 3.14159265) / 6.2831853;

    fragColor = vec4(magnitude, angleNorm, 0.0, 1.0);
}
