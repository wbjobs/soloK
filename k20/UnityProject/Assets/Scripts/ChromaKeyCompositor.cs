using UnityEngine;

namespace VirtualProduction
{
    [ExecuteAlways]
    [RequireComponent(typeof(Camera))]
    public class ChromaKeyCompositor : MonoBehaviour
    {
        [Header("Green Screen Settings")]
        [SerializeField] private Color m_KeyColor = new Color(0.0f, 1.0f, 0.0f);
        [SerializeField] [Range(0.0f, 1.0f)] private float m_Threshold = 0.5f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_Tolerance = 0.2f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_SpillSuppression = 0.5f;

        [Header("Advanced Edge Settings")]
        [SerializeField] [Range(0.0f, 0.1f)] private float m_EdgeSoftness = 0.01f;
        [SerializeField] [Range(0.0f, 2.0f)] private float m_DespillStrength = 1.0f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_AlphaClip = 0.0f;

        [Header("Input")]
        [SerializeField] private Texture2D m_LiveVideoTexture;
        [SerializeField] private bool m_UseWebcam = true;
        [SerializeField] private string m_WebcamDeviceName = "";

        [Header("Output")]
        [SerializeField] private RenderTexture m_CompositedOutput;
        [SerializeField] private bool m_ShowDebug = false;

        private Material m_ChromaKeyMaterial;
        private WebCamTexture m_WebcamTexture;
        private Camera m_Camera;

        public Texture2D LiveVideoTexture
        {
            get => m_LiveVideoTexture;
            set => m_LiveVideoTexture = value;
        }

        public RenderTexture CompositedOutput => m_CompositedOutput;
        public float EdgeSoftness => m_EdgeSoftness;

        private void OnEnable()
        {
            m_Camera = GetComponent<Camera>();
            InitializeMaterial();

            if (m_UseWebcam && Application.isPlaying)
            {
                InitializeWebcam();
            }
        }

        private void OnDisable()
        {
            if (m_WebcamTexture != null)
            {
                m_WebcamTexture.Stop();
                Destroy(m_WebcamTexture);
            }
        }

        private void InitializeMaterial()
        {
            if (m_ChromaKeyMaterial == null)
            {
                Shader chromaKeyShader = Shader.Find("VirtualProduction/ChromaKey");
                if (chromaKeyShader != null)
                {
                    m_ChromaKeyMaterial = new Material(chromaKeyShader);
                }
            }
        }

        private void InitializeWebcam()
        {
            if (WebCamTexture.devices.Length > 0)
            {
                if (string.IsNullOrEmpty(m_WebcamDeviceName))
                {
                    m_WebcamDeviceName = WebCamTexture.devices[0].name;
                }
                m_WebcamTexture = new WebCamTexture(m_WebcamDeviceName, 1920, 1080, 30);
                m_WebcamTexture.Play();
            }
        }

        private void Update()
        {
            UpdateMaterialProperties();
        }

        private void UpdateMaterialProperties()
        {
            if (m_ChromaKeyMaterial == null) return;

            m_ChromaKeyMaterial.SetColor("_KeyColor", m_KeyColor);
            m_ChromaKeyMaterial.SetFloat("_Threshold", m_Threshold);
            m_ChromaKeyMaterial.SetFloat("_Tolerance", m_Tolerance);
            m_ChromaKeyMaterial.SetFloat("_SpillSuppression", m_SpillSuppression);
            m_ChromaKeyMaterial.SetFloat("_EdgeSoftness", m_EdgeSoftness);
            m_ChromaKeyMaterial.SetFloat("_DespillStrength", m_DespillStrength);
            m_ChromaKeyMaterial.SetFloat("_AlphaClip", m_AlphaClip);

            Texture sourceTexture = m_UseWebcam ? m_WebcamTexture : m_LiveVideoTexture;
            m_ChromaKeyMaterial.SetTexture("_MainTex", sourceTexture);
        }

        private void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (m_ChromaKeyMaterial == null)
            {
                Graphics.Blit(source, destination);
                return;
            }

            Texture inputTexture = m_UseWebcam ? (Texture)m_WebcamTexture : m_LiveVideoTexture;
            if (inputTexture != null)
            {
                RenderTexture tempRT = RenderTexture.GetTemporary(source.width, source.height, 0, RenderTextureFormat.ARGB32);
                Graphics.Blit(inputTexture, tempRT, m_ChromaKeyMaterial);
                Graphics.Blit(tempRT, destination);
                RenderTexture.ReleaseTemporary(tempRT);
            }
            else
            {
                Graphics.Blit(source, destination);
            }

            if (m_CompositedOutput != null)
            {
                Graphics.Blit(destination, m_CompositedOutput);
            }
        }

        public void SetEdgeSoftness(float value)
        {
            m_EdgeSoftness = Mathf.Clamp01(value);
        }

        public void SetDespillStrength(float value)
        {
            m_DespillStrength = Mathf.Clamp(value, 0f, 2f);
        }

        public void AutoCalibrateKeyColor()
        {
            if (m_WebcamTexture == null && m_LiveVideoTexture == null) return;

            Texture2D tex = m_UseWebcam ? ToTexture2D(m_WebcamTexture) : m_LiveVideoTexture;
            if (tex == null) return;

            Color[] pixels = tex.GetPixels(tex.width / 4, tex.height / 4, tex.width / 2, tex.height / 2);
            Color avgColor = Color.black;
            foreach (Color c in pixels)
            {
                avgColor += c;
            }
            avgColor /= pixels.Length;
            m_KeyColor = avgColor;
        }

        public void AutoCalibrateThreshold()
        {
            if (m_WebcamTexture == null && m_LiveVideoTexture == null) return;

            Texture2D tex = m_UseWebcam ? ToTexture2D(m_WebcamTexture) : m_LiveVideoTexture;
            if (tex == null) return;

            float minDist = float.MaxValue;
            float maxDist = float.MinValue;

            int sampleStep = 10;
            for (int y = 0; y < tex.height; y += sampleStep)
            {
                for (int x = 0; x < tex.width; x += sampleStep)
                {
                    Color pixel = tex.GetPixel(x, y);
                    float dist = CalculateColorDistance(pixel, m_KeyColor);
                    minDist = Mathf.Min(minDist, dist);
                    maxDist = Mathf.Max(maxDist, dist);
                }
            }

            m_Threshold = (minDist + maxDist) * 0.5f;
            m_Tolerance = (maxDist - minDist) * 0.3f;
        }

        private float CalculateColorDistance(Color a, Color b)
        {
            float cbA = -0.168736f * a.r - 0.331264f * a.g + 0.5f * a.b + 0.5f;
            float crA = 0.5f * a.r - 0.418688f * a.g - 0.081312f * a.b + 0.5f;
            float cbB = -0.168736f * b.r - 0.331264f * b.g + 0.5f * b.b + 0.5f;
            float crB = 0.5f * b.r - 0.418688f * b.g - 0.081312f * b.b + 0.5f;

            float cbDiff = cbA - cbB;
            float crDiff = crA - crB;

            return Mathf.Sqrt(cbDiff * cbDiff + crDiff * crDiff);
        }

        private Texture2D ToTexture2D(WebCamTexture wct)
        {
            Texture2D tex = new Texture2D(wct.width, wct.height, TextureFormat.RGB24, false);
            tex.SetPixels(wct.GetPixels());
            tex.Apply();
            return tex;
        }
    }
}
