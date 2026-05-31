using System;
using UnityEngine;

namespace VirtualProduction
{
    [ExecuteAlways]
    public class LightingEstimator : MonoBehaviour
    {
        [Header("Input Source")]
        [SerializeField] private Texture m_SourceTexture;
        [SerializeField] private RenderTexture m_SourceRenderTexture;
        [SerializeField] private FreeDCameraTracker m_CameraTracker;
        [SerializeField] private bool m_AutoUpdate = true;
        [SerializeField] [Range(0.1f, 5.0f)] private float m_UpdateInterval = 1.0f;

        [Header("Analysis Settings")]
        [SerializeField] private int m_AnalysisResolution = 64;
        [SerializeField] [Range(1, 8)] private int m_SampleCount = 4;
        [SerializeField] private float m_BrightnessThreshold = 0.7f;
        [SerializeField] private float m_ShadowThreshold = 0.3f;
        [SerializeField] private bool m_UseGPUAnalysis = true;

        [Header("Environment Lighting (SH)")]
        [SerializeField] private bool m_UpdateAmbientLight = true;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_AmbientBlendFactor = 0.5f;
        [SerializeField] private Color m_AmbientBias = Color.gray;

        [Header("Directional Light")]
        [SerializeField] private bool m_UpdateDirectionalLight = true;
        [SerializeField] private Light m_TargetDirectionalLight;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_LightBlendFactor = 0.5f;
        [SerializeField] private float m_MinLightIntensity = 0.2f;
        [SerializeField] private float m_MaxLightIntensity = 3.0f;
        [SerializeField] private bool m_AutoFindLight = true;

        [Header("Multiple Lights")]
        [SerializeField] private int m_MaxLights = 2;
        [SerializeField] private Light[] m_AdditionalLights;
        [SerializeField] private bool m_UseAdditionalLights = false;

        [Header("Status")]
        [SerializeField] private Color m_EstimatedAmbientColor;
        [SerializeField] private float m_EstimatedAmbientIntensity;
        [SerializeField] private Vector3 m_EstimatedLightDirection;
        [SerializeField] private Color m_EstimatedLightColor;
        [SerializeField] private float m_EstimatedLightIntensity;
        [SerializeField] private float[] m_SphericalHarmonics = new float[27];

        private RenderTexture m_AnalysisRT;
        private Texture2D m_AnalysisTex;
        private Material m_AnalysisMaterial;
        private float m_LastUpdateTime;
        private SHCoefficients m_SHCoefficients;

        public Color EstimatedAmbientColor => m_EstimatedAmbientColor;
        public float EstimatedAmbientIntensity => m_EstimatedAmbientIntensity;
        public Vector3 EstimatedLightDirection => m_EstimatedLightDirection;
        public Color EstimatedLightColor => m_EstimatedLightColor;
        public float EstimatedLightIntensity => m_EstimatedLightIntensity;

        [Serializable]
        private struct SHCoefficients
        {
            public Vector3 L00;
            public Vector3 L1_1;
            public Vector3 L10;
            public Vector3 L11;
        }

        private void OnEnable()
        {
            InitializeResources();

            if (m_AutoFindLight && m_TargetDirectionalLight == null)
            {
                m_TargetDirectionalLight = FindObjectOfType<Light>();
            }
        }

        private void OnDisable()
        {
            ReleaseResources();
        }

        private void InitializeResources()
        {
            m_AnalysisRT = new RenderTexture(m_AnalysisResolution, m_AnalysisResolution, 0, RenderTextureFormat.ARGB32);
            m_AnalysisRT.Create();

            m_AnalysisTex = new Texture2D(m_AnalysisResolution, m_AnalysisResolution, TextureFormat.RGB24, false);

            Shader analysisShader = Shader.Find("VirtualProduction/LightingAnalysis");
            if (analysisShader != null)
            {
                m_AnalysisMaterial = new Material(analysisShader);
            }
        }

        private void ReleaseResources()
        {
            if (m_AnalysisRT != null)
            {
                m_AnalysisRT.Release();
                m_AnalysisRT = null;
            }
            if (m_AnalysisTex != null)
            {
                Destroy(m_AnalysisTex);
                m_AnalysisTex = null;
            }
        }

        private void Update()
        {
            if (!m_AutoUpdate) return;

            if (Time.time - m_LastUpdateTime >= m_UpdateInterval)
            {
                EstimateLighting();
                m_LastUpdateTime = Time.time;
            }
        }

        public void EstimateLighting()
        {
            Texture source = GetSourceTexture();
            if (source == null) return;

            if (m_UseGPUAnalysis && m_AnalysisMaterial != null)
            {
                EstimateGPU(source);
            }
            else
            {
                EstimateCPU(source);
            }

            UpdateAmbientLight();
            UpdateDirectionalLight();
        }

        private Texture GetSourceTexture()
        {
            if (m_SourceRenderTexture != null)
                return m_SourceRenderTexture;
            if (m_SourceTexture != null)
                return m_SourceTexture;
            if (m_CameraTracker != null)
            {
                Camera cam = m_CameraTracker.GetComponent<Camera>();
                if (cam != null && cam.targetTexture != null)
                    return cam.targetTexture;
            }
            return null;
        }

        private void EstimateGPU(Texture source)
        {
            Graphics.Blit(source, m_AnalysisRT, m_AnalysisMaterial);

            RenderTexture.active = m_AnalysisRT;
            m_AnalysisTex.ReadPixels(new Rect(0, 0, m_AnalysisResolution, m_AnalysisResolution), 0, 0);
            m_AnalysisTex.Apply();
            RenderTexture.active = null;

            AnalyzeTexture(m_AnalysisTex);
        }

        private void EstimateCPU(Texture source)
        {
            Texture2D tex2D = source as Texture2D;
            if (tex2D == null)
            {
                RenderTexture rt = source as RenderTexture;
                if (rt != null)
                {
                    RenderTexture.active = rt;
                    m_AnalysisTex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
                    m_AnalysisTex.Apply();
                    RenderTexture.active = null;
                    tex2D = m_AnalysisTex;
                }
            }

            if (tex2D != null)
            {
                AnalyzeTexture(tex2D);
            }
        }

        private void AnalyzeTexture(Texture2D tex)
        {
            int width = tex.width;
            int height = tex.height;
            Color[] pixels = tex.GetPixels();

            Vector3 averageColor = Vector3.zero;
            Vector3 brightestDir = Vector3.zero;
            float brightestIntensity = 0;
            Vector3 darkestDir = Vector3.zero;
            float darkestIntensity = 1;

            float[,] histogram = new float[6, 3];

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    Color pixel = pixels[y * width + x];
                    float luminance = pixel.r * 0.299f + pixel.g * 0.587f + pixel.b * 0.114f;

                    averageColor += new Vector3(pixel.r, pixel.g, pixel.b);

                    Vector3 dir = PixelToDirection(x, y, width, height);
                    int faceIndex = DirectionToFaceIndex(dir);
                    histogram[faceIndex, 0] += pixel.r;
                    histogram[faceIndex, 1] += pixel.g;
                    histogram[faceIndex, 2] += pixel.b;

                    if (luminance > brightestIntensity)
                    {
                        brightestIntensity = luminance;
                        brightestDir = dir;
                    }
                    if (luminance < darkestIntensity)
                    {
                        darkestIntensity = luminance;
                        darkestDir = dir;
                    }
                }
            }

            int totalPixels = width * height;
            averageColor /= totalPixels;

            m_EstimatedAmbientColor = new Color(averageColor.x, averageColor.y, averageColor.z);
            m_EstimatedAmbientIntensity = m_EstimatedAmbientColor.grayscale;

            m_EstimatedLightDirection = brightestDir;
            m_EstimatedLightColor = Color.Lerp(Color.white, m_EstimatedAmbientColor, 0.3f);
            m_EstimatedLightIntensity = Mathf.Lerp(m_MinLightIntensity, m_MaxLightIntensity, brightestIntensity);

            CalculateSphericalHarmonics(histogram, totalPixels / 6);
        }

        private Vector3 PixelToDirection(int x, int y, int width, int height)
        {
            float u = (float)x / (width - 1) * 2.0f - 1.0f;
            float v = (float)y / (height - 1) * 2.0f - 1.0f;

            float theta = u * Mathf.PI;
            float phi = v * Mathf.PI * 0.5f;

            return new Vector3(
                Mathf.Cos(phi) * Mathf.Sin(theta),
                Mathf.Sin(phi),
                Mathf.Cos(phi) * Mathf.Cos(theta)
            ).normalized;
        }

        private int DirectionToFaceIndex(Vector3 dir)
        {
            float absX = Mathf.Abs(dir.x);
            float absY = Mathf.Abs(dir.y);
            float absZ = Mathf.Abs(dir.z);

            if (absX > absY && absX > absZ)
                return dir.x > 0 ? 0 : 1;
            if (absY > absZ)
                return dir.y > 0 ? 2 : 3;
            return dir.z > 0 ? 4 : 5;
        }

        private void CalculateSphericalHarmonics(float[,] histogram, int samplesPerFace)
        {
            Vector3[] faceColors = new Vector3[6];
            for (int i = 0; i < 6; i++)
            {
                faceColors[i] = new Vector3(
                    histogram[i, 0] / samplesPerFace,
                    histogram[i, 1] / samplesPerFace,
                    histogram[i, 2] / samplesPerFace
                );
            }

            m_SHCoefficients.L00 = (faceColors[4] + faceColors[5]) * 0.5f;

            m_SHCoefficients.L1_1 = (faceColors[0] - faceColors[1]) * 0.5f;
            m_SHCoefficients.L10 = (faceColors[2] - faceColors[3]) * 0.5f;
            m_SHCoefficients.L11 = (faceColors[4] - faceColors[5]) * 0.5f;

            int index = 0;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L00.x;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L00.y;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L00.z;

            m_SphericalHarmonics[index++] = m_SHCoefficients.L1_1.x;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L1_1.y;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L1_1.z;

            m_SphericalHarmonics[index++] = m_SHCoefficients.L10.x;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L10.y;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L10.z;

            m_SphericalHarmonics[index++] = m_SHCoefficients.L11.x;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L11.y;
            m_SphericalHarmonics[index++] = m_SHCoefficients.L11.z;
        }

        private void UpdateAmbientLight()
        {
            if (!m_UpdateAmbientLight) return;

            Color targetColor = Color.Lerp(m_EstimatedAmbientColor, m_AmbientBias, 1 - m_AmbientBlendFactor);
            RenderSettings.ambientLight = Color.Lerp(RenderSettings.ambientLight, targetColor, m_AmbientBlendFactor);
            RenderSettings.ambientIntensity = Mathf.Lerp(RenderSettings.ambientIntensity, m_EstimatedAmbientIntensity, m_AmbientBlendFactor);

            SphericalHarmonicsL2 sh = new SphericalHarmonicsL2();
            int coeffIndex = 0;
            for (int i = 0; i < 9; i++)
            {
                sh[0, i] = m_SphericalHarmonics[coeffIndex++];
                sh[1, i] = m_SphericalHarmonics[coeffIndex++];
                sh[2, i] = m_SphericalHarmonics[coeffIndex++];
            }
            LightmapSettings.ambientProbe = sh;
        }

        private void UpdateDirectionalLight()
        {
            if (!m_UpdateDirectionalLight || m_TargetDirectionalLight == null) return;

            Quaternion targetRotation = Quaternion.LookRotation(-m_EstimatedLightDirection);
            m_TargetDirectionalLight.transform.rotation = Quaternion.Slerp(
                m_TargetDirectionalLight.transform.rotation,
                targetRotation,
                m_LightBlendFactor
            );

            m_TargetDirectionalLight.color = Color.Lerp(
                m_TargetDirectionalLight.color,
                m_EstimatedLightColor,
                m_LightBlendFactor
            );

            m_TargetDirectionalLight.intensity = Mathf.Lerp(
                m_TargetDirectionalLight.intensity,
                m_EstimatedLightIntensity,
                m_LightBlendFactor
            );

            if (m_UseAdditionalLights && m_AdditionalLights != null)
            {
                for (int i = 0; i < m_AdditionalLights.Length && i < m_MaxLights - 1; i++)
                {
                    if (m_AdditionalLights[i] != null)
                    {
                        Vector3 offsetDir = Quaternion.Euler(0, 45 * (i + 1), 0) * m_EstimatedLightDirection;
                        m_AdditionalLights[i].transform.rotation = Quaternion.Slerp(
                            m_AdditionalLights[i].transform.rotation,
                            Quaternion.LookRotation(-offsetDir),
                            m_LightBlendFactor * 0.5f
                        );
                        m_AdditionalLights[i].intensity = m_EstimatedLightIntensity * 0.3f;
                    }
                }
            }
        }

        public void SetSourceTexture(Texture texture)
        {
            m_SourceTexture = texture as Texture2D;
            m_SourceRenderTexture = texture as RenderTexture;
        }

        public void ForceUpdate()
        {
            EstimateLighting();
        }

        private void OnValidate()
        {
            if (m_AnalysisRT != null && (m_AnalysisRT.width != m_AnalysisResolution || m_AnalysisRT.height != m_AnalysisResolution))
            {
                ReleaseResources();
                InitializeResources();
            }
        }
    }
}
