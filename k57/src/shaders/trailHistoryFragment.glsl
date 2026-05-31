uniform sampler2D positionTexture;
uniform sampler2D trailHistoryTexture;
uniform int trailIndex;
uniform int maxTrailLength;
uniform float textureSize;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  
  float x = floor(gl_FragCoord.x);
  float y = floor(gl_FragCoord.y);
  
  float particleIndex = floor(y);
  float historySlot = x;
  
  vec4 result;
  
  if (int(historySlot) == trailIndex) {
    vec2 particleUV = vec2(
      mod(particleIndex, textureSize) / textureSize + 0.5 / textureSize,
      floor(particleIndex / textureSize) / textureSize + 0.5 / textureSize
    );
    result = texture2D(positionTexture, particleUV);
  } else {
    int prevSlot = int(historySlot) - 1;
    if (prevSlot < 0) prevSlot = maxTrailLength - 1;
    
    vec2 prevUV = vec2(
      float(prevSlot) / resolution.x,
      uv.y
    );
    result = texture2D(trailHistoryTexture, prevUV);
  }
  
  gl_FragColor = result;
}
