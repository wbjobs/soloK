uniform float size;
uniform float scale;
uniform float maxTrailLength;
uniform int currentTrailIndex;
uniform float textureSize;

uniform sampler2D trailHistoryTexture;
uniform sampler2D velocityTexture;
uniform sampler2D roleTexture;

attribute vec2 trailReference;
attribute float aTrailOffset;

varying vec3 vColor;
varying float vAlpha;
varying vec3 vVelocity;
varying float vRole;
varying float vEnergy;

void main() {
  float particleIndex = trailReference.y;
  
  float historyIndex = mod(float(currentTrailIndex) - aTrailOffset + maxTrailLength, maxTrailLength);
  
  vec2 historyUV = vec2(
    historyIndex / maxTrailLength,
    particleIndex
  );
  
  vec3 pos = texture2D(trailHistoryTexture, historyUV).xyz;
  
  float idx = particleIndex * textureSize * textureSize;
  vec2 dataUV = vec2(
    mod(idx, textureSize) / textureSize + 0.5 / textureSize,
    floor(idx / textureSize) / textureSize + 0.5 / textureSize
  );
  vec3 vel = texture2D(velocityTexture, dataUV).xyz;
  vec4 roleData = texture2D(roleTexture, dataUV);
  float role = roleData.x;
  float energy = roleData.y;
  
  vVelocity = vel;
  vRole = role;
  vEnergy = energy;
  
  float speed = length(vel);
  
  if (role > 0.5) {
    vColor = mix(vec3(0.8, 0.1, 0.02), vec3(1.0, 0.3, 0.05), clamp(speed * 0.5, 0.0, 1.0));
  } else {
    vColor = mix(vec3(0.02, 0.5, 0.12), vec3(0.2, 0.8, 0.3), clamp(speed * 0.5, 0.0, 1.0));
  }
  
  vAlpha = 1.0 - (aTrailOffset / maxTrailLength);
  vAlpha = pow(vAlpha, 2.5);
  vAlpha *= smoothstep(0.0, 3.0, aTrailOffset);
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
  float baseSize = role > 0.5 ? size * 1.2 : size;
  gl_PointSize = baseSize * (scale / -mvPosition.z);
  gl_PointSize *= mix(0.2, 0.8, vAlpha);
  
  gl_Position = projectionMatrix * mvPosition;
}
