using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace VirtualProduction
{
    public class MultiCameraSwitcher : MonoBehaviour
    {
        [Header("Camera Sources")]
        [SerializeField] private CameraSource[] m_CameraSources = new CameraSource[4];
        [SerializeField] private int m_ActiveCameraIndex = 0;

        [Header("Switch Settings")]
        [SerializeField] private SwitchMode m_SwitchMode = SwitchMode.Cut;
        [SerializeField] private float m_TransitionDuration = 1.0f;
        [SerializeField] private AnimationCurve m_TransitionCurve = AnimationCurve.EaseInOut(0, 0, 1, 1);

        [Header("Output")]
        [SerializeField] private RenderTexture m_PreviewTexture;
        [SerializeField] private Camera m_OutputCamera;

        [Header("Audio")]
        [SerializeField] private bool m_SyncAudio = true;
        [SerializeField] private AudioSource m_AudioSource;

        private bool m_IsTransitioning = false;
        private int m_PreviousCameraIndex = -1;
        private float m_TransitionProgress = 0f;
        private Material m_BlendMaterial;

        public int ActiveCameraIndex => m_ActiveCameraIndex;
        public bool IsTransitioning => m_IsTransitioning;
        public int CameraCount => System.Math.Min(m_CameraSources.Length, 4);

        public enum SwitchMode
        {
            Cut,
            Dissolve,
            WipeLeft,
            WipeRight,
            WipeUp,
            WipeDown
        }

        [System.Serializable]
        public class CameraSource
        {
            public string Name = "Camera";
            public Camera Camera;
            public FreeDCameraTracker Tracker;
            public AudioSource AudioSource;
            public bool IsEnabled = true;
            public RenderTexture RenderTexture;
        }

        private void OnEnable()
        {
            InitializeRenderTextures();
            InitializeBlendMaterial();
            SetActiveCamera(m_ActiveCameraIndex, false);
        }

        private void OnDisable()
        {
            ReleaseRenderTextures();
        }

        private void InitializeRenderTextures()
        {
            for (int i = 0; i < m_CameraSources.Length; i++)
            {
                if (m_CameraSources[i]?.Camera != null && m_CameraSources[i].RenderTexture == null)
                {
                    m_CameraSources[i].RenderTexture = new RenderTexture(1920, 1080, 24);
                    m_CameraSources[i].Camera.targetTexture = m_CameraSources[i].RenderTexture;
                }
            }
        }

        private void ReleaseRenderTextures()
        {
            for (int i = 0; i < m_CameraSources.Length; i++)
            {
                if (m_CameraSources[i]?.RenderTexture != null)
                {
                    m_CameraSources[i].RenderTexture.Release();
                    m_CameraSources[i].RenderTexture = null;
                }
            }
        }

        private void InitializeBlendMaterial()
        {
            Shader blendShader = Shader.Find("VirtualProduction/VideoTransition");
            if (blendShader != null)
            {
                m_BlendMaterial = new Material(blendShader);
            }
        }

        public void SwitchToCamera(int index, bool withTransition = true)
        {
            if (index < 0 || index >= m_CameraSources.Length || index == m_ActiveCameraIndex)
                return;

            if (m_CameraSources[index]?.IsEnabled == false)
                return;

            m_PreviousCameraIndex = m_ActiveCameraIndex;
            m_ActiveCameraIndex = index;

            if (withTransition && m_SwitchMode != SwitchMode.Cut)
            {
                StartCoroutine(TransitionCoroutine());
            }
            else
            {
                SetActiveCamera(index, true);
            }

            if (m_SyncAudio)
            {
                SyncAudio(index);
            }
        }

        private void SetActiveCamera(int index, bool immediate)
        {
            for (int i = 0; i < m_CameraSources.Length; i++)
            {
                if (m_CameraSources[i]?.Camera != null)
                {
                    m_CameraSources[i].Camera.gameObject.SetActive(i == index);
                }
            }

            if (immediate && m_OutputCamera != null && m_CameraSources[index]?.RenderTexture != null)
            {
                m_OutputCamera.targetTexture = m_CameraSources[index].RenderTexture;
            }
        }

        private void SyncAudio(int index)
        {
            if (m_AudioSource != null && m_CameraSources[index]?.AudioSource != null)
            {
                m_AudioSource.clip = m_CameraSources[index].AudioSource.clip;
                m_AudioSource.time = m_CameraSources[index].AudioSource.time;
                m_AudioSource.Play();
            }
        }

        private IEnumerator TransitionCoroutine()
        {
            m_IsTransitioning = true;
            m_TransitionProgress = 0f;

            while (m_TransitionProgress < 1f)
            {
                m_TransitionProgress += Time.deltaTime / m_TransitionDuration;
                float t = m_TransitionCurve.Evaluate(Mathf.Clamp01(m_TransitionProgress));
                UpdateTransitionBlend(t);
                yield return null;
            }

            SetActiveCamera(m_ActiveCameraIndex, true);
            m_IsTransitioning = false;
        }

        private void UpdateTransitionBlend(float progress)
        {
            if (m_BlendMaterial == null || m_PreviewTexture == null) return;
            if (m_PreviousCameraIndex < 0 || m_ActiveCameraIndex >= m_CameraSources.Length) return;

            var prevRT = m_CameraSources[m_PreviousCameraIndex]?.RenderTexture;
            var nextRT = m_CameraSources[m_ActiveCameraIndex]?.RenderTexture;

            if (prevRT == null || nextRT == null) return;

            m_BlendMaterial.SetTexture("_PrevTex", prevRT);
            m_BlendMaterial.SetTexture("_NextTex", nextRT);
            m_BlendMaterial.SetFloat("_Progress", progress);
            m_BlendMaterial.SetInt("_Mode", (int)m_SwitchMode - 1);

            RenderTexture.active = m_PreviewTexture;
            Graphics.Blit(null, m_PreviewTexture, m_BlendMaterial);
            RenderTexture.active = null;
        }

        public void PreviewCamera(int index)
        {
            if (index >= 0 && index < m_CameraSources.Length && m_CameraSources[index]?.RenderTexture != null)
            {
                if (m_OutputCamera != null)
                {
                    m_OutputCamera.targetTexture = m_CameraSources[index].RenderTexture;
                }
            }
        }

        public void SetCameraEnabled(int index, bool enabled)
        {
            if (index >= 0 && index < m_CameraSources.Length)
            {
                m_CameraSources[index].IsEnabled = enabled;

                if (!enabled && index == m_ActiveCameraIndex)
                {
                    for (int i = 0; i < m_CameraSources.Length; i++)
                    {
                        if (m_CameraSources[i].IsEnabled)
                        {
                            SwitchToCamera(i, true);
                            break;
                        }
                    }
                }
            }
        }

        public RenderTexture GetCameraRenderTexture(int index)
        {
            if (index >= 0 && index < m_CameraSources.Length)
            {
                return m_CameraSources[index]?.RenderTexture;
            }
            return null;
        }

        public CameraSource GetCameraSource(int index)
        {
            if (index >= 0 && index < m_CameraSources.Length)
            {
                return m_CameraSources[index];
            }
            return null;
        }

        private void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (m_IsTransitioning && m_BlendMaterial != null)
            {
                Graphics.Blit(source, destination, m_BlendMaterial);
            }
            else
            {
                Graphics.Blit(source, destination);
            }
        }
    }
}
