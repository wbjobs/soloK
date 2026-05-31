using System.Collections.Generic;
using UnityEngine;

namespace VirtualProduction
{
    public enum ReactionType
    {
        Evade,
        LookAt,
        Wave,
        CustomAnimation,
        Idle
    }

    public enum DetectionMethod
    {
        Distance,
        Raycast,
        FieldOfView,
        Combined
    }

    public class CharacterCameraInteraction : MonoBehaviour
    {
        [Header("Detection Settings")]
        [SerializeField] private DetectionMethod m_DetectionMethod = DetectionMethod.Combined;
        [SerializeField] private float m_DetectionDistance = 5.0f;
        [SerializeField] [Range(1, 360)] private float m_FieldOfView = 180.0f;
        [SerializeField] private LayerMask m_OcclusionLayer = ~0;
        [SerializeField] private int m_RaycastCount = 5;
        [SerializeField] private float m_RaycastSpread = 0.5f;

        [Header("Reaction Settings")]
        [SerializeField] private ReactionType m_DefaultReaction = ReactionType.Evade;
        [SerializeField] private float m_ReactionThreshold = 2.0f;
        [SerializeField] private float m_EvadeDistance = 3.0f;
        [SerializeField] private float m_EvadeSpeed = 2.0f;
        [SerializeField] private float m_ReturnSpeed = 1.0f;
        [SerializeField] private float m_ReactionCooldown = 1.0f;
        [SerializeField] private bool m_EnableAnimationTrigger = true;
        [SerializeField] private string m_AnimationParameterName = "CameraProximity";

        [Header("Target Camera")]
        [SerializeField] private Transform m_TargetCamera;
        [SerializeField] private FreeDCameraTracker m_CameraTracker;
        [SerializeField] private bool m_AutoFindCamera = true;

        [Header("Status")]
        [SerializeField] private bool m_IsCameraDetected;
        [SerializeField] private float m_DistanceToCamera;
        [SerializeField] private ReactionType m_CurrentReaction;
        [SerializeField] private Vector3 m_OriginalPosition;
        [SerializeField] private Vector3 m_EvadeDirection;

        [Header("Debug")]
        [SerializeField] private bool m_DrawDebugGizmos = true;
        [SerializeField] private Color m_DetectionColor = Color.yellow;
        [SerializeField] private Color m_DetectedColor = Color.red;

        private Animator m_Animator;
        private CharacterController m_CharacterController;
        private float m_LastReactionTime;
        private bool m_IsEvading;

        public bool IsCameraDetected => m_IsCameraDetected;
        public float DistanceToCamera => m_DistanceToCamera;
        public ReactionType CurrentReaction => m_CurrentReaction;

        private void Awake()
        {
            m_Animator = GetComponent<Animator>();
            m_CharacterController = GetComponent<CharacterController>();
            m_OriginalPosition = transform.position;
        }

        private void Start()
        {
            if (m_AutoFindCamera && m_TargetCamera == null)
            {
                FindCamera();
            }
        }

        private void Update()
        {
            if (m_TargetCamera == null) return;

            DetectCamera();
            UpdateReaction();
        }

        private void FindCamera()
        {
            if (m_CameraTracker != null)
            {
                m_TargetCamera = m_CameraTracker.transform;
            }
            else
            {
                Camera mainCam = Camera.main;
                if (mainCam != null)
                {
                    m_TargetCamera = mainCam.transform;
                }
            }
        }

        private void DetectCamera()
        {
            bool detected = false;
            m_DistanceToCamera = Vector3.Distance(transform.position, m_TargetCamera.position);

            switch (m_DetectionMethod)
            {
                case DetectionMethod.Distance:
                    detected = DetectByDistance();
                    break;
                case DetectionMethod.Raycast:
                    detected = DetectByRaycast();
                    break;
                case DetectionMethod.FieldOfView:
                    detected = DetectByFieldOfView();
                    break;
                case DetectionMethod.Combined:
                    detected = DetectCombined();
                    break;
            }

            m_IsCameraDetected = detected;
        }

        private bool DetectByDistance()
        {
            return m_DistanceToCamera <= m_DetectionDistance;
        }

        private bool DetectByRaycast()
        {
            if (m_DistanceToCamera > m_DetectionDistance) return false;

            Vector3 direction = (m_TargetCamera.position - transform.position).normalized;
            Vector3 origin = transform.position + Vector3.up * 1.0f;

            for (int i = 0; i < m_RaycastCount; i++)
            {
                Vector3 spreadDir = direction;
                if (i > 0)
                {
                    float angle = (i - 0.5f) * m_RaycastSpread;
                    spreadDir = Quaternion.AngleAxis(angle, Vector3.up) * direction;
                }

                if (Physics.Raycast(origin, spreadDir, out RaycastHit hit, m_DetectionDistance, m_OcclusionLayer))
                {
                    if (hit.transform == m_TargetCamera || hit.transform.IsChildOf(m_TargetCamera))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private bool DetectByFieldOfView()
        {
            if (m_DistanceToCamera > m_DetectionDistance) return false;

            Vector3 toCamera = (m_TargetCamera.position - transform.position).normalized;
            float angle = Vector3.Angle(transform.forward, toCamera);
            return angle <= m_FieldOfView * 0.5f;
        }

        private bool DetectCombined()
        {
            return DetectByDistance() && DetectByFieldOfView() && DetectByRaycast();
        }

        private void UpdateReaction()
        {
            if (Time.time - m_LastReactionTime < m_ReactionCooldown) return;

            if (m_IsCameraDetected && m_DistanceToCamera < m_ReactionThreshold)
            {
                ExecuteReaction(m_DefaultReaction);
                m_LastReactionTime = Time.time;
            }
            else if (m_IsEvading)
            {
                ReturnToOrigin();
            }
        }

        private void ExecuteReaction(ReactionType reaction)
        {
            m_CurrentReaction = reaction;

            switch (reaction)
            {
                case ReactionType.Evade:
                    PerformEvade();
                    break;
                case ReactionType.LookAt:
                    PerformLookAt();
                    break;
                case ReactionType.Wave:
                    PerformWave();
                    break;
                case ReactionType.CustomAnimation:
                    PerformCustomAnimation();
                    break;
            }

            if (m_EnableAnimationTrigger && m_Animator != null)
            {
                m_Animator.SetFloat(m_AnimationParameterName, 1.0f - (m_DistanceToCamera / m_DetectionDistance));
            }
        }

        private void PerformEvade()
        {
            if (m_IsEvading) return;

            m_IsEvading = true;
            Vector3 cameraDirection = (transform.position - m_TargetCamera.position).normalized;
            cameraDirection.y = 0;
            m_EvadeDirection = cameraDirection.normalized;

            StartCoroutine(EvadeCoroutine());
        }

        private System.Collections.IEnumerator EvadeCoroutine()
        {
            Vector3 targetPos = m_OriginalPosition + m_EvadeDirection * m_EvadeDistance;
            float elapsed = 0f;
            float duration = m_EvadeDistance / m_EvadeSpeed;

            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                float t = elapsed / duration;

                if (m_CharacterController != null)
                {
                    Vector3 moveDir = (targetPos - transform.position).normalized * m_EvadeSpeed * Time.deltaTime;
                    m_CharacterController.Move(moveDir);
                }
                else
                {
                    transform.position = Vector3.Lerp(m_OriginalPosition, targetPos, t);
                }

                yield return null;
            }
        }

        private void ReturnToOrigin()
        {
            Vector3 returnDir = (m_OriginalPosition - transform.position).normalized;

            if (m_CharacterController != null)
            {
                m_CharacterController.Move(returnDir * m_ReturnSpeed * Time.deltaTime);
            }
            else
            {
                transform.position = Vector3.Lerp(transform.position, m_OriginalPosition, m_ReturnSpeed * Time.deltaTime);
            }

            if (Vector3.Distance(transform.position, m_OriginalPosition) < 0.1f)
            {
                m_IsEvading = false;
                m_CurrentReaction = ReactionType.Idle;
            }
        }

        private void PerformLookAt()
        {
            Vector3 lookPos = m_TargetCamera.position;
            lookPos.y = transform.position.y;
            transform.LookAt(lookPos);
        }

        private void PerformWave()
        {
            if (m_Animator != null)
            {
                m_Animator.SetTrigger("Wave");
            }
        }

        private void PerformCustomAnimation()
        {
            if (m_Animator != null)
            {
                m_Animator.SetTrigger("CustomReaction");
            }
        }

        public void SetTargetCamera(Transform camera)
        {
            m_TargetCamera = camera;
        }

        public void SetReactionType(ReactionType reaction)
        {
            m_DefaultReaction = reaction;
        }

        public void ForceReaction(ReactionType reaction)
        {
            ExecuteReaction(reaction);
        }

        private void OnDrawGizmosSelected()
        {
            if (!m_DrawDebugGizmos) return;

            Gizmos.color = m_IsCameraDetected ? m_DetectedColor : m_DetectionColor;

            if (m_DetectionMethod == DetectionMethod.FieldOfView || m_DetectionMethod == DetectionMethod.Combined)
            {
                Vector3 forward = transform.forward * m_DetectionDistance;
                Vector3 right = Quaternion.Euler(0, m_FieldOfView * 0.5f, 0) * forward;
                Vector3 left = Quaternion.Euler(0, -m_FieldOfView * 0.5f, 0) * forward;

                Gizmos.DrawRay(transform.position, forward);
                Gizmos.DrawRay(transform.position, right);
                Gizmos.DrawRay(transform.position, left);

                UnityEditor.Handles.color = m_IsCameraDetected ? m_DetectedColor : m_DetectionColor;
                UnityEditor.Handles.DrawWireArc(transform.position, Vector3.up, left, m_FieldOfView, m_DetectionDistance);
            }
            else
            {
                Gizmos.DrawWireSphere(transform.position, m_DetectionDistance);
            }

            if (m_TargetCamera != null && m_IsCameraDetected)
            {
                Gizmos.DrawLine(transform.position + Vector3.up, m_TargetCamera.position);
            }
        }
    }
}
