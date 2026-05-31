using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace VirtualProduction
{
    public enum CharacterState
    {
        Idle,
        Alert,
        Evading,
        Approaching,
        Looking,
        Returning,
        Performing
    }

    public class AdvancedCharacterAI : MonoBehaviour
    {
        [Header("Core References")]
        [SerializeField] private NavMeshAgent m_NavMeshAgent;
        [SerializeField] private Animator m_Animator;
        [SerializeField] private Transform m_EyeTransform;
        [SerializeField] private FreeDCameraTracker m_CameraTracker;
        [SerializeField] private Transform m_TargetCamera;

        [Header("Detection Settings")]
        [SerializeField] private float m_DetectionRadius = 8.0f;
        [SerializeField] private float m_CloseRange = 3.0f;
        [SerializeField] private float m_FieldOfView = 120.0f;
        [SerializeField] private float m_EyeHeight = 1.6f;
        [SerializeField] private LayerMask m_OcclusionMask = ~0;
        [SerializeField] private int m_RaysPerCheck = 12;

        [Header("Behavior Settings")]
        [SerializeField] private CharacterState m_DefaultState = CharacterState.Idle;
        [SerializeField] private float m_ReactionDelay = 0.2f;
        [SerializeField] private float m_StateCooldown = 1.0f;
        [SerializeField] private bool m_UseNavMesh = true;
        [SerializeField] private bool m_EnableLookAt = true;
        [SerializeField] private bool m_EnableGestures = true;

        [Header("Evade Settings")]
        [SerializeField] private float m_EvadeDistance = 4.0f;
        [SerializeField] private float m_EvadeSpeed = 3.5f;
        [SerializeField] private float m_EvadeAngularSpeed = 240.0f;
        [SerializeField] private AnimationCurve m_EvadeDistanceCurve = AnimationCurve.Linear(0, 1, 1, 0);

        [Header("Approach Settings")]
        [SerializeField] private float m_ApproachDistance = 2.0f;
        [SerializeField] private float m_ApproachSpeed = 2.0f;

        [Header("Animation Parameters")]
        [SerializeField] private string m_SpeedParam = "Speed";
        [SerializeField] private string m_StateParam = "State";
        [SerializeField] private string m_AlertParam = "Alert";
        [SerializeField] private string m_CameraDistanceParam = "CameraDistance";

        [Header("Status")]
        [SerializeField] private CharacterState m_CurrentState;
        [SerializeField] private float m_DistanceToCamera;
        [SerializeField] private bool m_HasLineOfSight;
        [SerializeField] private Vector3 m_DesiredPosition;
        [SerializeField] private float m_StateTimer;

        [Header("Debug")]
        [SerializeField] private bool m_DrawGizmos = true;
        [SerializeField] private Color m_DetectionColor = Color.yellow;
        [SerializeField] private Color m_LOSColor = Color.green;

        private Vector3 m_OriginalPosition;
        private Quaternion m_OriginalRotation;
        private float m_LastStateChangeTime;
        private Coroutine m_CurrentBehavior;

        private const int STATE_IDLE = 0;
        private const int STATE_ALERT = 1;
        private const int STATE_EVADE = 2;
        private const int STATE_APPROACH = 3;

        public CharacterState CurrentState => m_CurrentState;
        public float DistanceToCamera => m_DistanceToCamera;
        public bool HasLineOfSight => m_HasLineOfSight;

        private void Awake()
        {
            if (m_NavMeshAgent == null)
                m_NavMeshAgent = GetComponent<NavMeshAgent>();
            if (m_Animator == null)
                m_Animator = GetComponent<Animator>();
            if (m_EyeTransform == null)
                m_EyeTransform = transform;

            m_OriginalPosition = transform.position;
            m_OriginalRotation = transform.rotation;
        }

        private void Start()
        {
            if (m_TargetCamera == null && m_CameraTracker != null)
                m_TargetCamera = m_CameraTracker.transform;
            if (m_TargetCamera == null)
                m_TargetCamera = Camera.main?.transform;

            ChangeState(m_DefaultState);
        }

        private void Update()
        {
            if (m_TargetCamera == null) return;

            UpdateDetection();
            UpdateStateMachine();
            UpdateAnimator();
        }

        private void UpdateDetection()
        {
            m_DistanceToCamera = Vector3.Distance(transform.position, m_TargetCamera.position);
            m_HasLineOfSight = CheckLineOfSight();
        }

        private bool CheckLineOfSight()
        {
            if (m_DistanceToCamera > m_DetectionRadius)
                return false;

            Vector3 eyePos = transform.position + Vector3.up * m_EyeHeight;
            Vector3 toCamera = m_TargetCamera.position - eyePos;

            Vector3 forward = transform.forward;
            float angle = Vector3.Angle(forward, toCamera);
            if (angle > m_FieldOfView * 0.5f)
                return false;

            float raySpacing = 1.0f / m_RaysPerCheck;
            for (int i = 0; i < m_RaysPerCheck; i++)
            {
                float t = i * raySpacing;
                Vector3 rayOrigin = Vector3.Lerp(eyePos, eyePos + transform.up * 0.3f, t);
                Vector3 rayDir = toCamera.normalized + Random.insideUnitSphere * 0.1f;

                if (!Physics.Raycast(rayOrigin, rayDir, m_DistanceToCamera, m_OcclusionMask))
                {
                    return true;
                }
            }

            return false;
        }

        private void UpdateStateMachine()
        {
            m_StateTimer += Time.deltaTime;

            switch (m_CurrentState)
            {
                case CharacterState.Idle:
                    UpdateIdleState();
                    break;
                case CharacterState.Alert:
                    UpdateAlertState();
                    break;
                case CharacterState.Evading:
                    UpdateEvadingState();
                    break;
                case CharacterState.Approaching:
                    UpdateApproachingState();
                    break;
                case CharacterState.Returning:
                    UpdateReturningState();
                    break;
            }
        }

        private void UpdateIdleState()
        {
            if (m_HasLineOfSight && m_DistanceToCamera < m_DetectionRadius)
            {
                if (m_DistanceToCamera < m_CloseRange)
                {
                    ChangeState(CharacterState.Evading);
                }
                else
                {
                    ChangeState(CharacterState.Alert);
                }
            }

            if (m_EnableLookAt && m_HasLineOfSight)
            {
                SmoothLookAt(m_TargetCamera.position, 2.0f);
            }
        }

        private void UpdateAlertState()
        {
            if (!m_HasLineOfSight)
            {
                ChangeState(CharacterState.Idle);
                return;
            }

            if (m_DistanceToCamera < m_CloseRange)
            {
                ChangeState(CharacterState.Evading);
                return;
            }

            if (m_DistanceToCamera > m_DetectionRadius)
            {
                ChangeState(CharacterState.Idle);
                return;
            }

            SmoothLookAt(m_TargetCamera.position, 5.0f);

            if (m_EnableGestures && m_StateTimer > m_StateCooldown)
            {
                if (Random.value < 0.3f)
                {
                    TriggerGesture("AlertGesture");
                    m_StateTimer = 0;
                }
            }
        }

        private void UpdateEvadingState()
        {
            if (m_DistanceToCamera > m_DetectionRadius || !m_HasLineOfSight)
            {
                ChangeState(CharacterState.Returning);
                return;
            }

            if (m_UseNavMesh && m_NavMeshAgent != null)
            {
                Vector3 evadeDir = (transform.position - m_TargetCamera.position).normalized;
                float distanceFactor = 1.0f - (m_DistanceToCamera / m_DetectionRadius);
                float curveFactor = m_EvadeDistanceCurve.Evaluate(distanceFactor);

                m_DesiredPosition = transform.position + evadeDir * m_EvadeDistance * curveFactor;

                if (NavMesh.SamplePosition(m_DesiredPosition, out NavMeshHit hit, 2.0f, NavMesh.AllAreas))
                {
                    m_NavMeshAgent.SetDestination(hit.position);
                    m_NavMeshAgent.speed = m_EvadeSpeed;
                    m_NavMeshAgent.angularSpeed = m_EvadeAngularSpeed;
                }
            }
            else
            {
                Vector3 evadeDir = (transform.position - m_TargetCamera.position).normalized;
                transform.position = Vector3.Lerp(transform.position,
                    transform.position + evadeDir * m_EvadeSpeed * Time.deltaTime,
                    0.5f);
                SmoothLookAt(m_TargetCamera.position, 8.0f);
            }

            LookOverShoulder();
        }

        private void UpdateApproachingState()
        {
            if (!m_HasLineOfSight)
            {
                ChangeState(CharacterState.Returning);
                return;
            }

            if (m_DistanceToCamera <= m_ApproachDistance)
            {
                ChangeState(CharacterState.Alert);
                return;
            }

            if (m_UseNavMesh && m_NavMeshAgent != null)
            {
                m_NavMeshAgent.SetDestination(m_TargetCamera.position);
                m_NavMeshAgent.speed = m_ApproachSpeed;
            }

            SmoothLookAt(m_TargetCamera.position, 3.0f);
        }

        private void UpdateReturningState()
        {
            float distanceToOrigin = Vector3.Distance(transform.position, m_OriginalPosition);

            if (distanceToOrigin < 0.5f)
            {
                transform.position = m_OriginalPosition;
                transform.rotation = m_OriginalRotation;
                ChangeState(CharacterState.Idle);
                return;
            }

            if (m_HasLineOfSight && m_DistanceToCamera < m_DetectionRadius)
            {
                if (m_DistanceToCamera < m_CloseRange)
                    ChangeState(CharacterState.Evading);
                else
                    ChangeState(CharacterState.Alert);
                return;
            }

            if (m_UseNavMesh && m_NavMeshAgent != null)
            {
                m_NavMeshAgent.SetDestination(m_OriginalPosition);
                m_NavMeshAgent.speed = 1.5f;
            }
            else
            {
                transform.position = Vector3.MoveTowards(transform.position, m_OriginalPosition, 1.5f * Time.deltaTime);
                transform.rotation = Quaternion.RotateTowards(transform.rotation, m_OriginalRotation, 90f * Time.deltaTime);
            }
        }

        private void ChangeState(CharacterState newState)
        {
            if (Time.time - m_LastStateChangeTime < m_StateCooldown)
                return;

            m_CurrentState = newState;
            m_LastStateChangeTime = Time.time;
            m_StateTimer = 0;

            if (m_Animator != null)
            {
                m_Animator.SetInteger(m_StateParam, (int)newState);
            }
        }

        private void SmoothLookAt(Vector3 target, float speed)
        {
            Vector3 lookPos = target;
            lookPos.y = transform.position.y + m_EyeHeight * 0.5f;

            Quaternion targetRot = Quaternion.LookRotation(lookPos - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, speed * Time.deltaTime);
        }

        private void LookOverShoulder()
        {
            Vector3 toCamera = m_TargetCamera.position - transform.position;
            float angle = Vector3.SignedAngle(transform.forward, toCamera, Vector3.up);

            if (m_Animator != null)
            {
                m_Animator.SetFloat("LookAngle", angle / 180.0f);
            }
        }

        private void TriggerGesture(string gestureName)
        {
            if (m_Animator != null && !m_Animator.IsInTransition(0))
            {
                m_Animator.SetTrigger(gestureName);
            }
        }

        private void UpdateAnimator()
        {
            if (m_Animator == null) return;

            float speed = 0f;
            if (m_NavMeshAgent != null && m_NavMeshAgent.hasPath)
            {
                speed = m_NavMeshAgent.velocity.magnitude;
            }

            m_Animator.SetFloat(m_SpeedParam, speed);
            m_Animator.SetBool(m_AlertParam, m_CurrentState == CharacterState.Alert);
            m_Animator.SetFloat(m_CameraDistanceParam, m_DistanceToCamera / m_DetectionRadius);
        }

        public void ForceEvade()
        {
            ChangeState(CharacterState.Evading);
        }

        public void ForceApproach()
        {
            ChangeState(CharacterState.Approaching);
        }

        public void ReturnToOrigin()
        {
            ChangeState(CharacterState.Returning);
        }

        public void SetTargetCamera(Transform camera)
        {
            m_TargetCamera = camera;
        }

        private void OnDrawGizmosSelected()
        {
            if (!m_DrawGizmos) return;

            Gizmos.color = m_DetectionColor;
            Gizmos.DrawWireSphere(transform.position, m_DetectionRadius);

            Vector3 forward = transform.forward * m_DetectionRadius;
            Vector3 right = Quaternion.Euler(0, m_FieldOfView * 0.5f, 0) * forward;
            Vector3 left = Quaternion.Euler(0, -m_FieldOfView * 0.5f, 0) * forward;

            Gizmos.DrawRay(transform.position, forward);
            Gizmos.DrawRay(transform.position, right);
            Gizmos.DrawRay(transform.position, left);

            if (m_HasLineOfSight && m_TargetCamera != null)
            {
                Gizmos.color = m_LOSColor;
                Gizmos.DrawLine(transform.position + Vector3.up * m_EyeHeight, m_TargetCamera.position);
            }

            if (m_CurrentState == CharacterState.Evading)
            {
                Gizmos.color = Color.red;
                Gizmos.DrawWireSphere(m_DesiredPosition, 0.5f);
            }
        }
    }
}
