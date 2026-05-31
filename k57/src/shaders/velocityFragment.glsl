uniform float deltaTime;
uniform float separationWeight;
uniform float alignmentWeight;
uniform float cohesionWeight;
uniform float maxSpeed;
uniform float perceptionRadius;
uniform float maxForce;
uniform float chaseWeight;
uniform float fleeWeight;
uniform float catchRadius;

uniform sampler2D positionTexture;
uniform sampler2D velocityTexture;
uniform sampler2D roleTexture;

uniform vec2 resolution;
uniform float textureSize;
uniform float particleCount;

vec3 getPosition(int index) {
  float x = mod(float(index), textureSize);
  float y = floor(float(index) / textureSize);
  vec2 uv = (vec2(x, y) + 0.5) / textureSize;
  return texture2D(positionTexture, uv).xyz;
}

vec3 getVelocity(int index) {
  float x = mod(float(index), textureSize);
  float y = floor(float(index) / textureSize);
  vec2 uv = (vec2(x, y) + 0.5) / textureSize;
  return texture2D(velocityTexture, uv).xyz;
}

float getRole(int index) {
  float x = mod(float(index), textureSize);
  float y = floor(float(index) / textureSize);
  vec2 uv = (vec2(x, y) + 0.5) / textureSize;
  return texture2D(roleTexture, uv).x;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  
  vec3 position = texture2D(positionTexture, uv).xyz;
  vec3 velocity = texture2D(velocityTexture, uv).xyz;
  float myRole = texture2D(roleTexture, uv).x;
  
  int particleIndex = int(gl_FragCoord.x + gl_FragCoord.y * resolution.x);
  
  vec3 separation = vec3(0.0);
  vec3 alignment = vec3(0.0);
  vec3 cohesion = vec3(0.0);
  vec3 chaseDir = vec3(0.0);
  vec3 fleeDir = vec3(0.0);
  
  int separationCount = 0;
  int alignmentCount = 0;
  int cohesionCount = 0;
  int chaseCount = 0;
  int fleeCount = 0;
  
  float perceptionRadiusSq = perceptionRadius * perceptionRadius;
  float chaseRadiusSq = perceptionRadiusSq * 4.0;
  float catchRadiusSq = catchRadius * catchRadius;
  
  float nearestPreyDist = 1e10;
  vec3 nearestPreyPos = vec3(0.0);
  float nearestPredDist = 1e10;
  vec3 nearestPredPos = vec3(0.0);
  
  for (int i = 0; i < 8000; i++) {
    if (float(i) >= particleCount) break;
    if (i == particleIndex) continue;
    
    vec3 otherPos = getPosition(i);
    vec3 otherVel = getVelocity(i);
    float otherRole = getRole(i);
    
    vec3 diff = position - otherPos;
    float distSq = dot(diff, diff);
    
    if (distSq < perceptionRadiusSq && distSq > 0.0001) {
      float dist = sqrt(distSq);
      float sameRole = step(abs(myRole - otherRole), 0.5);
      
      if (sameRole > 0.5) {
        separation += diff / dist;
        separationCount++;
        
        alignment += otherVel;
        alignmentCount++;
        
        cohesion += otherPos;
        cohesionCount++;
      } else {
        separation += diff / dist * 2.0;
        separationCount++;
      }
    }
    
    if (myRole > 0.5 && otherRole < 0.5 && distSq < chaseRadiusSq) {
      float dist = sqrt(distSq);
      if (dist < nearestPreyDist) {
        nearestPreyDist = dist;
        nearestPreyPos = otherPos;
      }
      chaseCount++;
    }
    
    if (myRole < 0.5 && otherRole > 0.5 && distSq < chaseRadiusSq) {
      float dist = sqrt(distSq);
      if (dist < nearestPredDist) {
        nearestPredDist = dist;
        nearestPredPos = otherPos;
      }
      fleeCount++;
    }
  }
  
  vec3 acceleration = vec3(0.0);
  
  if (separationCount > 0) {
    separation /= float(separationCount);
    separation = normalize(separation) * separationWeight;
    acceleration += separation;
  }
  
  if (alignmentCount > 0) {
    alignment /= float(alignmentCount);
    alignment = normalize(alignment) * alignmentWeight;
    acceleration += alignment;
  }
  
  if (cohesionCount > 0) {
    cohesion /= float(cohesionCount);
    cohesion = normalize(cohesion - position) * cohesionWeight;
    acceleration += cohesion;
  }
  
  if (chaseCount > 0 && nearestPreyDist < 1e9) {
    vec3 toPrey = nearestPreyPos - position;
    chaseDir = normalize(toPrey) * chaseWeight;
    acceleration += chaseDir;
  }
  
  if (fleeCount > 0 && nearestPredDist < 1e9) {
    vec3 fromPred = position - nearestPredPos;
    float urgency = 1.0 - clamp(nearestPredDist / (perceptionRadius * 2.0), 0.0, 1.0);
    fleeDir = normalize(fromPred) * fleeWeight * (1.0 + urgency * 2.0);
    acceleration += fleeDir;
  }
  
  velocity += acceleration * deltaTime;
  
  float speed = length(velocity);
  float myMaxSpeed = myRole > 0.5 ? maxSpeed * 1.1 : maxSpeed;
  if (speed > myMaxSpeed) {
    velocity = normalize(velocity) * myMaxSpeed;
  }
  
  gl_FragColor = vec4(velocity, 1.0);
}
