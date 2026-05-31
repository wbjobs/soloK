using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public class VerletPhysicsEngine
    {
        private Vector3 gravity;
        private float timeStep;
        private int solverIterations;
        private StabilityMonitor stabilityMonitor;
        private Bounds sceneBounds;

        public int SubStepCount { get; private set; }
        public bool IsStable => stabilityMonitor != null && stabilityMonitor.isStable;
        public float SystemEnergy => stabilityMonitor != null ? stabilityMonitor.currentEnergy : 0f;

        public VerletPhysicsEngine(Vector3 g, float dt, int iterations)
        {
            gravity = g;
            timeStep = dt;
            solverIterations = iterations;
            stabilityMonitor = new StabilityMonitor();
            sceneBounds = new Bounds(Vector3.zero, new Vector3(50f, 50f, 50f));
        }

        public void Step(ActorState actor, CableSystem cableSystem, float dt)
        {
            if (actor == null || cableSystem == null) return;

            actor.SavePreviousState();

            float maxSubDt = 0.005f;
            int requiredSubSteps = Mathf.CeilToInt(dt / maxSubDt);
            requiredSubSteps = Mathf.Clamp(requiredSubSteps, 1, 20);
            SubStepCount = requiredSubSteps;
            float subDt = dt / requiredSubSteps;

            for (int subStep = 0; subStep < requiredSubSteps; subStep++)
            {
                SubStep(actor, cableSystem, subDt, subStep, requiredSubSteps);
            }

            if (!stabilityMonitor.CheckStability(cableSystem.Particles))
            {
                RecoverFromInstability(actor, cableSystem);
            }
        }

        private void SubStep(ActorState actor, CableSystem cableSystem, float subDt, int subStepIndex, int totalSubSteps)
        {
            ApplyGravity(cableSystem, subDt);
            IntegrateVerlet(cableSystem, subDt);
            ClampParticlePositions(cableSystem);
            SolveConstraintsOrdered(cableSystem);
            EnforceCableLengthConstraintHard(cableSystem);
            UpdateActorState(actor, cableSystem);
        }

        private void ApplyGravity(CableSystem cableSystem, float dt)
        {
            if (cableSystem.Particles == null) return;

            foreach (var particle in cableSystem.Particles)
            {
                if (!particle.isPinned)
                {
                    particle.AddForce(gravity * particle.mass);

                    Vector3 velocity = particle.position - particle.previousPosition;
                    float adaptiveDamping = 0.01f;
                    if (velocity.sqrMagnitude > 100f)
                    {
                        adaptiveDamping = 0.1f;
                    }
                    else if (velocity.sqrMagnitude > 25f)
                    {
                        adaptiveDamping = 0.03f;
                    }
                    particle.AddForce(-velocity * adaptiveDamping * particle.mass / Mathf.Max(dt, 0.001f));
                }
            }
        }

        private void IntegrateVerlet(CableSystem cableSystem, float dt)
        {
            if (cableSystem.Particles == null) return;

            foreach (var particle in cableSystem.Particles)
            {
                float velocityDamping = 0.999f;
                Vector3 velocity = particle.position - particle.previousPosition;
                float speed = velocity.magnitude;
                if (speed > 0.001f)
                {
                    float maxSpeed = 15f;
                    if (speed > maxSpeed)
                    {
                        velocity = velocity * (maxSpeed / speed);
                        particle.previousPosition = particle.position - velocity;
                    }
                }

                particle.VerletIntegrate(dt, velocityDamping);
            }
        }

        private void ClampParticlePositions(CableSystem cableSystem)
        {
            if (cableSystem.Particles == null) return;

            foreach (var particle in cableSystem.Particles)
            {
                if (!particle.isPinned)
                {
                    particle.ClampPosition(sceneBounds);
                }
            }
        }

        private void SolveConstraintsOrdered(CableSystem cableSystem)
        {
            if (cableSystem.Constraints == null || cableSystem.Constraints.Count == 0) return;

            List<DistanceConstraint> sortedConstraints = new List<DistanceConstraint>(cableSystem.Constraints);
            sortedConstraints.Sort((a, b) =>
            {
                float errorA = a.GetConstraintError();
                float errorB = b.GetConstraintError();
                return errorB.CompareTo(errorA);
            });

            for (int iter = 0; iter < solverIterations; iter++)
            {
                foreach (var constraint in sortedConstraints)
                {
                    constraint.Satisfy(iter, solverIterations);
                }

                if (iter % 2 == 0)
                {
                    sortedConstraints.Reverse();
                }
            }
        }

        private void EnforceCableLengthConstraintHard(CableSystem cableSystem)
        {
            if (cableSystem.Cables == null) return;

            foreach (var cable in cableSystem.Cables)
            {
                EnforceSingleCableLength(cable);
            }
        }

        private void EnforceSingleCableLength(Cable cable)
        {
            if (cable.Segments.Count == 0 || cable.riggingPoint == null) return;

            VerletParticle topParticle = cable.Segments[0].particleA;
            VerletParticle bottomParticle = cable.Segments[cable.Segments.Count - 1].particleB;

            if (topParticle == null || bottomParticle == null) return;

            topParticle.position = cable.riggingPoint.worldPosition;
            topParticle.previousPosition = topParticle.position;
            topParticle.isPinned = true;

            Vector3 cableDir = bottomParticle.position - topParticle.position;
            float currentLength = cableDir.magnitude;

            if (currentLength < 0.001f) return;

            cableDir /= currentLength;
            float targetLength = cable.riggingPoint.currentCableLength;
            float maxLengthChange = 0.5f;

            if (currentLength > targetLength)
            {
                float excess = currentLength - targetLength;
                float correction = Mathf.Min(excess, maxLengthChange);

                Vector3 correctionVector = cableDir * correction;
                if (!bottomParticle.isPinned)
                {
                    bottomParticle.position -= correctionVector;
                }

                RedistributeAlongCable(cable, targetLength);
            }
            else if (currentLength < targetLength * 0.5f)
            {
                Vector3 correctionVector = cableDir * (targetLength * 0.5f - currentLength);
                if (!bottomParticle.isPinned)
                {
                    bottomParticle.position += correctionVector;
                }
            }
        }

        private void RedistributeAlongCable(Cable cable, float targetLength)
        {
            if (cable.Particles.Count < 3) return;

            float segmentTargetLength = targetLength / (cable.Particles.Count - 1);

            for (int i = 1; i < cable.Particles.Count - 1; i++)
            {
                VerletParticle prev = cable.Particles[i - 1];
                VerletParticle curr = cable.Particles[i];
                VerletParticle next = cable.Particles[i + 1];

                Vector3 dir = next.position - prev.position;
                float len = dir.magnitude;
                if (len > 0.001f)
                {
                    dir /= len;
                    Vector3 idealPos = prev.position + dir * segmentTargetLength;
                    curr.position = Vector3.Lerp(curr.position, idealPos, 0.3f);
                }
            }
        }

        private void UpdateActorState(ActorState actor, CableSystem cableSystem)
        {
            if (cableSystem.ActorParticle == null) return;

            actor.position = cableSystem.ActorParticle.position;
            actor.velocity = (cableSystem.ActorParticle.position - cableSystem.ActorParticle.previousPosition) / Mathf.Max(timeStep, 0.0001f);
            actor.acceleration = cableSystem.ActorParticle.acceleration;
            actor.bounds.center = actor.position;

            UpdateRigidBodyRotation(actor, cableSystem);
        }

        private void UpdateRigidBodyRotation(ActorState actor, CableSystem cableSystem)
        {
            if (cableSystem.ActorParticle == null) return;

            List<Cable> activeCables = cableSystem.Cables.FindAll(c =>
                c.riggingPoint != null && c.riggingPoint.isEnabled && c.Segments.Count > 0);

            if (activeCables.Count >= 2)
            {
                Vector3 forceSum = Vector3.zero;
                Vector3 torqueSum = Vector3.zero;

                foreach (var cable in activeCables)
                {
                    if (cable.Segments.Count == 0) continue;

                    VerletParticle topParticle = cable.Segments[0].particleA;
                    VerletParticle bottomParticle = cable.Segments[cable.Segments.Count - 1].particleB;

                    if (topParticle == null || bottomParticle == null) continue;

                    Vector3 cableDirection = topParticle.position - bottomParticle.position;
                    float cableLength = cableDirection.magnitude;
                    if (cableLength < 0.001f) continue;

                    cableDirection /= cableLength;
                    float tension = cable.riggingPoint.tension;
                    float maxTension = 10000f;
                    tension = Mathf.Clamp(tension, 0f, maxTension);

                    Vector3 force = cableDirection * tension;
                    forceSum += force;

                    Vector3 attachPoint = bottomParticle.position - actor.position;
                    torqueSum += Vector3.Cross(attachPoint, force);
                }

                float maxTorque = 5000f;
                torqueSum = Vector3.ClampMagnitude(torqueSum, maxTorque);

                Vector3 angularAcceleration = new Vector3(
                    torqueSum.x / Mathf.Max(actor.inertiaTensor.x, 0.001f),
                    torqueSum.y / Mathf.Max(actor.inertiaTensor.y, 0.001f),
                    torqueSum.z / Mathf.Max(actor.inertiaTensor.z, 0.001f)
                );

                actor.angularVelocity += angularAcceleration * timeStep;
                actor.angularVelocity *= 0.95f;
                actor.angularVelocity = Vector3.ClampMagnitude(actor.angularVelocity, 10f);

                float angle = actor.angularVelocity.magnitude * timeStep;
                if (angle > 0.0001f)
                {
                    Quaternion deltaRotation = Quaternion.AngleAxis(angle * Mathf.Rad2Deg, actor.angularVelocity.normalized);
                    actor.rotation = deltaRotation * actor.rotation;
                }
            }
        }

        private void RecoverFromInstability(ActorState actor, CableSystem cableSystem)
        {
            Debug.LogWarning("检测到数值不稳定，正在恢复...");

            foreach (var particle in cableSystem.Particles)
            {
                if (!particle.isPinned)
                {
                    particle.ResetVelocity();
                }
            }

            foreach (var cable in cableSystem.Cables)
            {
                if (cable.riggingPoint == null || cable.Particles.Count < 2) continue;

                Vector3 dir = actor.position - cable.riggingPoint.worldPosition;
                float len = dir.magnitude;
                if (len > 0.001f)
                {
                    dir /= len;
                    float targetLen = cable.riggingPoint.currentCableLength;

                    for (int i = 1; i < cable.Particles.Count; i++)
                    {
                        float t = (float)i / (cable.Particles.Count - 1);
                        cable.Particles[i].position = cable.riggingPoint.worldPosition + dir * targetLen * t;
                        cable.Particles[i].previousPosition = cable.Particles[i].position;
                    }
                }
            }

            actor.velocity = Vector3.ClampMagnitude(actor.velocity, 1f);
            actor.angularVelocity = Vector3.ClampMagnitude(actor.angularVelocity, 1f);

            stabilityMonitor.Reset();
        }

        public void SetSceneBounds(Bounds bounds)
        {
            sceneBounds = bounds;
        }
    }
}