using System.Collections.Generic;
using UnityEngine;

namespace VirtualProduction
{
    public class VirtualProductionManager : MonoBehaviour
    {
        public static VirtualProductionManager Instance { get; private set; }

        [Header("Core Components")]
        [SerializeField] private MultiCameraSwitcher m_CameraSwitcher;
        [SerializeField] private OutputSender m_OutputSender;
        [SerializeField] private ChromaKeyCompositor m_ChromaKeyCompositor;
        [SerializeField] private DynamicLightMatcher m_LightMatcher;

        [Header("Camera Configurations")]
        [SerializeField] private List<CameraConfig> m_CameraConfigs = new List<CameraConfig>();

        [Header("Status")]
        [SerializeField] private bool m_IsLive = false;
        [SerializeField] private int m_ActiveCameraIndex = 0;

        public bool IsLive => m_IsLive;
        public MultiCameraSwitcher CameraSwitcher => m_CameraSwitcher;
        public OutputSender OutputSender => m_OutputSender;
        public ChromaKeyCompositor ChromaKey => m_ChromaKeyCompositor;
        public DynamicLightMatcher LightMatcher => m_LightMatcher;

        [System.Serializable]
        public class CameraConfig
        {
            public string Name = "Camera 1";
            public int CameraId = 0;
            public int Port = 40000;
            public string IPAddress = "0.0.0.0";
            public Vector3 PositionOffset = Vector3.zero;
            public Vector3 RotationOffset = Vector3.zero;
            public float PositionScale = 1.0f;
            public bool EnableFilter = false;
            public float FilterSmoothing = 0.1f;
        }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
        }

        public void StartProduction()
        {
            m_IsLive = true;

            if (m_OutputSender != null && !m_OutputSender.IsSending)
            {
                m_OutputSender.StartSending();
            }

            Debug.Log("虚拟制片系统已启动");
        }

        public void StopProduction()
        {
            m_IsLive = false;

            if (m_OutputSender != null && m_OutputSender.IsSending)
            {
                m_OutputSender.StopSending();
            }

            FreeDNativeBindings.FreeD_ShutdownAll();

            Debug.Log("虚拟制片系统已停止");
        }

        public void SwitchCamera(int index)
        {
            if (m_CameraSwitcher != null)
            {
                m_CameraSwitcher.SwitchToCamera(index);
                m_ActiveCameraIndex = index;
            }
        }

        public void PreviewCamera(int index)
        {
            if (m_CameraSwitcher != null)
            {
                m_CameraSwitcher.PreviewCamera(index);
            }
        }

        public void SetChromaKeyColor(Color color)
        {
            if (m_ChromaKeyCompositor != null)
            {
                m_ChromaKeyCompositor.LiveVideoTexture = null;
            }
        }

        public void StartCalibration(int cameraIndex)
        {
            var tracker = GetCameraTracker(cameraIndex);
            if (tracker != null)
            {
                var calibration = tracker.GetComponent<CameraCalibrationTool>();
                if (calibration != null)
                {
                    calibration.StartCalibration();
                }
            }
        }

        public FreeDCameraTracker GetCameraTracker(int index)
        {
            if (m_CameraSwitcher == null) return null;
            var source = m_CameraSwitcher.GetCameraSource(index);
            return source?.Tracker;
        }

        public CameraConfig GetCameraConfig(int index)
        {
            if (index >= 0 && index < m_CameraConfigs.Count)
            {
                return m_CameraConfigs[index];
            }
            return null;
        }

        public void ApplyCameraConfig(int cameraIndex, CameraConfig config)
        {
            var tracker = GetCameraTracker(cameraIndex);
            if (tracker != null)
            {
                var go = tracker.gameObject;
                go.name = config.Name;
            }
        }

        private void OnApplicationQuit()
        {
            StopProduction();
        }
    }
}
