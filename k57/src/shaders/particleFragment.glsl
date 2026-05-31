varying vec3 vColor;
varying float vAlpha;
varying vec3 vVelocity;
varying float vRole;
varying float vEnergy;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  
  if (dist > 0.5) discard;
  
  float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
  alpha *= vAlpha;
  
  vec3 color = vColor;
  
  if (vRole > 0.5) {
    color += vec3(0.4, 0.1, 0.0) * (0.5 + vEnergy * 0.1);
  } else {
    color += vec3(0.0, 0.2, 0.1) * (0.5 + vEnergy * 0.1);
  }
  
  float speed = length(vVelocity);
  color += vec3(0.2, 0.2, 0.3) * speed * 0.2;
  
  gl_FragColor = vec4(color, alpha);
}
