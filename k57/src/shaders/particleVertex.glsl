uniform float size;
uniform float scale;

attribute vec2 reference;
attribute float aTrailIndex;
attribute float aTrailTotal;

uniform sampler2D positionTexture;
uniform sampler2D velocityTexture;
uniform sampler2D roleTexture;

varying vec3 vColor;
varying float vAlpha;
varying vec3 vVelocity;
varying float vRole;
varying float vEnergy;

void main() {
  vec2 uv = reference;
  
  vec3 pos = texture2D(positionTexture, uv).xyz;
  vec3 vel = texture2D(velocityTexture, uv).xyz;
  vec4 roleData = texture2D(roleTexture, uv);
  float role = roleData.x;
  float energy = roleData.y;
  
  vVelocity = vel;
  vRole = role;
  vEnergy = energy;
  
  float speed = length(vel);
  
  if (role > 0.5) {
    vec3 baseColor = vec3(1.0, 0.15, 0.05);
    vec3 brightColor = vec3(1.0, 0.5, 0.1);
    vColor = mix(baseColor, brightColor, clamp(speed * 0.6, 0.0, 1.0));
    float energyFactor = clamp(energy / 5.0, 0.3, 1.0);
    vColor *= energyFactor;
  } else {
    vec3 baseColor = vec3(0.05, 0.7, 0.2);
    vec3 brightColor = vec3(0.3, 1.0, 0.5);
    vColor = mix(baseColor, brightColor, clamp(speed * 0.6, 0.0, 1.0));
    float energyFactor = clamp(energy / 3.0, 0.4, 1.0);
    vColor *= energyFactor;
  }
  
  vAlpha = 1.0 - (aTrailIndex / aTrailTotal);
  vAlpha = pow(vAlpha, 2.0);
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
  float baseSize = role > 0.5 ? size * 1.4 : size;
  gl_PointSize = baseSize * (scale / -mvPosition.z);
  gl_PointSize *= mix(0.3, 1.0, vAlpha);
  
  gl_Position = projectionMatrix * mvPosition;
}
