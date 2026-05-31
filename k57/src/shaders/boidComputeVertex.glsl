#version 300 es

precision highp float;

uniform float deltaTime;
uniform float separationWeight;
uniform float alignmentWeight;
uniform float cohesionWeight;
uniform float maxSpeed;
uniform float perceptionRadius;
uniform float bounce;
uniform vec3 boundsMin;
uniform vec3 boundsMax;

in vec3 position;
in vec3 velocity;
in vec3 color;

out vec3 vPosition;
out vec3 vVelocity;
out vec3 vColor;

const int MAX_PARTICLES = 8000;
uniform vec3 allPositions[MAX_PARTICLES];
uniform vec3 allVelocities[MAX_PARTICLES];
uniform int particleCount;

void main() {
  vec3 pos = position;
  vec3 vel = velocity;
  
  vec3 separation = vec3(0.0);
  vec3 alignment = vec3(0.0);
  vec3 cohesion = vec3(0.0);
  
  int separationCount = 0;
  int alignmentCount = 0;
  int cohesionCount = 0;
  
  float perceptionRadiusSq = perceptionRadius * perceptionRadius;
  
  for (int i = 0; i < MAX_PARTICLES; i++) {
    if (i >= particleCount) break;
    if (i == gl_VertexID) continue;
    
    vec3 otherPos = allPositions[i];
    vec3 otherVel = allVelocities[i];
    
    vec3 diff = pos - otherPos;
    float distSq = dot(diff, diff);
    
    if (distSq < perceptionRadiusSq && distSq > 0.0) {
      float dist = sqrt(distSq);
      
      separation += diff / dist;
      separationCount++;
      
      alignment += otherVel;
      alignmentCount++;
      
      cohesion += otherPos;
      cohesionCount++;
    }
  }
  
  if (separationCount > 0) {
    separation /= float(separationCount);
    separation = normalize(separation) * separationWeight;
  }
  
  if (alignmentCount > 0) {
    alignment /= float(alignmentCount);
    alignment = normalize(alignment) * alignmentWeight;
  }
  
  if (cohesionCount > 0) {
    cohesion /= float(cohesionCount);
    cohesion = normalize(cohesion - pos) * cohesionWeight;
  }
  
  vec3 acceleration = separation + alignment + cohesion;
  
  vel += acceleration * deltaTime;
  
  float speed = length(vel);
  if (speed > maxSpeed) {
    vel = normalize(vel) * maxSpeed;
  }
  
  pos += vel * deltaTime;
  
  if (pos.x < boundsMin.x) {
    pos.x = boundsMin.x;
    vel.x = abs(vel.x) * bounce;
  } else if (pos.x > boundsMax.x) {
    pos.x = boundsMax.x;
    vel.x = -abs(vel.x) * bounce;
  }
  
  if (pos.y < boundsMin.y) {
    pos.y = boundsMin.y;
    vel.y = abs(vel.y) * bounce;
  } else if (pos.y > boundsMax.y) {
    pos.y = boundsMax.y;
    vel.y = -abs(vel.y) * bounce;
  }
  
  if (pos.z < boundsMin.z) {
    pos.z = boundsMin.z;
    vel.z = abs(vel.z) * bounce;
  } else if (pos.z > boundsMax.z) {
    pos.z = boundsMax.z;
    vel.z = -abs(vel.z) * bounce;
  }
  
  vPosition = pos;
  vVelocity = vel;
  vColor = color;
  
  gl_Position = vec4(pos, 1.0);
}
