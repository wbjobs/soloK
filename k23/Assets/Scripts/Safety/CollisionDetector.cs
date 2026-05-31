using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public class CollisionDetector
    {
        private List<CollisionBox> collisionBoxes;
        private ContinuousCollisionDetector ccdDetector;
        public List<CollisionBox> CollisionBoxes => collisionBoxes;
        public CCDResult LastCCDResult { get; private set; }

        public bool CCDEnabled { get; set; } = true;
        public float CCDEnergyDamping { get; set; } = 0.5f;
        public int MaxCCDIterations { get; set; } = 3;

        public CollisionDetector(List<CollisionBox> boxes)
        {
            collisionBoxes = boxes;
            ccdDetector = new ContinuousCollisionDetector();
            LastCCDResult = CCDResult.NoCollision;
        }

        public void CheckCollisions(ActorState actor)
        {
            if (collisionBoxes == null || actor == null) return;

            bool needsCCD = actor.NeedsCCD();
            bool collisionResolved = false;

            if (CCDEnabled && needsCCD)
            {
                for (int iteration = 0; iteration < MaxCCDIterations; iteration++)
                {
                    CCDResult ccdResult = CheckCCD(actor);
                    if (ccdResult.hasCollision)
                    {
                        LastCCDResult = ccdResult;
                        ResolveCCD(actor, ccdResult);
                        collisionResolved = true;
                    }
                    else
                    {
                        break;
                    }
                }
            }

            CheckStaticCollisions(actor, collisionResolved);
        }

        private void CheckStaticCollisions(ActorState actor, bool ccdResolved)
        {
            Bounds actorBounds = actor.bounds;
            actorBounds.center = actor.position;

            foreach (var box in collisionBoxes)
            {
                if (!box.isEnabled)
                {
                    box.isColliding = false;
                    continue;
                }

                bool intersects = actorBounds.Intersects(box.bounds);
                box.isColliding = intersects || (ccdResolved && LastCCDResult.objectName == box.name);

                if (intersects && !ccdResolved)
                {
                    ResolveStaticPenetration(actor, box);
                }
            }
        }

        private void ResolveStaticPenetration(ActorState actor, CollisionBox box)
        {
            Bounds actorBounds = actor.bounds;
            actorBounds.center = actor.position;

            Vector3 penetrationDepth = CalculatePenetrationDepth(actorBounds, box.bounds);
            if (penetrationDepth != Vector3.zero)
            {
                actor.position += penetrationDepth;
                actor.bounds.center = actor.position;

                Vector3 normal = penetrationDepth.normalized;
                float normalVelocity = Vector3.Dot(actor.velocity, normal);
                if (normalVelocity < 0f)
                {
                    actor.velocity -= normal * normalVelocity * (1f + CCDEnergyDamping);
                }
            }
        }

        private Vector3 CalculatePenetrationDepth(Bounds actor, Bounds obstacle)
        {
            Vector3[] axes = { Vector3.right, Vector3.up, Vector3.forward };
            float minDepth = float.MaxValue;
            Vector3 minAxis = Vector3.zero;

            foreach (Vector3 axis in axes)
            {
                float actorMin = Vector3.Dot(actor.min, axis);
                float actorMax = Vector3.Dot(actor.max, axis);
                float obstacleMin = Vector3.Dot(obstacle.min, axis);
                float obstacleMax = Vector3.Dot(obstacle.max, axis);

                float overlap1 = actorMax - obstacleMin;
                float overlap2 = obstacleMax - actorMin;

                if (overlap1 < 0 || overlap2 < 0)
                {
                    return Vector3.zero;
                }

                float depth = Mathf.Min(overlap1, overlap2);
                if (depth < minDepth)
                {
                    minDepth = depth;
                    minAxis = overlap1 < overlap2 ? -axis : axis;
                }
            }

            return minAxis * minDepth;
        }

        private CCDResult CheckCCD(ActorState actor)
        {
            CCDResult earliestHit = CCDResult.NoCollision;
            earliestHit.timeOfImpact = 1f;

            foreach (var box in collisionBoxes)
            {
                if (!box.isEnabled) continue;

                CCDResult hit = ccdDetector.SweepTest(actor, box);

                if (hit.hasCollision && hit.timeOfImpact < earliestHit.timeOfImpact)
                {
                    earliestHit = hit;
                }
            }

            return earliestHit;
        }

        private void ResolveCCD(ActorState actor, CCDResult result)
        {
            ccdDetector.ResolveCollision(actor, result);
            actor.SavePreviousState();
        }

        public bool HasCollision()
        {
            if (collisionBoxes == null) return false;
            foreach (var box in collisionBoxes)
            {
                if (box.isColliding) return true;
            }
            return false;
        }

        public List<string> GetCollidingBoxNames()
        {
            List<string> names = new List<string>();
            if (collisionBoxes == null) return names;

            foreach (var box in collisionBoxes)
            {
                if (box.isColliding)
                    names.Add(box.name);
            }
            return names;
        }

        public float GetClosestDistance(ActorState actor)
        {
            if (collisionBoxes == null || collisionBoxes.Count == 0) return float.MaxValue;

            float minDist = float.MaxValue;
            Bounds actorBounds = actor.bounds;
            actorBounds.center = actor.position;

            foreach (var box in collisionBoxes)
            {
                if (!box.isEnabled) continue;

                Vector3 closestPoint = box.bounds.ClosestPoint(actor.position);
                float dist = Vector3.Distance(actor.position, closestPoint);
                if (dist < minDist) minDist = dist;
            }

            return minDist;
        }

        public void AddBox(CollisionBox box)
        {
            if (collisionBoxes == null)
                collisionBoxes = new List<CollisionBox>();
            collisionBoxes.Add(box);
        }

        public void RemoveBox(string name)
        {
            if (collisionBoxes == null) return;
            collisionBoxes.RemoveAll(b => b.name == name);
        }

        public void SetBoxEnabled(string name, bool enabled)
        {
            if (collisionBoxes == null) return;
            CollisionBox box = collisionBoxes.Find(b => b.name == name);
            if (box != null) box.isEnabled = enabled;
        }
    }
}