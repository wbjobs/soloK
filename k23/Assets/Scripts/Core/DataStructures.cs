using UnityEngine;

namespace TheaterRigging
{
    public enum CableState { Normal, Overloaded, Slack }
    public enum SimulationMode { Edit, Play, Record, Replay }
    public enum InputMode { PresetPath, ManualControl, Replay }

    [System.Serializable]
    public class VerletParticle
    {
        public Vector3 position;
        public Vector3 previousPosition;
        public Vector3 acceleration;
        public Vector3 velocity;
        public float mass;
        public bool isPinned;
        public int id;
        public float maxDeltaPerStep;

        public VerletParticle(Vector3 pos, float m, bool pinned = false)
        {
            position = pos;
            previousPosition = pos;
            acceleration = Vector3.zero;
            velocity = Vector3.zero;
            mass = m;
            isPinned = pinned;
            maxDeltaPerStep = 2f;
            id = GetHashCode();
        }

        public void AddForce(Vector3 force)
        {
            if (!isPinned && mass > 0f)
                acceleration += force / mass;
        }

        public void VerletIntegrate(float dt, float damping = 0.999f)
        {
            if (isPinned) return;

            velocity = position - previousPosition;
            velocity *= damping;

            Vector3 delta = velocity + acceleration * dt * dt;

            if (delta.sqrMagnitude > maxDeltaPerStep * maxDeltaPerStep)
            {
                delta = delta.normalized * maxDeltaPerStep;
            }

            previousPosition = position;
            position += delta;
            acceleration = Vector3.zero;
        }

        public void ClampPosition(Bounds bounds)
        {
            if (isPinned) return;
            position = bounds.ClosestPoint(position);
        }

        public void ResetVelocity()
        {
            previousPosition = position;
            velocity = Vector3.zero;
        }
    }

    [System.Serializable]
    public class DistanceConstraint
    {
        public VerletParticle particleA;
        public VerletParticle particleB;
        public float restLength;
        public float minLength;
        public float maxLength;
        public float stiffness;
        public float damping;
        public float currentLength;
        public float tension;
        public float maxCorrectionPerIteration;
        public bool useBaumgarteStabilization;
        public float baumgarteBias;

        public DistanceConstraint(VerletParticle a, VerletParticle b, float rest, float stiff, float damp)
        {
            particleA = a;
            particleB = b;
            restLength = rest;
            minLength = rest * 0.8f;
            maxLength = rest * 2.0f;
            stiffness = stiff;
            damping = damp;
            currentLength = rest;
            tension = 0f;
            maxCorrectionPerIteration = 0.2f;
            useBaumgarteStabilization = true;
            baumgarteBias = 0.1f;
        }

        public void Satisfy(int iteration = 0, int totalIterations = 1)
        {
            if (particleA == null || particleB == null) return;

            Vector3 delta = particleB.position - particleA.position;
            currentLength = delta.magnitude;

            if (currentLength < 0.001f) return;

            Vector3 direction = delta / currentLength;
            float elongation = currentLength - restLength;

            float clampedElongation = Mathf.Clamp(elongation, -maxCorrectionPerIteration, maxCorrectionPerIteration);

            Vector3 velocityA = particleA.position - particleA.previousPosition;
            Vector3 velocityB = particleB.position - particleB.previousPosition;
            Vector3 relativeVelocity = velocityB - velocityA;
            float velocityAlongCable = Vector3.Dot(relativeVelocity, direction);

            float impulseMagnitude = stiffness * clampedElongation + damping * velocityAlongCable;

            if (useBaumgarteStabilization)
            {
                float bias = baumgarteBias * elongation / (iteration + 1);
                impulseMagnitude += bias;
            }

            tension = Mathf.Abs(impulseMagnitude);

            if (particleA.isPinned && particleB.isPinned) return;

            float correctionFactor = 1f - Mathf.Exp(-0.5f * (iteration + 1) / totalIterations);

            if (particleA.isPinned)
            {
                particleB.position -= direction * clampedElongation * correctionFactor;
            }
            else if (particleB.isPinned)
            {
                particleA.position += direction * clampedElongation * correctionFactor;
            }
            else
            {
                float totalMass = particleA.mass + particleB.mass;
                if (totalMass > 0.001f)
                {
                    float ratioA = particleB.mass / totalMass;
                    float ratioB = particleA.mass / totalMass;
                    particleA.position += direction * clampedElongation * ratioA * correctionFactor;
                    particleB.position -= direction * clampedElongation * ratioB * correctionFactor;
                }
            }

            if (currentLength > maxLength)
            {
                Vector3 midPoint = (particleA.position + particleB.position) * 0.5f;
                Vector3 offset = direction * (maxLength * 0.5f);
                if (!particleA.isPinned) particleA.position = midPoint - offset;
                if (!particleB.isPinned) particleB.position = midPoint + offset;
            }
        }

        public float GetConstraintError()
        {
            if (particleA == null || particleB == null) return 0f;
            float len = Vector3.Distance(particleA.position, particleB.position);
            return Mathf.Abs(len - restLength);
        }
    }

    [System.Serializable]
    public class RiggingPoint
    {
        public int index;
        public string name;
        public Vector3 worldPosition;
        public float currentCableLength;
        public float targetCableLength;
        public float cableSpeed;
        public float maxSpeed = 5f;
        public float tension;
        public CableState state;
        public bool isEnabled;

        public RiggingPoint(int idx, Vector3 pos)
        {
            index = idx;
            name = $"吊点{idx + 1}";
            worldPosition = pos;
            currentCableLength = 5f;
            targetCableLength = 5f;
            cableSpeed = 0f;
            tension = 0f;
            state = CableState.Normal;
            isEnabled = true;
        }

        public void UpdateCableLength(float dt)
        {
            float delta = targetCableLength - currentCableLength;
            float maxDelta = maxSpeed * dt;

            if (Mathf.Abs(delta) > maxDelta)
            {
                cableSpeed = Mathf.Sign(delta) * maxSpeed;
                currentCableLength += cableSpeed * dt;
            }
            else
            {
                cableSpeed = delta / Mathf.Max(dt, 0.001f);
                currentCableLength = targetCableLength;
            }
        }
    }

    [System.Serializable]
    public class ActorState
    {
        public Vector3 position;
        public Vector3 previousPosition;
        public Vector3 velocity;
        public Vector3 acceleration;
        public Quaternion rotation;
        public Quaternion previousRotation;
        public Vector3 angularVelocity;
        public float mass = 70f;
        public Vector3 inertiaTensor = new Vector3(2f, 2f, 2f);
        public Bounds bounds;
        public Bounds previousBounds;
        public bool useCCD = true;
        public float ccdThreshold = 5f;

        public ActorState()
        {
            position = Vector3.zero;
            previousPosition = Vector3.zero;
            velocity = Vector3.zero;
            acceleration = Vector3.zero;
            rotation = Quaternion.identity;
            previousRotation = Quaternion.identity;
            angularVelocity = Vector3.zero;
            bounds = new Bounds(Vector3.zero, new Vector3(0.6f, 1.8f, 0.4f));
            previousBounds = new Bounds(Vector3.zero, new Vector3(0.6f, 1.8f, 0.4f));
        }

        public void SavePreviousState()
        {
            previousPosition = position;
            previousRotation = rotation;
            previousBounds.center = previousPosition;
            previousBounds.size = bounds.size;
        }

        public Vector3 GetDisplacement()
        {
            return position - previousPosition;
        }

        public bool NeedsCCD()
        {
            if (!useCCD) return false;
            float displacement = GetDisplacement().magnitude;
            float minBoundsSize = Mathf.Min(bounds.size.x, bounds.size.y, bounds.size.z);
            return displacement > minBoundsSize * 0.5f || velocity.magnitude > ccdThreshold;
        }

        public void AddForce(Vector3 force)
        {
            acceleration += force / Mathf.Max(mass, 0.001f);
        }
    }

    [System.Serializable]
    public struct TrajectoryKeyframe
    {
        public float time;
        public Vector3 position;
        public Quaternion rotation;
        public float[] cableLengths;

        public TrajectoryKeyframe(float t, Vector3 pos, Quaternion rot, float[] lengths)
        {
            time = t;
            position = pos;
            rotation = rot;
            cableLengths = lengths != null ? (float[])lengths.Clone() : new float[8];
        }
    }

    [System.Serializable]
    public class CollisionBox
    {
        public string name;
        public Bounds bounds;
        public Color warningColor = new Color(1f, 0.5f, 0f);
        public bool isEnabled = true;
        public bool isColliding = false;

        public CollisionBox(string n, Bounds b)
        {
            name = n;
            bounds = b;
        }
    }

    [System.Serializable]
    public class SafetyReport
    {
        public float dynamicLoadFactor;
        public float maxTension;
        public int overloadedPointIndex;
        public bool isSafe;
        public string warningMessage;
        public Vector3 impactVelocity;
        public bool hasCollision;
        public string collisionObjectName;
        public float collisionTimeOfImpact;
        public Vector3 collisionNormal;
        public bool ccdTriggered;
        public int stabilityWarningCount;

        public SafetyReport()
        {
            dynamicLoadFactor = 1f;
            maxTension = 0f;
            overloadedPointIndex = -1;
            isSafe = true;
            warningMessage = "";
            impactVelocity = Vector3.zero;
            hasCollision = false;
            collisionObjectName = "";
            collisionTimeOfImpact = 1f;
            collisionNormal = Vector3.up;
            ccdTriggered = false;
            stabilityWarningCount = 0;
        }
    }

    [System.Serializable]
    public struct CCDResult
    {
        public bool hasCollision;
        public float timeOfImpact;
        public Vector3 hitPoint;
        public Vector3 hitNormal;
        public string objectName;
        public Vector3 adjustedPosition;

        public static CCDResult NoCollision => new CCDResult
        {
            hasCollision = false,
            timeOfImpact = 1f,
            hitPoint = Vector3.zero,
            hitNormal = Vector3.up,
            objectName = "",
            adjustedPosition = Vector3.zero
        };
    }

    [System.Serializable]
    public class StabilityMonitor
    {
        public float maxEnergy;
        public float currentEnergy;
        public float energyThreshold;
        public int consecutiveInstabilityFrames;
        public bool isStable;

        public StabilityMonitor()
        {
            maxEnergy = 0f;
            currentEnergy = 0f;
            energyThreshold = 100000f;
            consecutiveInstabilityFrames = 0;
            isStable = true;
        }

        public float CalculateSystemEnergy(List<VerletParticle> particles)
        {
            float totalEnergy = 0f;
            foreach (var p in particles)
            {
                if (p.isPinned) continue;
                float speed = p.velocity.magnitude;
                totalEnergy += 0.5f * p.mass * speed * speed;
                totalEnergy += p.mass * 9.81f * p.position.y;
            }
            return totalEnergy;
        }

        public bool CheckStability(List<VerletParticle> particles)
        {
            currentEnergy = CalculateSystemEnergy(particles);

            if (currentEnergy > energyThreshold)
            {
                consecutiveInstabilityFrames++;
                if (consecutiveInstabilityFrames > 5)
                {
                    isStable = false;
                    return false;
                }
            }
            else
            {
                consecutiveInstabilityFrames = 0;
                isStable = true;
            }

            maxEnergy = Mathf.Max(maxEnergy, currentEnergy);
            return true;
        }

        public void Reset()
        {
            maxEnergy = 0f;
            consecutiveInstabilityFrames = 0;
            isStable = true;
        }
    }
}