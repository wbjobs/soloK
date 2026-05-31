using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public class Cable
    {
        public RiggingPoint riggingPoint;
        public List<VerletParticle> Particles = new List<VerletParticle>();
        public List<DistanceConstraint> Segments = new List<DistanceConstraint>();
        public LineRenderer lineRenderer;
        public int segmentCount;

        public Cable(RiggingPoint rp, int segments, float segmentLen, float massPerSeg,
                     float stiffness, float damping, ActorState actor, Vector3 attachOffset)
        {
            riggingPoint = rp;
            segmentCount = segments;

            Vector3 attachPos = actor.position + attachOffset;
            Vector3 dir = (attachPos - rp.worldPosition).normalized;

            Particles.Add(new VerletParticle(rp.worldPosition, 0f, true));

            for (int i = 1; i < segments; i++)
            {
                float t = (float)i / segments;
                Vector3 pos = Vector3.Lerp(rp.worldPosition, attachPos, t);
                Particles.Add(new VerletParticle(pos, massPerSeg));
            }

            Particles.Add(new VerletParticle(attachPos, actor.mass / 8f));

            for (int i = 0; i < Particles.Count - 1; i++)
            {
                float restLen = Vector3.Distance(Particles[i].position, Particles[i + 1].position);
                Segments.Add(new DistanceConstraint(Particles[i], Particles[i + 1], restLen, stiffness, damping));
            }
        }

        public void UpdateTargetLength(float targetLength)
        {
            if (Segments.Count == 0) return;

            float totalRestLength = 0f;
            foreach (var seg in Segments) totalRestLength += seg.restLength;

            if (totalRestLength < 0.001f) return;

            float scaleFactor = targetLength / totalRestLength;

            foreach (var seg in Segments)
            {
                seg.restLength *= scaleFactor;
            }
        }

        public float GetTotalTension()
        {
            float total = 0f;
            foreach (var seg in Segments)
                total += Mathf.Max(0f, seg.tension);
            return total;
        }
    }

    public class CableSystem
    {
        public List<Cable> Cables = new List<Cable>();
        public List<VerletParticle> Particles = new List<VerletParticle>();
        public List<DistanceConstraint> Constraints = new List<DistanceConstraint>();
        public VerletParticle ActorParticle;

        private float stiffness;
        private float damping;
        private float segmentLength;
        private float massPerSegment;
        private int maxSegments;

        public CableSystem(float stiff, float damp, float segLen, float massPerSeg, int maxSeg)
        {
            stiffness = stiff;
            damping = damp;
            segmentLength = segLen;
            massPerSegment = massPerSeg;
            maxSegments = maxSeg;
        }

        public void BuildCables(List<RiggingPoint> riggingPoints, ActorState actor, Vector3 attachOffset)
        {
            Cables.Clear();
            Particles.Clear();
            Constraints.Clear();
            ActorParticle = null;

            foreach (var rp in riggingPoints)
            {
                if (!rp.isEnabled) continue;

                float cableLen = rp.currentCableLength;
                int segments = Mathf.Clamp(
                    Mathf.CeilToInt(cableLen / segmentLength),
                    3, maxSegments);

                Cable cable = new Cable(rp, segments, segmentLength, massPerSegment,
                                        stiffness, damping, actor, attachOffset);
                Cables.Add(cable);

                foreach (var particle in cable.Particles)
                {
                    if (!Particles.Contains(particle))
                        Particles.Add(particle);
                }

                foreach (var segment in cable.Segments)
                {
                    if (!Constraints.Contains(segment))
                        Constraints.Add(segment);
                }
            }

            if (Cables.Count > 0 && Cables[0].Particles.Count > 0)
            {
                ActorParticle = Cables[0].Particles[Cables[0].Particles.Count - 1];
            }

            ConnectActorParticles(actor);
        }

        private void ConnectActorParticles(ActorState actor)
        {
            if (Cables.Count < 2) return;

            List<VerletParticle> actorParticles = new List<VerletParticle>();
            foreach (var cable in Cables)
            {
                if (cable.Particles.Count > 0)
                {
                    VerletParticle lastParticle = cable.Particles[cable.Particles.Count - 1];
                    if (!actorParticles.Contains(lastParticle))
                        actorParticles.Add(lastParticle);
                }
            }

            float actorMassPerPoint = actor.mass / Mathf.Max(actorParticles.Count, 1);
            foreach (var ap in actorParticles)
            {
                ap.mass = actorMassPerPoint;
            }

            for (int i = 0; i < actorParticles.Count; i++)
            {
                for (int j = i + 1; j < actorParticles.Count; j++)
                {
                    float dist = Vector3.Distance(actorParticles[i].position, actorParticles[j].position);
                    DistanceConstraint constraint = new DistanceConstraint(
                        actorParticles[i], actorParticles[j],
                        Mathf.Max(dist, 0.3f), stiffness * 2f, damping);
                    Constraints.Add(constraint);
                }
            }
        }

        public void UpdateCableLengths(List<RiggingPoint> riggingPoints)
        {
            for (int i = 0; i < Cables.Count && i < riggingPoints.Count; i++)
            {
                Cables[i].UpdateTargetLength(riggingPoints[i].currentCableLength);
            }
        }

        public float[] GetCableTensions()
        {
            float[] tensions = new float[Cables.Count];
            for (int i = 0; i < Cables.Count; i++)
            {
                tensions[i] = Cables[i].GetTotalTension();
            }
            return tensions;
        }

        public Vector3[] GetCablePositions(int cableIndex)
        {
            if (cableIndex < 0 || cableIndex >= Cables.Count)
                return new Vector3[0];

            Cable cable = Cables[cableIndex];
            Vector3[] positions = new Vector3[cable.Particles.Count];
            for (int i = 0; i < cable.Particles.Count; i++)
            {
                positions[i] = cable.Particles[i].position;
            }
            return positions;
        }
    }
}