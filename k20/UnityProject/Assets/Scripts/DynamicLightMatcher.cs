using UnityEngine;

namespace VirtualProduction
{
    [ExecuteAlways]
    public class DynamicLightMatcher : MonoBehaviour
    {
        [Header("Light Sources")]
        [SerializeField] private Light[] m_VirtualLights;
        [SerializeField] private Color m_TargetAmbientColor = Color.white;
        [SerializeField] private float m_TargetAmbientIntensity = 1.0f;

        [Header("Matching Settings")]
        [SerializeField] [Range(0.0f, 1.0f)] private float m_ColorSmoothness = 0.1f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_IntensitySmoothness = 0.1f;
        [SerializeField] private bool m_AutoDetectFromVideo = false;

        [Header("Color Sampling")]
        [SerializeField] private Texture m_VideoSource;
        [SerializeField] private Vector2 m_SamplePosition = new Vector2(0.5f, 0.5f);
        [SerializeField] private int m_SampleSize = 10;

        private Color[] m_CurrentLightColors;
        private float[] m_CurrentLightIntensities;
        private Color m_CurrentAmbientColor;
        private float m_CurrentAmbientIntensity;

        private void OnEnable()
        {
            Initialize();
        }

        private void Initialize()
        {
            if (m_VirtualLights != null && m_VirtualLights.Length > 0)
            {
                m_CurrentLightColors = new Color[m_VirtualLights.Length];
                m_CurrentLightIntensities = new float[m_VirtualLights.Length];

                for (int i = 0; i < m_VirtualLights.Length; i++)
                {
                    if (m_VirtualLights[i] != null)
                    {
                        m_CurrentLightColors[i] = m_VirtualLights[i].color;
                        m_CurrentLightIntensities[i] = m_VirtualLights[i].intensity;
                    }
                }
            }

            m_CurrentAmbientColor = RenderSettings.ambientLight;
            m_CurrentAmbientIntensity = RenderSettings.ambientIntensity;
        }

        private void Update()
        {
            if (m_AutoDetectFromVideo && m_VideoSource != null)
            {
                SampleVideoColor();
            }

            UpdateLighting();
        }

        private void SampleVideoColor()
        {
            Texture2D tex2D = m_VideoSource as Texture2D;
            if (tex2D == null)
            {
                RenderTexture rt = m_VideoSource as RenderTexture;
                if (rt != null)
                {
                    tex2D = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
                    RenderTexture.active = rt;
                    tex2D.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
                    tex2D.Apply();
                    RenderTexture.active = null;
                }
            }

            if (tex2D != null)
            {
                int x = Mathf.FloorToInt(m_SamplePosition.x * tex2D.width);
                int y = Mathf.FloorToInt(m_SamplePosition.y * tex2D.height);
                int halfSample = m_SampleSize / 2;

                x = Mathf.Clamp(x, halfSample, tex2D.width - halfSample);
                y = Mathf.Clamp(y, halfSample, tex2D.height - halfSample);

                Color[] pixels = tex2D.GetPixels(x - halfSample, y - halfSample, m_SampleSize, m_SampleSize);
                Color avgColor = Color.black;
                float avgIntensity = 0f;

                foreach (Color c in pixels)
                {
                    avgColor += c;
                    avgIntensity += c.grayscale;
                }

                avgColor /= pixels.Length;
                avgIntensity /= pixels.Length;

                m_TargetAmbientColor = avgColor;
                m_TargetAmbientIntensity = avgIntensity * 2f;
            }
        }

        private void UpdateLighting()
        {
            m_CurrentAmbientColor = Color.Lerp(m_CurrentAmbientColor, m_TargetAmbientColor, m_ColorSmoothness);
            m_CurrentAmbientIntensity = Mathf.Lerp(m_CurrentAmbientIntensity, m_TargetAmbientIntensity, m_IntensitySmoothness);

            RenderSettings.ambientLight = m_CurrentAmbientColor;
            RenderSettings.ambientIntensity = m_CurrentAmbientIntensity;

            if (m_VirtualLights == null) return;

            for (int i = 0; i < m_VirtualLights.Length; i++)
            {
                if (m_VirtualLights[i] == null) continue;

                m_CurrentLightColors[i] = Color.Lerp(m_CurrentLightColors[i], m_TargetAmbientColor, m_ColorSmoothness);
                m_VirtualLights[i].color = m_CurrentLightColors[i];

                float targetIntensity = m_TargetAmbientIntensity * 2f;
                m_CurrentLightIntensities[i] = Mathf.Lerp(m_CurrentLightIntensities[i], targetIntensity, m_IntensitySmoothness);
                m_VirtualLights[i].intensity = m_CurrentLightIntensities[i];
            }
        }

        public void SetLightColor(int lightIndex, Color color)
        {
            if (lightIndex >= 0 && lightIndex < m_VirtualLights?.Length)
            {
                m_CurrentLightColors[lightIndex] = color;
            }
        }

        public void SetLightIntensity(int lightIndex, float intensity)
        {
            if (lightIndex >= 0 && lightIndex < m_VirtualLights?.Length)
            {
                m_CurrentLightIntensities[lightIndex] = intensity;
            }
        }
    }
}
