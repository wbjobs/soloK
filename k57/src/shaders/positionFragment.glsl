uniform float deltaTime;
uniform float maxSpeed;
uniform float bounce;
uniform vec3 boundsMin;
uniform vec3 boundsMax;

uniform sampler2D positionTexture;
uniform sampler2D velocityTexture;

uniform vec2 resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  
  vec3 position = texture2D(positionTexture, uv).xyz;
  vec3 velocity = texture2D(velocityTexture, uv).xyz;
  
  position += velocity * deltaTime;
  
  if (position.x < boundsMin.x) {
    position.x = boundsMin.x;
    velocity.x = abs(velocity.x) * bounce;
  } else if (position.x > boundsMax.x) {
    position.x = boundsMax.x;
    velocity.x = -abs(velocity.x) * bounce;
  }
  
  if (position.y < boundsMin.y) {
    position.y = boundsMin.y;
    velocity.y = abs(velocity.y) * bounce;
  } else if (position.y > boundsMax.y) {
    position.y = boundsMax.y;
    velocity.y = -abs(velocity.y) * bounce;
  }
  
  if (position.z < boundsMin.z) {
    position.z = boundsMin.z;
    velocity.z = abs(velocity.z) * bounce;
  } else if (position.z > boundsMax.z) {
    position.z = boundsMax.z;
    velocity.z = -abs(velocity.z) * bounce;
  }
  
  gl_FragColor = vec4(position, 1.0);
}
