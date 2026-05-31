using UnityEngine;

namespace VirtualProduction
{
    [ExecuteAlways]
    public class OutputSender : MonoBehaviour
    {
        [Header("Output Settings")]
        [SerializeField] private OutputMode m_OutputMode = OutputMode.None;
        [SerializeField] private string m_StreamName = "VirtualProduction";
        [SerializeField] private int m_OutputWidth = 1920;
        [SerializeField] private int m_OutputHeight = 1080;
        [SerializeField] private int m_FrameRate = 60;

        [Header("Source")]
        [SerializeField] private Camera m_SourceCamera;
        [SerializeField] private RenderTexture m_SourceTexture;
        [SerializeField] private bool m_UseCamera = true;

        [Header("Status")]
        [SerializeField] private bool m_IsSending = false;
        [SerializeField] private float m_FPS = 0f;

        private RenderTexture m_OutputTexture;
        private float m_LastFrameTime;
        private int m_FrameCount;

        public enum OutputMode
        {
            None,
            NDI,
            Spout,
            Both
        }

        public bool IsSending => m_IsSending;
        public OutputMode Mode => m_OutputMode;

        private void OnEnable()
        {
            InitializeOutput();
        }

        private void OnDisable()
        {
            StopSending();
            ReleaseResources();
        }

        private void InitializeOutput()
        {
            if (m_OutputTexture == null || m_OutputTexture.width != m_OutputWidth || m_OutputTexture.height != m_OutputHeight)
            {
                if (m_OutputTexture != null)
                {
                    m_OutputTexture.Release();
                }
                m_OutputTexture = new RenderTexture(m_OutputWidth, m_OutputHeight, 24, RenderTextureFormat.ARGB32);
                m_OutputTexture.Create();
            }
        }

        private void ReleaseResources()
        {
            if (m_OutputTexture != null)
            {
                m_OutputTexture.Release();
                m_OutputTexture = null;
            }
        }

        public void StartSending()
        {
            if (m_OutputMode == OutputMode.None)
            {
                Debug.LogWarning("请选择输出模式");
                return;
            }

            InitializeOutput();
            m_IsSending = true;
            InitializeNDI();
            InitializeSpout();
        }

        public void StopSending()
        {
            m_IsSending = false;
            ShutdownNDI();
            ShutdownSpout();
        }

        private void InitializeNDI()
        {
            if (m_OutputMode == OutputMode.NDI || m_OutputMode == OutputMode.Both)
            {
                Debug.Log($"NDI 输出初始化: {m_StreamName}");
            }
        }

        private void InitializeSpout()
        {
            if (m_OutputMode == OutputMode.Spout || m_OutputMode == OutputMode.Both)
            {
                Debug.Log($"Spout 输出初始化: {m_StreamName}");
            }
        }

        private void ShutdownNDI()
        {
            Debug.Log("NDI 输出已关闭");
        }

        private void ShutdownSpout()
        {
            Debug.Log("Spout 输出已关闭");
        }

        private void Update()
        {
            if (!m_IsSending) return;

            CaptureFrame();
            SendFrame();
            UpdateFPS();
        }

        private void CaptureFrame()
        {
            if (m_UseCamera && m_SourceCamera != null)
            {
                var prevRT = m_SourceCamera.targetTexture;
                m_SourceCamera.targetTexture = m_OutputTexture;
                m_SourceCamera.Render();
                m_SourceCamera.targetTexture = prevRT;
            }
            else if (m_SourceTexture != null)
            {
                Graphics.Blit(m_SourceTexture, m_OutputTexture);
            }
        }

        private void SendFrame()
        {
            if (m_OutputMode == OutputMode.NDI || m_OutputMode == OutputMode.Both)
            {
                SendNDIFrame();
            }

            if (m_OutputMode == OutputMode.Spout || m_OutputMode == OutputMode.Both)
            {
                SendSpoutFrame();
            }
        }

        private void SendNDIFrame()
        {
        }

        private void SendSpoutFrame()
        {
        }

        private void UpdateFPS()
        {
            m_FrameCount++;
            float currentTime = Time.realtimeSinceStartup;
            if (currentTime - m_LastFrameTime >= 1.0f)
            {
                m_FPS = m_FrameCount / (currentTime - m_LastFrameTime);
                m_FrameCount = 0;
                m_LastFrameTime = currentTime;
            }
        }

        public void SetOutputMode(OutputMode mode)
        {
            if (m_IsSending)
            {
                StopSending();
                m_OutputMode = mode;
                StartSending();
            }
            else
            {
                m_OutputMode = mode;
            }
        }

        public void SetStreamName(string name)
        {
            m_StreamName = name;
            if (m_IsSending)
            {
                StopSending();
                StartSending();
            }
        }

        private void OnValidate()
        {
            if (m_IsSending && Application.isPlaying)
            {
                InitializeOutput();
            }
        }
    }
}
