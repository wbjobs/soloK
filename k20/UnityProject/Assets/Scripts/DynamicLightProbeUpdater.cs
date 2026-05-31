using UnityEngine;

namespace VirtualProduction
{
    [ExecuteAlways]
    public class DynamicLightProbeUpdater : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private LightingEstimator m_LightingEstimator;
        [SerializeField] private LightProbeGroup m_LightProbeGroup;
        [SerializeField] private ReflectionProbe m_ReflectionProbe;

        [Header("Update Settings")]
        [SerializeField] private bool m_AutoUpdate = true;
        [SerializeField] [Range(0.1f, 10.0f)] private float m_UpdateInterval = 2.0f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_BlendFactor = 0.3f;
        [SerializeField] private bool m_UpdateLightProbes = true;
        [SerializeField] private bool m_UpdateReflectionProbe = true;

        [Header("Light Probe Settings")]
        [SerializeField] private Color m_AmbientBias = Color.gray;
        [SerializeField] private float m_IntensityScale = 1.2f;

        [Header("Reflection Probe Settings")]
        [SerializeField] private int m_ReflectionResolution = 128;
        [SerializeField] private float m_ReflectionIntensity = 0.7f;
        [SerializeField] private bool m_UseEstimatedColor = true;

        private float m_LastUpdateTime;
        private SphericalHarmonicsL2 m_CurrentSH;
        private SphericalHarmonicsL2 m_TargetSH;
        private bool m_SHInitialized;

        private void OnEnable()
        {
            Initialize();
        }

        private void Start()
        {
            if (m_LightingEstimator == null)
            {
                m_LightingEstimator = FindObjectOfType<LightingEstimator>();
            }
        }

        private void Initialize()
        {
            if (!m_SHInitialized)
            {
                m_CurrentSH = LightmapSettings.ambientProbe;
                m_TargetSH = LightmapSettings.ambientProbe;
                m_SHInitialized = true;
            }

            if (m_ReflectionProbe != null)
            {
                m_ReflectionProbe.resolution = m_ReflectionResolution;
            }
        }

        private void Update()
        {
            if (!m_AutoUpdate) return;

            if (Time.time - m_LastUpdateTime >= m_UpdateInterval)
            {
                UpdateProbes();
                m_LastUpdateTime = Time.time;
            }

            BlendProbes();
        }

        public void UpdateProbes()
        {
            if (m_LightingEstimator == null) return;

            if (m_UpdateLightProbes)
            {
                UpdateAmbientProbe();
            }

            if (m_UpdateReflectionProbe && m_ReflectionProbe != null)
            {
                UpdateReflectionProbe();
            }
        }

        private void UpdateAmbientProbe()
        {
            Color estimatedColor = m_LightingEstimator.EstimatedAmbientColor;
            float estimatedIntensity = m_LightingEstimator.EstimatedAmbientIntensity;

            Color finalColor = Color.Lerp(estimatedColor, m_AmbientBias, 0.5f);
            finalColor *= m_IntensityScale;

            Color lightColor = m_LightingEstimator.EstimatedLightColor;
            Vector3 lightDir = m_LightingEstimator.EstimatedLightDirection;
            float lightIntensity = m_LightingEstimator.EstimatedLightIntensity;

            SphericalHarmonicsL2 sh = new SphericalHarmonicsL2();

            sh[0, 0] = finalColor.r * 0.282095f;
            sh[1, 0] = finalColor.g * 0.282095f;
            sh[2, 0] = finalColor.b * 0.282095f;

            float lightContribution = lightIntensity * 0.325735f;
            sh[0, 3] = lightDir.x * lightColor.r * lightContribution;
            sh[1, 3] = lightDir.x * lightColor.g * lightContribution;
            sh[2, 3] = lightDir.x * lightColor.b * lightContribution;

            sh[0, 1] = lightDir.y * lightColor.r * lightContribution;
            sh[1, 1] = lightDir.y * lightColor.g * lightContribution;
            sh[2, 1] = lightDir.y * lightColor.b * lightContribution;

            sh[0, 2] = lightDir.z * lightColor.r * lightContribution;
            sh[1, 2] = lightDir.z * lightColor.g * lightContribution;
            sh[2, 2] = lightDir.z * lightColor.b * lightContribution;

            sh[0, 4] = (3 * lightDir.z * lightDir.z - 1) * finalColor.r * 0.273137f;
            sh[1, 4] = (3 * lightDir.z * lightDir.z - 1) * finalColor.g * 0.273137f;
            sh[2, 4] = (3 * lightDir.z * lightDir.z - 1) * finalColor.b * 0.273137f;

            for (int i = 5; i < 9; i++)
            {
                sh[0, i] = finalColor.r * 0.078848f;
                sh[1, i] = finalColor.g * 0.078848f;
                sh[2, i] = finalColor.b * 0.078848f;
            }

            m_TargetSH = sh;
        }

        private void UpdateReflectionProbe()
        {
            if (m_UseEstimatedColor && m_LightingEstimator != null)
            {
                Color ambientColor = m_LightingEstimator.EstimatedAmbientColor;
                m_ReflectionProbe.intensity = ambientColor.grayscale * m_ReflectionIntensity;
            }

            if (Application.isPlaying)
            {
                m_ReflectionProbe.RenderProbe();
            }
        }

        private void BlendProbes()
        {
            if (!m_UpdateLightProbes) return;

            float blendSpeed = 1.0f / m_UpdateInterval * m_BlendFactor;
            BlendSHCoefficients(ref m_CurrentSH, m_TargetSH, blendSpeed * Time.deltaTime);

            LightmapSettings.ambientProbe = m_CurrentSH;

            if (m_LightProbeGroup != null && m_LightProbeGroup.probePositions != null)
            {
                LightProbes.Tetrahedralize();
            }
        }

        private void BlendSHCoefficients(ref SphericalHarmonicsL2 current, in SphericalHarmonicsL2 target, float t)
        {
            for (int channel = 0; channel < 3; channel++)
            {
                for (int coeff = 0; coeff < 9; coeff++)
                {
                    current[channel, coeff] = Mathf.Lerp(current[channel, coeff], target[channel, coeff], t);
                }
            }
        }

        public void SetLightingEstimator(LightingEstimator estimator)
        {
            m_LightingEstimator = estimator;
        }

        public void ForceUpdate()
        {
            UpdateProbes();
        }

        private void OnValidate()
        {
            if (m_ReflectionProbe != null)
            {
                m_ReflectionProbe.resolution = m_ReflectionResolution;
            }
        }
    }
}
