#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;

void main() {
    fragColor = texture(u_image, v_texCoord);
}
