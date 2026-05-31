using UnityEngine;

namespace VirtualProduction
{
    [ExecuteAlways]
    public class FreeDCameraTracker : MonoBehaviour
    {
        [Header("FreeD Configuration")]
        [SerializeField] private int m_CameraId = 0;
        [SerializeField] private int m_Port = 40000;
        [SerializeField] private string m_IPAddress = "0.0.0.0";

        [Header("Tracking Settings")]
        [SerializeField] private bool m_EnableTracking = true;
        [SerializeField] private Vector3 m_PositionOffset = Vector3.zero;
        [SerializeField] private Vector3 m_RotationOffset = Vector3.zero;
        [SerializeField] private float m_PositionScale = 1.0f;

        [Header("Advanced Motion Settings")]
        [SerializeField] private bool m_EnableMotionPrediction = true;
        [SerializeField] [Range(1, 5)] private int m_PredictionFrames = 2;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_DampingFactor = 0.85f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_VelocityThreshold = 0.5f;
        [SerializeField] private float m_MaxPredictionDistance = 0.5f;
        [SerializeField] private float m_MaxPredictionAngle = 15.0f;

        [Header("Filter Settings")]
        [SerializeField] private bool m_EnableFilter = false;
        [SerializeField] [Range(0.001f, 0.5f)] private float m_FilterSmoothing = 0.1f;

        [Header("PID Controller")]
        [SerializeField] private bool m_UsePIDController = true;
        [SerializeField] [Range(0.1f, 10.0f)] private float m_Kp = 2.0f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_Ki = 0.1f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_Kd = 0.05f;

        [Header("Data Output")]
        [SerializeField] private FreeDCameraData m_LatestData;
        [SerializeField] private FreeDCameraData m_PredictedData;
        [SerializeField] private bool m_IsConnected;
        [SerializeField] private Vector3 m_CurrentVelocity;
        [SerializeField] private Vector3 m_CurrentAngularVelocity;
        [SerializeField] private float m_CurrentSpeed;

        private bool m_IsInitialized = false;

        private Vector3 m_PreviousPosition;
        private Vector3 m_PreviousEulerAngles;
        private Vector3 m_IntegratedError;
        private Vector3 m_PreviousError;

        private const int MAX_HISTORY = 10;
        private Vector3[] m_PositionHistory = new Vector3[MAX_HISTORY];
        private Vector3[] m_RotationHistory = new Vector3[MAX_HISTORY];
        private float[] m_TimeHistory = new float[MAX_HISTORY];
        private int m_HistoryIndex = 0;
        private int m_HistoryCount = 0;

        public int CameraId
        {
            get => m_CameraId;
            set => m_CameraId = value;
        }

        public bool IsConnected => m_IsConnected;
        public FreeDCameraData LatestData => m_LatestData;
        public FreeDCameraData PredictedData => m_PredictedData;
        public float CurrentSpeed => m_CurrentSpeed;
        public bool EnableTracking
        {
            get => m_EnableTracking;
            set => m_EnableTracking = value;
        }

        private void OnEnable()
        {
            if (Application.isPlaying && m_EnableTracking)
            {
                Initialize();
            }
        }

        private void OnDisable()
        {
            Shutdown();
        }

        private void OnDestroy()
        {
            Shutdown();
        }

        public void Initialize()
        {
            if (m_IsInitialized) return;

            m_IsInitialized = FreeDNativeBindings.FreeD_Initialize(m_CameraId, m_Port, m_IPAddress);
            if (m_IsInitialized)
            {
                FreeDNativeBindings.FreeD_SetFilterEnabled(m_CameraId, m_EnableFilter);
                FreeDNativeBindings.FreeD_SetFilterSmoothing(m_CameraId, m_FilterSmoothing);
                ResetHistory();
            }
        }

        public void Shutdown()
        {
            if (m_IsInitialized)
            {
                FreeDNativeBindings.FreeD_Shutdown(m_CameraId);
                m_IsInitialized = false;
            }
        }

        private void ResetHistory()
        {
            m_HistoryIndex = 0;
            m_HistoryCount = 0;
            m_PreviousPosition = transform.position;
            m_PreviousEulerAngles = transform.eulerAngles;
            m_CurrentVelocity = Vector3.zero;
            m_CurrentAngularVelocity = Vector3.zero;
            m_IntegratedError = Vector3.zero;
            m_PreviousError = Vector3.zero;
        }

        private void Update()
        {
            if (!Application.isPlaying || !m_EnableTracking || !m_IsInitialized) return;

            FreeDNativeBindings.FreeD_Update(m_CameraId);
            m_IsConnected = FreeDNativeBindings.FreeD_IsConnected(m_CameraId);

            if (m_IsConnected)
            {
                FreeDNativeBindings.FreeD_GetCameraData(m_CameraId,
                    out m_LatestData.Pan,
                    out m_LatestData.Tilt,
                    out m_LatestData.Roll,
                    out m_LatestData.X,
                    out m_LatestData.Y,
                    out m_LatestData.Z,
                    out m_LatestData.Zoom,
                    out m_LatestData.Focus,
                    out m_LatestData.Aperture);

                UpdateTransform();
            }
        }

        private void UpdateTransform()
        {
            Vector3 targetPos = m_LatestData.Position * m_PositionScale + m_PositionOffset;
            Quaternion targetRot = m_LatestData.Rotation * Quaternion.Euler(m_RotationOffset);
            Vector3 targetEuler = targetRot.eulerAngles;

            RecordHistory(targetPos, targetEuler);

            Vector3 predictedPos = targetPos;
            Vector3 predictedEuler = targetEuler;

            if (m_EnableMotionPrediction && m_HistoryCount >= 3)
            {
                CalculateVelocity();
                predictedPos = PredictPosition(targetPos);
                predictedEuler = PredictRotation(targetEuler);
            }

            m_PredictedData.Pan = predictedEuler.y;
            m_PredictedData.Tilt = predictedEuler.x;
            m_PredictedData.Roll = predictedEuler.z;
            m_PredictedData.X = predictedPos.x;
            m_PredictedData.Y = predictedPos.y;
            m_PredictedData.Z = predictedPos.z;
            m_PredictedData.Zoom = m_LatestData.Zoom;
            m_PredictedData.Focus = m_LatestData.Focus;
            m_PredictedData.Aperture = m_LatestData.Aperture;

            if (m_UsePIDController)
            {
                ApplyPIDControl(predictedPos, predictedEuler);
            }
            else
            {
                ApplyDamping(predictedPos, predictedEuler);
            }
        }

        private void RecordHistory(Vector3 pos, Vector3 euler)
        {
            m_PositionHistory[m_HistoryIndex] = pos;
            m_RotationHistory[m_HistoryIndex] = euler;
            m_TimeHistory[m_HistoryIndex] = Time.time;

            m_HistoryIndex = (m_HistoryIndex + 1) % MAX_HISTORY;
            if (m_HistoryCount < MAX_HISTORY)
            {
                m_HistoryCount++;
            }
        }

        private void CalculateVelocity()
        {
            int lastIndex = (m_HistoryIndex - 1 + MAX_HISTORY) % MAX_HISTORY;
            int prevIndex = (m_HistoryIndex - 3 + MAX_HISTORY) % MAX_HISTORY;

            if (m_HistoryCount >= 3)
            {
                float deltaTime = Mathf.Max(m_TimeHistory[lastIndex] - m_TimeHistory[prevIndex], 0.001f);
                m_CurrentVelocity = (m_PositionHistory[lastIndex] - m_PositionHistory[prevIndex]) / deltaTime;
                m_CurrentAngularVelocity = CalculateAngularVelocity(
                    m_RotationHistory[prevIndex],
                    m_RotationHistory[lastIndex],
                    deltaTime);

                m_CurrentSpeed = m_CurrentVelocity.magnitude;
            }
        }

        private Vector3 CalculateAngularVelocity(Vector3 from, Vector3 to, float deltaTime)
        {
            Vector3 delta = to - from;

            delta.x = Mathf.DeltaAngle(from.x, to.x);
            delta.y = Mathf.DeltaAngle(from.y, to.y);
            delta.z = Mathf.DeltaAngle(from.z, to.z);

            return delta / deltaTime;
        }

        private Vector3 PredictPosition(Vector3 currentPos)
        {
            if (m_CurrentSpeed < m_VelocityThreshold)
            {
                m_IntegratedError *= 0.9f;
                return currentPos;
            }

            float predictionTime = m_PredictionFrames * Time.deltaTime;
            Vector3 predictedPos = currentPos + m_CurrentVelocity * predictionTime;

            Vector3 delta = predictedPos - currentPos;
            if (delta.magnitude > m_MaxPredictionDistance)
            {
                delta = delta.normalized * m_MaxPredictionDistance;
                predictedPos = currentPos + delta;
            }

            return predictedPos;
        }

        private Vector3 PredictRotation(Vector3 currentEuler)
        {
            float angularSpeed = m_CurrentAngularVelocity.magnitude;
            if (angularSpeed < 1.0f)
            {
                return currentEuler;
            }

            float predictionTime = m_PredictionFrames * Time.deltaTime;
            Vector3 predictedEuler = currentEuler + m_CurrentAngularVelocity * predictionTime;

            Vector3 delta = predictedEuler - currentEuler;
            float angleDelta = delta.magnitude;
            if (angleDelta > m_MaxPredictionAngle)
            {
                delta = delta.normalized * m_MaxPredictionAngle;
                predictedEuler = currentEuler + delta;
            }

            return predictedEuler;
        }

        private void ApplyPIDControl(Vector3 targetPos, Vector3 targetEuler)
        {
            Vector3 posError = targetPos - transform.position;
            Vector3 eulerError = new Vector3(
                Mathf.DeltaAngle(transform.eulerAngles.x, targetEuler.x),
                Mathf.DeltaAngle(transform.eulerAngles.y, targetEuler.y),
                Mathf.DeltaAngle(transform.eulerAngles.z, targetEuler.z));

            m_IntegratedError += posError * Time.deltaTime;
            m_IntegratedError = Vector3.ClampMagnitude(m_IntegratedError, 2.0f);

            Vector3 derivativeError = (posError - m_PreviousError) / Mathf.Max(Time.deltaTime, 0.001f);
            m_PreviousError = posError;

            Vector3 posOutput = m_Kp * posError + m_Ki * m_IntegratedError + m_Kd * derivativeError;
            Vector3 finalPos = transform.position + posOutput * Time.deltaTime;

            Vector3 eulerOutput = m_Kp * eulerError;
            Vector3 finalEuler = transform.eulerAngles + eulerOutput * Time.deltaTime;

            finalPos = Vector3.Lerp(transform.position, finalPos, 1.0f - m_DampingFactor);
            finalEuler = Vector3.Lerp(transform.eulerAngles, finalEuler, 1.0f - m_DampingFactor);

            transform.position = finalPos;
            transform.rotation = Quaternion.Euler(finalEuler);
        }

        private void ApplyDamping(Vector3 targetPos, Vector3 targetEuler)
        {
            float damping = m_DampingFactor;

            float speedFactor = Mathf.Clamp01(m_CurrentSpeed / 5.0f);
            damping = Mathf.Lerp(damping, 0.5f, speedFactor * 0.5f);

            Vector3 finalPos = Vector3.Lerp(transform.position, targetPos, 1.0f - damping);

            Vector3 currentEuler = transform.eulerAngles;
            Vector3 finalEuler = new Vector3(
                Mathf.LerpAngle(currentEuler.x, targetEuler.x, 1.0f - damping),
                Mathf.LerpAngle(currentEuler.y, targetEuler.y, 1.0f - damping),
                Mathf.LerpAngle(currentEuler.z, targetEuler.z, 1.0f - damping));

            transform.position = finalPos;
            transform.rotation = Quaternion.Euler(finalEuler);
        }

        private void OnValidate()
        {
            if (m_IsInitialized && Application.isPlaying)
            {
                FreeDNativeBindings.FreeD_SetFilterEnabled(m_CameraId, m_EnableFilter);
                FreeDNativeBindings.FreeD_SetFilterSmoothing(m_CameraId, m_FilterSmoothing);
            }
        }
    }
}
