using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public enum WindSourceType
    {
        HVAC,
        SideDoor,
        StageFan,
        Ambient,
        Custom
    }

    public enum PSDType
    {
        WhiteNoise,
        PinkNoise,
        BrownianNoise,
        VonKarman,
        Dryden,
        Custom
    }

    [System.Serializable]
    public class WindConfig
    {
        public WindSourceType sourceType = WindSourceType.HVAC;
        public PSDType psdType = PSDType.VonKarman;
        public float baseSpeed = 1f;
        public float turbulenceIntensity = 0.3f;
        public float gustFrequency = 0.5f;
        public float gustAmplitude = 0.5f;
        public Vector3 windDirection = Vector3.right;
        public float spatialCorrelation = 0.7f;
        public float cornerFrequency = 1f;

        public WindConfig()
        {
            windDirection.Normalize();
        }

        public WindConfig Clone()
        {
            return (WindConfig)MemberwiseClone();
        }
    }

    public class WindLoadModule
    {
        private WindConfig config;
        private float time;

        private List<float> noiseHistoryX = new List<float>();
        private List<float> noiseHistoryY = new List<float>();
        private List<float> noiseHistoryZ = new List<float>();
        private int noiseHistorySize = 512;

        private Vector3 currentWindVelocity;
        private Vector3 smoothedWindVelocity;

        private Vector3 actorWindForce;
        private Vector3 lastActorDrift;
        private Vector3 totalActorDrift;

        private Vector3[] spatialNoiseOffsets;

        private System.Random random;

        public Vector3 CurrentWindVelocity => currentWindVelocity;
        public Vector3 SmoothedWindVelocity => smoothedWindVelocity;
        public Vector3 ActorWindForce => actorWindForce;
        public Vector3 TotalActorDrift => totalActorDrift;
        public WindConfig Config => config;

        public WindLoadModule()
        {
            config = new WindConfig();
            random = new System.Random();
            InitializeNoiseHistory();
            currentWindVelocity = Vector3.zero;
            smoothedWindVelocity = Vector3.zero;
            actorWindForce = Vector3.zero;
            totalActorDrift = Vector3.zero;
        }

        public WindLoadModule(WindConfig cfg)
        {
            config = cfg;
            random = new System.Random();
            InitializeNoiseHistory();
            currentWindVelocity = Vector3.zero;
            smoothedWindVelocity = Vector3.zero;
            actorWindForce = Vector3.zero;
            totalActorDrift = Vector3.zero;
        }

        private void InitializeNoiseHistory()
        {
            noiseHistoryX.Clear();
            noiseHistoryY.Clear();
            noiseHistoryZ.Clear();

            for (int i = 0; i < noiseHistorySize; i++)
            {
                noiseHistoryX.Add(0f);
                noiseHistoryY.Add(0f);
                noiseHistoryZ.Add(0f);
            }

            spatialNoiseOffsets = new Vector3[4];
            for (int i = 0; i < 4; i++)
            {
                spatialNoiseOffsets[i] = new Vector3(
                    (float)random.NextDouble() * 1000f,
                    (float)random.NextDouble() * 1000f,
                    (float)random.NextDouble() * 1000f
                );
            }
        }

        public void SetConfig(WindConfig newConfig)
        {
            config = newConfig;
        }

        public void Update(float dt, ActorState actor)
        {
            time += dt;

            Vector3 turbulence = GenerateTurbulence(dt);
            Vector3 gust = GenerateGust();

            Vector3 baseWind = config.windDirection * config.baseSpeed;
            currentWindVelocity = baseWind + turbulence + gust;

            float smoothFactor = 0.1f;
            smoothedWindVelocity = Vector3.Lerp(smoothedWindVelocity, currentWindVelocity, smoothFactor);

            CalculateWindForces(actor, dt);
        }

        private Vector3 GenerateTurbulence(float dt)
        {
            float intensity = config.turbulenceIntensity * config.baseSpeed;

            float noiseX = GenerateNoiseSample(0, dt);
            float noiseY = GenerateNoiseSample(1, dt);
            float noiseZ = GenerateNoiseSample(2, dt);

            UpdateNoiseHistory(noiseX, noiseY, noiseZ);

            Vector3 turbulence = new Vector3(noiseX, noiseY, noiseZ) * intensity;

            return turbulence;
        }

        private float GenerateNoiseSample(int axis, float dt)
        {
            float whiteNoise = (float)(random.NextDouble() * 2.0 - 1.0);

            switch (config.psdType)
            {
                case PSDType.WhiteNoise:
                    return whiteNoise;

                case PSDType.PinkNoise:
                    return GeneratePinkNoise(axis, whiteNoise);

                case PSDType.BrownianNoise:
                    return GenerateBrownianNoise(axis, whiteNoise, dt);

                case PSDType.VonKarman:
                    return GenerateVonKarmanNoise(axis, whiteNoise, dt);

                case PSDType.Dryden:
                    return GenerateDrydenNoise(axis, whiteNoise, dt);

                case PSDType.Custom:
                    return GenerateCustomNoise(axis, whiteNoise, dt);

                default:
                    return whiteNoise;
            }
        }

        private float GeneratePinkNoise(int axis, float whiteNoise)
        {
            List<float> history = GetHistoryForAxis(axis);
            int octaves = 5;
            float result = 0f;
            float totalWeight = 0f;

            for (int i = 0; i < octaves; i++)
            {
                int delay = 1 << i;
                float weight = 1f / Mathf.Sqrt(delay);

                if (history.Count > delay)
                {
                    int idx = history.Count - 1 - delay;
                    if (idx >= 0 && idx < history.Count)
                    {
                        result += history[idx] * weight;
                        totalWeight += weight;
                    }
                }
            }

            result += whiteNoise * 0.5f;
            return totalWeight > 0 ? result / (totalWeight + 0.5f) : whiteNoise;
        }

        private float GenerateBrownianNoise(int axis, float whiteNoise, float dt)
        {
            List<float> history = GetHistoryForAxis(axis);
            float lastValue = history.Count > 0 ? history[history.Count - 1] : 0f;

            float cornerFreq = config.cornerFrequency;
            float tau = 1f / (2f * Mathf.PI * cornerFreq);
            float alpha = dt / (tau + dt);

            float newValue = lastValue * (1f - alpha) + whiteNoise * alpha;
            return newValue;
        }

        private float GenerateVonKarmanNoise(int axis, float whiteNoise, float dt)
        {
            List<float> history = GetHistoryForAxis(axis);
            float lastValue = history.Count > 0 ? history[history.Count - 1] : 0f;

            float L = 5f;
            float sigma = config.turbulenceIntensity * config.baseSpeed;
            float omega = 2f * Mathf.PI * (1f / Mathf.Max(dt, 0.001f));

            float sigma2 = sigma * sigma;
            float L2 = L * L;
            float omega2 = omega * omega;

            float vonKarman = sigma2 * L / (float)Mathf.Pow(1f + 2.5f * omega2 * L2, 1f / 6f);

            float filtered = lastValue * 0.95f + whiteNoise * vonKarman * 0.05f;
            return filtered;
        }

        private float GenerateDrydenNoise(int axis, float whiteNoise, float dt)
        {
            List<float> history = GetHistoryForAxis(axis);
            float lastValue = history.Count > 0 ? history[history.Count - 1] : 0f;

            float L = 3f;
            float sigma = config.turbulenceIntensity * config.baseSpeed;
            float alpha = Mathf.Sqrt(3f) * L / Mathf.Max(config.baseSpeed, 0.1f);

            float beta = 1f / (1f + alpha / dt);
            float filtered = lastValue * beta + whiteNoise * sigma * (1f - beta);

            return filtered;
        }

        private float GenerateCustomNoise(int axis, float whiteNoise, float dt)
        {
            List<float> history = GetHistoryForAxis(axis);
            float lastValue = history.Count > 0 ? history[history.Count - 1] : 0f;

            float blended =
                0.4f * whiteNoise +
                0.3f * GeneratePinkNoise(axis, whiteNoise) +
                0.3f * lastValue;

            return blended;
        }

        private List<float> GetHistoryForAxis(int axis)
        {
            switch (axis)
            {
                case 0: return noiseHistoryX;
                case 1: return noiseHistoryY;
                case 2: return noiseHistoryZ;
                default: return noiseHistoryX;
            }
        }

        private void UpdateNoiseHistory(float x, float y, float z)
        {
            noiseHistoryX.Add(x);
            noiseHistoryY.Add(y);
            noiseHistoryZ.Add(z);

            while (noiseHistoryX.Count > noiseHistorySize)
                noiseHistoryX.RemoveAt(0);
            while (noiseHistoryY.Count > noiseHistorySize)
                noiseHistoryY.RemoveAt(0);
            while (noiseHistoryZ.Count > noiseHistorySize)
                noiseHistoryZ.RemoveAt(0);
        }

        private Vector3 GenerateGust()
        {
            float gust = Mathf.Sin(time * config.gustFrequency * 2f * Mathf.PI) * config.gustAmplitude;
            gust += Mathf.Sin(time * config.gustFrequency * 3.7f * 2f * Mathf.PI) * config.gustAmplitude * 0.3f;
            return config.windDirection * gust;
        }

        private void CalculateWindForces(ActorState actor, float dt)
        {
            float airDensity = 1.225f;
            Vector3 dragArea = new Vector3(0.4f, 0.8f, 0.2f);

            Vector3 relativeWind = smoothedWindVelocity - actor.velocity;

            Vector3 dragCoeff = new Vector3(1.2f, 1.0f, 1.3f);
            Vector3 force = 0.5f * airDensity * Vector3.Scale(dragArea, dragCoeff);
            force.Scale(relativeWind);
            force.Scale(relativeWind);

            actorWindForce = force;

            if (actor.mass > 0f)
            {
                Vector3 acceleration = force / actor.mass;
                lastActorDrift = acceleration * dt * dt;
                totalActorDrift += lastActorDrift;
            }
        }

        public void ApplyWindForces(CableSystem cableSystem)
        {
            if (cableSystem == null || cableSystem.Particles == null)
                return;

            float airDensity = 1.225f;
            float cableDiameter = 0.015f;
            float dragCoeff = 1.2f;

            for (int i = 0; i < cableSystem.Cables.Count; i++)
            {
                Cable cable = cableSystem.Cables[i];
                if (cable.Particles.Count < 2) continue;

                for (int j = 1; j < cable.Particles.Count - 1; j++)
                {
                    VerletParticle particle = cable.Particles[j];
                    if (particle.isPinned) continue;

                    Vector3 segmentDir = cable.Particles[j + 1].position - cable.Particles[j - 1].position;
                    float segmentLength = segmentDir.magnitude;
                    if (segmentLength < 0.001f) continue;
                    segmentDir /= segmentLength;

                    Vector3 windNormal = Vector3.Cross(segmentDir, Vector3.Cross(smoothedWindVelocity, segmentDir).normalized);
                    float projectedArea = cableDiameter * segmentLength * 0.5f;

                    Vector3 windForce = 0.5f * airDensity * dragCoeff * projectedArea *
                                       smoothedWindVelocity.sqrMagnitude * windNormal;

                    particle.AddForce(windForce);
                }
            }
        }

        public void ApplyWindForceToActor(VerletParticle actorParticle)
        {
            if (actorParticle == null || actorParticle.isPinned) return;
            actorParticle.AddForce(actorWindForce);
        }

        public void ResetDrift()
        {
            totalActorDrift = Vector3.zero;
            time = 0f;
        }

        public float GetWindPowerDensity()
        {
            float airDensity = 1.225f;
            return 0.5f * airDensity * smoothedWindVelocity.sqrMagnitude;
        }

        public float GetReynoldsNumber(float characteristicLength = 1f)
        {
            float kinematicViscosity = 1.511e-5f;
            return smoothedWindVelocity.magnitude * characteristicLength / kinematicViscosity;
        }
    }
}