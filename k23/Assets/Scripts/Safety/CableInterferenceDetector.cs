using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    [System.Serializable]
    public class CableInterferenceResult
    {
        public int cableAIndex;
        public int cableBIndex;
        public float minimumDistance;
        public Vector3 closestPointA;
        public Vector3 closestPointB;
        public bool isHighRisk;
        public bool isCritical;
        public float riskFactor;

        public CableInterferenceResult(int a, int b)
        {
            cableAIndex = a;
            cableBIndex = b;
            minimumDistance = float.MaxValue;
            closestPointA = Vector3.zero;
            closestPointB = Vector3.zero;
            isHighRisk = false;
            isCritical = false;
            riskFactor = 0f;
        }
    }

    [System.Serializable]
    public class UnwindingAction
    {
        public int cableIndex;
        public float lengthAdjustment;
        public Vector3 positionAdjustment;
        public float priority;
        public string description;

        public UnwindingAction(int idx, float lenAdj, string desc)
        {
            cableIndex = idx;
            lengthAdjustment = lenAdj;
            positionAdjustment = Vector3.zero;
            priority = 1f;
            description = desc;
        }
    }

    public class CableInterferenceDetector
    {
        public float WarningThreshold { get; set; } = 0.1f;
        public float CriticalThreshold { get; set; } = 0.05f;
        public float CableRadius { get; set; } = 0.015f;

        private List<CableInterferenceResult> lastResults = new List<CableInterferenceResult>();
        public List<CableInterferenceResult> LastResults => lastResults;

        public CableInterferenceDetector()
        {
        }

        public List<CableInterferenceResult> DetectInterference(CableSystem cableSystem)
        {
            lastResults.Clear();

            if (cableSystem == null || cableSystem.Cables == null || cableSystem.Cables.Count < 2)
                return lastResults;

            int cableCount = cableSystem.Cables.Count;

            for (int i = 0; i < cableCount; i++)
            {
                for (int j = i + 1; j < cableCount; j++)
                {
                    CableInterferenceResult result = CheckCablePair(
                        cableSystem.Cables[i], i,
                        cableSystem.Cables[j], j);

                    if (result.minimumDistance < WarningThreshold)
                    {
                        lastResults.Add(result);
                    }
                }
            }

            lastResults.Sort((a, b) => a.minimumDistance.CompareTo(b.minimumDistance));

            return lastResults;
        }

        private CableInterferenceResult CheckCablePair(Cable cableA, int indexA, Cable cableB, int indexB)
        {
            CableInterferenceResult result = new CableInterferenceResult(indexA, indexB);

            if (cableA.Particles.Count < 2 || cableB.Particles.Count < 2)
                return result;

            float minDist = float.MaxValue;
            Vector3 closestA = Vector3.zero;
            Vector3 closestB = Vector3.zero;

            for (int i = 0; i < cableA.Particles.Count - 1; i++)
            {
                Vector3 a1 = cableA.Particles[i].position;
                Vector3 a2 = cableA.Particles[i + 1].position;

                for (int j = 0; j < cableB.Particles.Count - 1; j++)
                {
                    Vector3 b1 = cableB.Particles[j].position;
                    Vector3 b2 = cableB.Particles[j + 1].position;

                    Vector3 cpA, cpB;
                    float dist = DistanceBetweenLineSegments(a1, a2, b1, b2, out cpA, out cpB);

                    if (dist < minDist)
                    {
                        minDist = dist;
                        closestA = cpA;
                        closestB = cpB;
                    }
                }
            }

            result.minimumDistance = minDist - CableRadius * 2f;
            result.closestPointA = closestA;
            result.closestPointB = closestB;

            float effectiveDist = result.minimumDistance;
            result.isCritical = effectiveDist < CriticalThreshold;
            result.isHighRisk = effectiveDist < WarningThreshold;
            result.riskFactor = 1f - Mathf.Clamp01(effectiveDist / WarningThreshold);

            return result;
        }

        public static float DistanceBetweenLineSegments(
            Vector3 p1, Vector3 p2, Vector3 p3, Vector3 p4,
            out Vector3 closestPointOnSegment1, out Vector3 closestPointOnSegment2)
        {
            Vector3 u = p2 - p1;
            Vector3 v = p4 - p3;
            Vector3 w = p1 - p3;

            float a = Vector3.Dot(u, u);
            float b = Vector3.Dot(u, v);
            float c = Vector3.Dot(v, v);
            float d = Vector3.Dot(u, w);
            float e = Vector3.Dot(v, w);
            float denom = a * c - b * b;

            float s, t;

            if (denom < 0.00001f)
            {
                s = 0f;
                t = (b > c ? d / b : e / c);
            }
            else
            {
                s = (b * e - c * d) / denom;
                t = (a * e - b * d) / denom;
            }

            s = Mathf.Clamp01(s);
            t = Mathf.Clamp01(t);

            if (s < 0f)
            {
                s = 0f;
                t = Mathf.Clamp01(e / c);
            }
            else if (s > 1f)
            {
                s = 1f;
                t = Mathf.Clamp01((e + b) / c);
            }

            if (t < 0f)
            {
                t = 0f;
                if (s < 0f) s = 0f;
                else if (s > 1f) s = 1f;
                else s = Mathf.Clamp01(-d / a);
            }
            else if (t > 1f)
            {
                t = 1f;
                if (s < 0f) s = 0f;
                else if (s > 1f) s = 1f;
                else s = Mathf.Clamp01((-d + b) / a);
            }

            closestPointOnSegment1 = p1 + s * u;
            closestPointOnSegment2 = p3 + t * v;

            return Vector3.Distance(closestPointOnSegment1, closestPointOnSegment2);
        }

        public List<UnwindingAction> GenerateUnwindingSequence(
            List<CableInterferenceResult> interferences,
            List<RiggingPoint> riggingPoints,
            ActorState actor)
        {
            List<UnwindingAction> actions = new List<UnwindingAction>();

            if (interferences == null || interferences.Count == 0)
                return actions;

            foreach (var interference in interferences)
            {
                if (!interference.isHighRisk) continue;

                int idxA = interference.cableAIndex;
                int idxB = interference.cableBIndex;

                if (idxA >= riggingPoints.Count || idxB >= riggingPoints.Count)
                    continue;

                RiggingPoint rpA = riggingPoints[idxA];
                RiggingPoint rpB = riggingPoints[idxB];

                Vector3 dir = rpA.worldPosition - rpB.worldPosition;
                float currentDist = dir.magnitude;

                if (currentDist < 0.001f)
                {
                    actions.Add(new UnwindingAction(idxA, 0.2f,
                        $"吊点{idxA + 1}释放0.2m以分离"));
                    actions.Add(new UnwindingAction(idxB, -0.1f,
                        $"吊点{idxB + 1}收回0.1m以分离"));
                    continue;
                }

                Vector3 midPoint = (interference.closestPointA + interference.closestPointB) * 0.5f;
                Vector3 toActor = actor.position - midPoint;
                float distToActor = toActor.magnitude;

                if (distToActor > 0.001f)
                {
                    toActor.Normalize();
                }
                else
                {
                    toActor = Vector3.up;
                }

                float riskLevel = interference.riskFactor;

                if (interference.isCritical)
                {
                    float requiredSeparation = WarningThreshold * 2f;
                    float lengthChange = requiredSeparation * riskLevel;

                    if (rpA.currentCableLength > rpB.currentCableLength)
                    {
                        actions.Add(new UnwindingAction(idxA, lengthChange,
                            $"[紧急] 吊点{idxA + 1}释放{lengthChange:F2}m"));
                        actions.Add(new UnwindingAction(idxB, -lengthChange * 0.5f,
                            $"[紧急] 吊点{idxB + 1}收回{lengthChange * 0.5f:F2}m"));
                    }
                    else
                    {
                        actions.Add(new UnwindingAction(idxB, lengthChange,
                            $"[紧急] 吊点{idxB + 1}释放{lengthChange:F2}m"));
                        actions.Add(new UnwindingAction(idxA, -lengthChange * 0.5f,
                            $"[紧急] 吊点{idxA + 1}收回{lengthChange * 0.5f:F2}m"));
                    }
                }
                else
                {
                    float adjustment = 0.05f * riskLevel;
                    actions.Add(new UnwindingAction(idxA, adjustment,
                        $"吊点{idxA + 1}微调释放{adjustment:F2}m"));
                }
            }

            actions.Sort((a, b) => b.priority.CompareTo(a.priority));

            return actions;
        }

        public bool HasCriticalInterference()
        {
            foreach (var result in lastResults)
            {
                if (result.isCritical) return true;
            }
            return false;
        }

        public float GetMinimumDistance()
        {
            float minDist = float.MaxValue;
            foreach (var result in lastResults)
            {
                if (result.minimumDistance < minDist)
                    minDist = result.minimumDistance;
            }
            return minDist;
        }
    }
}