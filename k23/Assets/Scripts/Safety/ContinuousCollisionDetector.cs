using UnityEngine;

namespace TheaterRigging
{
    public class ContinuousCollisionDetector
    {
        private const int MaxSweepIterations = 10;
        private const float CollisionEpsilon = 0.001f;
        private const float TimeEpsilon = 0.0001f;

        public CCDResult SweepTest(ActorState actor, CollisionBox obstacle)
        {
            if (actor == null || obstacle == null || !obstacle.isEnabled)
            {
                return CCDResult.NoCollision;
            }

            Bounds actorBounds = actor.bounds;
            Bounds prevActorBounds = actor.previousBounds;
            Vector3 displacement = actor.GetDisplacement();

            Bounds expandedBounds = obstacle.bounds;
            expandedBounds.Expand(actorBounds.extents);

            Vector3 rayStart = prevActorBounds.center;
            Vector3 rayEnd = actorBounds.center;

            float hitTime;
            Vector3 hitNormal;
            if (RayBoxIntersect(rayStart, rayEnd, expandedBounds, out hitTime, out hitNormal))
            {
                if (hitTime >= 0f && hitTime <= 1f)
                {
                    Vector3 hitPoint = Vector3.Lerp(rayStart, rayEnd, hitTime);
                    Vector3 adjustedPos = hitPoint - displacement * (1f - hitTime) * CollisionEpsilon;

                    return new CCDResult
                    {
                        hasCollision = true,
                        timeOfImpact = hitTime,
                        hitPoint = hitPoint,
                        hitNormal = hitNormal,
                        objectName = obstacle.name,
                        adjustedPosition = adjustedPos
                    };
                }
            }

            return CCDResult.NoCollision;
        }

        private bool RayBoxIntersect(Vector3 start, Vector3 end, Bounds box, out float hitTime, out Vector3 hitNormal)
        {
            hitTime = 1f;
            hitNormal = Vector3.up;

            Vector3 direction = end - start;
            float tMin = 0f;
            Vector3 minNormal = Vector3.zero;
            float tMax = 1f;

            Vector3 boxMin = box.min;
            Vector3 boxMax = box.max;

            for (int axis = 0; axis < 3; axis++)
            {
                float axisDir = GetAxisValue(direction, axis);
                float axisStart = GetAxisValue(start, axis);
                float axisBoxMin = GetAxisValue(boxMin, axis);
                float axisBoxMax = GetAxisValue(boxMax, axis);

                if (Mathf.Abs(axisDir) < TimeEpsilon)
                {
                    if (axisStart < axisBoxMin || axisStart > axisBoxMax)
                    {
                        return false;
                    }
                }
                else
                {
                    float invDir = 1f / axisDir;
                    float tNear = (axisBoxMin - axisStart) * invDir;
                    float tFar = (axisBoxMax - axisStart) * invDir;
                    Vector3 nearNormal = GetAxisNormal(axis, true);
                    Vector3 farNormal = GetAxisNormal(axis, false);

                    if (tNear > tFar)
                    {
                        float temp = tNear;
                        tNear = tFar;
                        tFar = temp;

                        Vector3 tempNormal = nearNormal;
                        nearNormal = farNormal;
                        farNormal = tempNormal;
                    }

                    if (tNear > tMin)
                    {
                        tMin = tNear;
                        minNormal = nearNormal;
                    }

                    tMax = Mathf.Min(tMax, tFar);

                    if (tMin > tMax)
                    {
                        return false;
                    }
                }
            }

            if (tMin < 0f || tMin > 1f)
            {
                return false;
            }

            hitTime = tMin;
            hitNormal = minNormal;
            return true;
        }

        private float GetAxisValue(Vector3 vec, int axis)
        {
            switch (axis)
            {
                case 0: return vec.x;
                case 1: return vec.y;
                case 2: return vec.z;
                default: return 0f;
            }
        }

        private Vector3 GetAxisNormal(int axis, bool positive)
        {
            float sign = positive ? -1f : 1f;
            switch (axis)
            {
                case 0: return Vector3.right * sign;
                case 1: return Vector3.up * sign;
                case 2: return Vector3.forward * sign;
                default: return Vector3.up;
            }
        }

        public CCDResult ConservativeAdvancement(ActorState actor, CollisionBox obstacle, float dt)
        {
            float timeRemaining = 1f;
            float totalTime = 0f;

            Vector3 currentPos = actor.previousPosition;
            Vector3 targetPos = actor.position;
            Vector3 displacement = targetPos - currentPos;

            Bounds actorBounds = actor.bounds;

            for (int iteration = 0; iteration < MaxSweepIterations; iteration++)
            {
                Vector3 tempPos = Vector3.Lerp(actor.previousPosition, actor.position, totalTime + timeRemaining * 0.5f);
                Bounds tempBounds = new Bounds(tempPos, actorBounds.size);

                float minDist = GetMinimumDistance(tempBounds, obstacle.bounds);
                float distEstimate = displacement.magnitude * timeRemaining;

                if (minDist < CollisionEpsilon)
                {
                    timeRemaining *= 0.5f;
                    continue;
                }

                if (distEstimate < minDist)
                {
                    break;
                }

                float advanceRatio = Mathf.Min(minDist / Mathf.Max(distEstimate, 0.001f), 1f);
                float advanceTime = timeRemaining * advanceRatio * 0.8f;

                totalTime += advanceTime;
                timeRemaining -= advanceTime;

                if (timeRemaining < TimeEpsilon)
                {
                    break;
                }
            }

            Vector3 finalPos = Vector3.Lerp(actor.previousPosition, actor.position, totalTime);
            Bounds finalBounds = new Bounds(finalPos, actorBounds.size);
            finalBounds.center = finalPos;

            if (finalBounds.Intersects(obstacle.bounds))
            {
                Vector3 hitNormal = (finalPos - obstacle.bounds.center).normalized;
                return new CCDResult
                {
                    hasCollision = true,
                    timeOfImpact = totalTime,
                    hitPoint = finalPos,
                    hitNormal = hitNormal,
                    objectName = obstacle.name,
                    adjustedPosition = finalPos - hitNormal * CollisionEpsilon * 10f
                };
            }

            return CCDResult.NoCollision;
        }

        private float GetMinimumDistance(Bounds a, Bounds b)
        {
            Vector3 closestA = a.ClosestPoint(b.center);
            Vector3 closestB = b.ClosestPoint(a.center);
            return Vector3.Distance(closestA, closestB);
        }

        public void ResolveCollision(ActorState actor, CCDResult result)
        {
            if (!result.hasCollision) return;

            actor.position = result.adjustedPosition;

            Vector3 velocity = actor.velocity;
            float normalVelocity = Vector3.Dot(velocity, result.hitNormal);

            if (normalVelocity < 0f)
            {
                Vector3 tangentVelocity = velocity - result.hitNormal * normalVelocity;
                float restitution = 0.2f;
                float friction = 0.8f;
                actor.velocity = tangentVelocity * friction - result.hitNormal * normalVelocity * restitution;
            }

            actor.bounds.center = actor.position;
        }

        public CCDResult SweepTestAll(ActorState actor, CollisionBox[] obstacles)
        {
            CCDResult earliestHit = CCDResult.NoCollision;
            earliestHit.timeOfImpact = 1f;

            foreach (var obstacle in obstacles)
            {
                if (obstacle == null || !obstacle.isEnabled) continue;

                CCDResult hit = SweepTest(actor, obstacle);
                if (hit.hasCollision && hit.timeOfImpact < earliestHit.timeOfImpact)
                {
                    earliestHit = hit;
                }
            }

            return earliestHit;
        }
    }
}