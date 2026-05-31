uniform float deltaTime;
uniform float catchRadius;
uniform float predatorEnergyGain;
uniform float predatorEnergyDrain;
uniform float preyReproduceEnergy;
uniform float preyReproduceThreshold;
uniform float predatorStarveThreshold;
uniform float initialEnergy;
uniform float predatorRatio;

uniform sampler2D positionTexture;
uniform sampler2D roleTexture;
uniform sampler2D velocityTexture;

uniform vec2 resolution;
uniform float textureSize;
uniform float particleCount;

vec3 getPosition(int index) {
  float x = mod(float(index), textureSize);
  float y = floor(float(index) / textureSize);
  vec2 uv = (vec2(x, y) + 0.5) / textureSize;
  return texture2D(positionTexture, uv).xyz;
}

float getRole(int index) {
  float x = mod(float(index), textureSize);
  float y = floor(float(index) / textureSize);
  vec2 uv = (vec2(x, y) + 0.5) / textureSize;
  return texture2D(roleTexture, uv).x;
}

float getEnergy(int index) {
  float x = mod(float(index), textureSize);
  float y = floor(float(index) / textureSize);
  vec2 uv = (vec2(x, y) + 0.5) / textureSize;
  return texture2D(roleTexture, uv).y;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  
  vec4 roleData = texture2D(roleTexture, uv);
  float role = roleData.x;
  float energy = roleData.y;
  float timer = roleData.z;
  
  int particleIndex = int(gl_FragCoord.x + gl_FragCoord.y * resolution.x);
  if (float(particleIndex) >= particleCount) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  
  vec3 position = texture2D(positionTexture, uv).xyz;
  
  timer += deltaTime;
  
  if (role > 0.5) {
    energy -= predatorEnergyDrain * deltaTime;
    
    float catchRadiusSq = catchRadius * catchRadius;
    bool ate = false;
    
    for (int i = 0; i < 8000; i++) {
      if (float(i) >= particleCount) break;
      if (i == particleIndex) continue;
      
      float otherRole = getRole(i);
      if (otherRole > 0.5) continue;
      
      vec3 otherPos = getPosition(i);
      vec3 diff = position - otherPos;
      float distSq = dot(diff, diff);
      
      if (distSq < catchRadiusSq) {
        energy += predatorEnergyGain;
        ate = true;
        break;
      }
    }
    
    if (energy <= predatorStarveThreshold) {
      role = 0.0;
      energy = initialEnergy * 0.5;
      timer = 0.0;
    }
  } else {
    energy += preyReproduceEnergy * deltaTime;
    
    if (energy > preyReproduceThreshold && timer > 2.0) {
      bool needMorePrey = true;
      if (needMorePrey) {
        float preyCount = 0.0;
        float perceptionSq = 25.0;
        for (int j = 0; j < 100; j++) {
          if (float(j) >= particleCount) break;
          float r = getRole(j);
          if (r < 0.5) preyCount += 1.0;
        }
        
        if (preyCount < particleCount * 0.6) {
          energy -= preyReproduceThreshold * 0.5;
          timer = 0.0;
        }
      }
    }
    
    for (int i = 0; i < 8000; i++) {
      if (float(i) >= particleCount) break;
      if (i == particleIndex) continue;
      
      float otherRole = getRole(i);
      if (otherRole < 0.5) continue;
      
      vec3 otherPos = getPosition(i);
      vec3 diff = position - otherPos;
      float distSq = dot(diff, diff);
      
      if (distSq < catchRadius * catchRadius) {
        role = 1.0;
        energy = initialEnergy;
        timer = 0.0;
        break;
      }
    }
  }
  
  energy = clamp(energy, 0.0, 10.0);
  
  gl_FragColor = vec4(role, energy, timer, 1.0);
}
