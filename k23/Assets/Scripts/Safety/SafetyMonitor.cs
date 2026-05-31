using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public class SafetyMonitor
    {
        private float maxTensionKg;
        private float safetyFactor;
        private float maxTensionNewton;

        public float MaxTensionKg => maxTensionKg;
        public float SafetyFactor => safetyFactor;

        public SafetyMonitor(float maxKg, float factor)
        {
            maxTensionKg = maxKg;
            safetyFactor = factor;
            maxTensionNewton = maxKg * 9.81f;
        }

        public SafetyReport EvaluateSafety(List<RiggingPoint> riggingPoints, ActorState actor)
        {
            SafetyReport report = new SafetyReport();
            report.isSafe = true;

            float staticLoad = actor.mass * 9.81f;
            float maxTension = 0f;
            int overloadedPoint = -1;

            for (int i = 0; i < riggingPoints.Count; i++)
            {
                if (riggingPoints[i].tension > maxTension)
                {
                    maxTension = riggingPoints[i].tension;
                    if (riggingPoints[i].tension > maxTensionNewton)
                    {
                        overloadedPoint = i;
                    }
                }
            }

            report.maxTension = maxTension;
            report.overloadedPointIndex = overloadedPoint;

            report.dynamicLoadFactor = staticLoad > 0.001f
                ? maxTension / staticLoad
                : 1f;

            if (overloadedPoint >= 0)
            {
                report.isSafe = false;
                report.warningMessage = $"吊点 {riggingPoints[overloadedPoint].name} 超载！" +
                                       $"张力: {maxTension / 9.81f:F1}kg / {maxTensionKg}kg";
            }

            if (report.dynamicLoadFactor > safetyFactor)
            {
                report.isSafe = false;
                report.warningMessage += $" | 动载系数 {report.dynamicLoadFactor:F2} > {safetyFactor}";
            }

            report.impactVelocity = actor != null ? actor.velocity : Vector3.zero;

            return report;
        }

        public void UpdateThresholds(float maxKg, float factor)
        {
            maxTensionKg = maxKg;
            safetyFactor = factor;
            maxTensionNewton = maxKg * 9.81f;
        }

        public float GetStaticLoad(float mass)
        {
            return mass * 9.81f;
        }

        public float GetDynamicLoadRatio(float currentTension, float mass)
        {
            float staticLoad = GetStaticLoad(mass);
            return staticLoad > 0.001f ? currentTension / staticLoad : 1f;
        }

        public bool IsTensionSafe(float tension)
        {
            return tension <= maxTensionNewton;
        }

        public bool IsDynamicLoadSafe(float dynamicLoad)
        {
            return dynamicLoad <= safetyFactor;
        }
    }
}