#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_intensity;
uniform bool u_grayscale;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    ivec2 texSize = textureSize(u_image, 0);
    vec2 texel = 1.0 / vec2(texSize);

    float tl = luminance(texture(u_image, v_texCoord + texel * vec2(-1.0, -1.0)).rgb);
    float ml = luminance(texture(u_image, v_texCoord + texel * vec2(-1.0, 0.0)).rgb);
    float bl = luminance(texture(u_image, v_texCoord + texel * vec2(-1.0, 1.0)).rgb);
    float tm = luminance(texture(u_image, v_texCoord + texel * vec2(0.0, -1.0)).rgb);
    float bm = luminance(texture(u_image, v_texCoord + texel * vec2(0.0, 1.0)).rgb);
    float tr = luminance(texture(u_image, v_texCoord + texel * vec2(1.0, -1.0)).rgb);
    float mr = luminance(texture(u_image, v_texCoord + texel * vec2(1.0, 0.0)).rgb);
    float br = luminance(texture(u_image, v_texCoord + texel * vec2(1.0, 1.0)).rgb);

    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;

    float magnitude = length(vec2(gx, gy)) * u_intensity;
    magnitude = clamp(magnitude, 0.0, 1.0);

    vec3 edgeColor = vec3(magnitude);
    vec3 originalColor = texture(u_image, v_texCoord).rgb;

    if (u_grayscale) {
        fragColor = vec4(edgeColor, 1.0);
    } else {
        fragColor = vec4(originalColor * edgeColor, 1.0);
    }
}
