using UnityEngine;

namespace VirtualProduction
{
    [ExecuteAlways]
    [RequireComponent(typeof(Camera))]
    public class DepthOfFieldMatcher : MonoBehaviour
    {
        [Header("Lens Configuration")]
        [SerializeField] private float m_SensorWidth = 36.0f;
        [SerializeField] private float m_SensorHeight = 24.0f;
        [SerializeField] private float m_MinFocalLength = 18.0f;
        [SerializeField] private float m_MaxFocalLength = 200.0f;
        [SerializeField] private float m_MinAperture = 1.4f;
        [SerializeField] private float m_MaxAperture = 22.0f;

        [Header("Input Data")]
        [SerializeField] private FreeDCameraTracker m_CameraTracker;
        [SerializeField] private float m_ManualFocusDistance = 5.0f;
        [SerializeField] private float m_ManualFocalLength = 50.0f;
        [SerializeField] private float m_ManualAperture = 2.8f;
        [SerializeField] private bool m_UseManualValues = false;

        [Header("DOF Settings")]
        [SerializeField] private bool m_EnableDepthOfField = true;
        [SerializeField] [Range(0.0f, 2.0f)] private float m_BokehScale = 1.0f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_Smoothness = 0.1f;

        [Header("Output")]
        [SerializeField] private float m_CurrentFocalLength;
        [SerializeField] private float m_CurrentAperture;
        [SerializeField] private float m_CurrentFocusDistance;
        [SerializeField] private float m_CurrentFStop;
        [SerializeField] private float m_CurrentFieldOfView;

        private Camera m_Camera;
        private Material m_DoFMaterial;

        private float m_SmoothedFocalLength;
        private float m_SmoothedAperture;
        private float m_SmoothedFocusDistance;

        public float FocalLength => m_CurrentFocalLength;
        public float Aperture => m_CurrentAperture;
        public float FocusDistance => m_CurrentFocusDistance;
        public float FieldOfView => m_CurrentFieldOfView;

        private void OnEnable()
        {
            m_Camera = GetComponent<Camera>();
            InitializeMaterial();
        }

        private void InitializeMaterial()
        {
            Shader dofShader = Shader.Find("VirtualProduction/DepthOfField");
            if (dofShader != null)
            {
                m_DoFMaterial = new Material(dofShader);
            }
        }

        private void Update()
        {
            CalculateDOFParameters();
            UpdateCamera();
        }

        private void CalculateDOFParameters()
        {
            if (m_UseManualValues || m_CameraTracker == null)
            {
                m_CurrentFocalLength = m_ManualFocalLength;
                m_CurrentAperture = m_ManualAperture;
                m_CurrentFocusDistance = m_ManualFocusDistance;
            }
            else
            {
                var data = m_CameraTracker.LatestData;
                m_CurrentFocalLength = Mathf.Lerp(m_MinFocalLength, m_MaxFocalLength, (float)data.Zoom / 100.0f);
                m_CurrentAperture = Mathf.Lerp(m_MinAperture, m_MaxAperture, (float)data.Aperture / 100.0f);
                m_CurrentFocusDistance = Mathf.Lerp(0.1f, 100.0f, (float)data.Focus / 100.0f);
            }

            m_SmoothedFocalLength = Mathf.Lerp(m_SmoothedFocalLength, m_CurrentFocalLength, m_Smoothness);
            m_SmoothedAperture = Mathf.Lerp(m_SmoothedAperture, m_CurrentAperture, m_Smoothness);
            m_SmoothedFocusDistance = Mathf.Lerp(m_SmoothedFocusDistance, m_CurrentFocusDistance, m_Smoothness);

            m_CurrentFStop = m_SmoothedFocalLength / m_SmoothedAperture;
            m_CurrentFieldOfView = CalculateFOV(m_SmoothedFocalLength, m_SensorWidth);
        }

        private float CalculateFOV(float focalLength, float sensorSize)
        {
            return 2.0f * Mathf.Atan(sensorSize / (2.0f * focalLength)) * Mathf.Rad2Deg;
        }

        private void UpdateCamera()
        {
            if (m_Camera != null)
            {
                m_Camera.fieldOfView = m_CurrentFieldOfView;
            }
        }

        private void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (!m_EnableDepthOfField || m_DoFMaterial == null)
            {
                Graphics.Blit(source, destination);
                return;
            }

            m_DoFMaterial.SetFloat("_FocusDistance", m_SmoothedFocusDistance);
            m_DoFMaterial.SetFloat("_FStop", m_CurrentFStop);
            m_DoFMaterial.SetFloat("_FocalLength", m_SmoothedFocalLength);
            m_DoFMaterial.SetFloat("_BokehScale", m_BokehScale);

            RenderTexture cocRT = RenderTexture.GetTemporary(source.width, source.height, 0, RenderTextureFormat.RFloat);
            RenderTexture blurRT = RenderTexture.GetTemporary(source.width, source.height, 0, source.format);

            Graphics.Blit(source, cocRT, m_DoFMaterial, 0);
            m_DoFMaterial.SetTexture("_CoCTex", cocRT);
            Graphics.Blit(source, blurRT, m_DoFMaterial, 1);
            Graphics.Blit(blurRT, destination, m_DoFMaterial, 2);

            RenderTexture.ReleaseTemporary(cocRT);
            RenderTexture.ReleaseTemporary(blurRT);
        }
    }
}
