using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public class TrajectoryController
    {
        private List<Vector3> bezierControlPoints = new List<Vector3>();
        public bool HasBezierCurve => bezierControlPoints.Count >= 4;
        public float totalDuration = 10f;

        public void SetBezierControlPoints(Vector3[] points)
        {
            bezierControlPoints.Clear();
            bezierControlPoints.AddRange(points);
        }

        public void AddControlPoint(Vector3 point)
        {
            bezierControlPoints.Add(point);
        }

        public void ClearControlPoints()
        {
            bezierControlPoints.Clear();
        }

        public Vector3 EvaluateBezier(float time)
        {
            if (!HasBezierCurve) return Vector3.zero;

            float t = Mathf.Clamp01(time / totalDuration);

            if (bezierControlPoints.Count == 4)
            {
                return EvaluateCubicBezier(
                    bezierControlPoints[0], bezierControlPoints[1],
                    bezierControlPoints[2], bezierControlPoints[3], t);
            }

            return EvaluateBSpline(bezierControlPoints, t);
        }

        public Vector3 EvaluateCubicBezier(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, float t)
        {
            float u = 1f - t;
            float u2 = u * u;
            float u3 = u2 * u;
            float t2 = t * t;
            float t3 = t2 * t;

            return u3 * p0 + 3f * u2 * t * p1 + 3f * u * t2 * p2 + t3 * p3;
        }

        private Vector3 EvaluateBSpline(List<Vector3> points, float t)
        {
            int n = points.Count - 1;
            int segmentCount = n - 2;
            if (segmentCount < 1) return points[0];

            float scaledT = t * segmentCount;
            int segment = Mathf.Clamp(Mathf.FloorToInt(scaledT), 0, segmentCount - 1);
            float localT = scaledT - segment;

            Vector3 p0 = points[segment];
            Vector3 p1 = points[segment + 1];
            Vector3 p2 = points[segment + 2];
            Vector3 p3 = segment + 3 < points.Count ? points[segment + 3] : points[segment + 2];

            float u = localT;
            float u2 = u * u;
            float u3 = u2 * u;

            return (1f / 6f) * (
                (-p0 + 3f * p1 - 3f * p2 + p3) * u3 +
                (3f * p0 - 6f * p1 + 3f * p2) * u2 +
                (-3f * p0 + 3f * p2) * u +
                (p0 + 4f * p1 + p2)
            );
        }

        public Vector3 EvaluateCubicBezierDerivative(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, float t)
        {
            float u = 1f - t;
            return 3f * u * u * (p1 - p0) + 6f * u * t * (p2 - p1) + 3f * t * t * (p3 - p2);
        }

        public Vector3 GetVelocityAtTime(float time)
        {
            if (!HasBezierCurve) return Vector3.zero;

            float t = Mathf.Clamp01(time / totalDuration);
            if (bezierControlPoints.Count == 4)
            {
                return EvaluateCubicBezierDerivative(
                    bezierControlPoints[0], bezierControlPoints[1],
                    bezierControlPoints[2], bezierControlPoints[3], t) / totalDuration;
            }

            float dt = 0.01f;
            Vector3 pos1 = EvaluateBezier(time);
            Vector3 pos2 = EvaluateBezier(time + dt);
            return (pos2 - pos1) / dt;
        }

        public Vector3 GetAccelerationAtTime(float time)
        {
            float dt = 0.01f;
            Vector3 vel1 = GetVelocityAtTime(time);
            Vector3 vel2 = GetVelocityAtTime(time + dt);
            return (vel2 - vel1) / dt;
        }

        public List<Vector3> GetControlPoints()
        {
            return new List<Vector3>(bezierControlPoints);
        }

        public Vector3[] SamplePath(int sampleCount)
        {
            Vector3[] samples = new Vector3[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                float t = (float)i / (sampleCount - 1);
                samples[i] = EvaluateBezier(t * totalDuration);
            }
            return samples;
        }

        public float EstimatePathLength(int samples = 100)
        {
            float length = 0f;
            Vector3 prev = EvaluateBezier(0f);
            for (int i = 1; i <= samples; i++)
            {
                float t = (float)i / samples * totalDuration;
                Vector3 curr = EvaluateBezier(t);
                length += Vector3.Distance(prev, curr);
                prev = curr;
            }
            return length;
        }
    }
}