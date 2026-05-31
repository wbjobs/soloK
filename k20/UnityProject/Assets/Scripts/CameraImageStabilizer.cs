using System.Collections.Generic;
using UnityEngine;

namespace VirtualProduction
{
    public class CameraImageStabilizer : MonoBehaviour
    {
        [Header("Stabilization Settings")]
        [SerializeField] private bool m_EnableStabilization = true;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_Smoothing = 0.5f;
        [SerializeField] [Range(0.0f, 1.0f)] private float m_RotationSmoothing = 0.5f;
        [SerializeField] private float m_MaxPositionCorrection = 0.1f;
        [SerializeField] private float m_MaxRotationCorrection = 5.0f;

        [Header("Filter Settings")]
        [SerializeField] private int m_PositionWindowSize = 5;
        [SerializeField] private int m_RotationWindowSize = 5;
        [SerializeField] private FilterMode m_PositionFilterMode = FilterMode.MovingAverage;
        [SerializeField] private FilterMode m_RotationFilterMode = FilterMode.MovingAverage;

        [Header("Source")]
        [SerializeField] private Transform m_SourceTransform;
        [SerializeField] private FreeDCameraTracker m_CameraTracker;

        [Header("Status")]
        [SerializeField] private Vector3 m_StabilizedPosition;
        [SerializeField] private Quaternion m_StabilizedRotation;
        [SerializeField] private Vector3 m_CurrentJitter;

        private Queue<Vector3> m_PositionHistory = new Queue<Vector3>();
        private Queue<Quaternion> m_RotationHistory = new Queue<Quaternion>();
        private Vector3 m_SmoothedVelocity;
        private Vector3 m_TargetPosition;
        private Quaternion m_TargetRotation;

        public enum FilterMode
        {
            LowPass,
            MovingAverage,
            Exponential
        }

        public bool EnableStabilization
        {
            get => m_EnableStabilization;
            set => m_EnableStabilization = value;
        }

        public Vector3 StabilizedPosition => m_StabilizedPosition;
        public Quaternion StabilizedRotation => m_StabilizedRotation;
        public Vector3 CurrentJitter => m_CurrentJitter;

        private void OnEnable()
        {
            Initialize();
        }

        private void Initialize()
        {
            if (m_SourceTransform == null)
            {
                m_SourceTransform = transform;
            }

            m_TargetPosition = m_SourceTransform.position;
            m_TargetRotation = m_SourceTransform.rotation;
            m_StabilizedPosition = m_TargetPosition;
            m_StabilizedRotation = m_TargetRotation;

            m_PositionHistory.Clear();
            m_RotationHistory.Clear();
        }

        private void LateUpdate()
        {
            if (!m_EnableStabilization)
            {
                if (m_SourceTransform != null)
                {
                    m_StabilizedPosition = m_SourceTransform.position;
                    m_StabilizedRotation = m_SourceTransform.rotation;
                    transform.SetPositionAndRotation(m_StabilizedPosition, m_StabilizedRotation);
                }
                return;
            }

            UpdateStabilization();
        }

        private void UpdateStabilization()
        {
            if (m_SourceTransform == null) return;

            Vector3 rawPosition = m_SourceTransform.position;
            Quaternion rawRotation = m_SourceTransform.rotation;

            switch (m_PositionFilterMode)
            {
                case FilterMode.LowPass:
                    m_TargetPosition = LowPassFilterPosition(rawPosition);
                    break;
                case FilterMode.MovingAverage:
                    m_TargetPosition = MovingAveragePosition(rawPosition);
                    break;
                case FilterMode.Exponential:
                    m_TargetPosition = ExponentialFilterPosition(rawPosition);
                    break;
            }

            switch (m_RotationFilterMode)
            {
                case FilterMode.LowPass:
                    m_TargetRotation = LowPassFilterRotation(rawRotation);
                    break;
                case FilterMode.MovingAverage:
                    m_TargetRotation = MovingAverageRotation(rawRotation);
                    break;
                case FilterMode.Exponential:
                    m_TargetRotation = ExponentialFilterRotation(rawRotation);
                    break;
            }

            Vector3 positionDelta = m_TargetPosition - m_StabilizedPosition;
            positionDelta = Vector3.ClampMagnitude(positionDelta, m_MaxPositionCorrection);

            Quaternion rotationDelta = m_TargetRotation * Quaternion.Inverse(m_StabilizedRotation);
            float angleDelta;
            Vector3 axisDelta;
            rotationDelta.ToAngleAxis(out angleDelta, out axisDelta);
            angleDelta = Mathf.Clamp(angleDelta, 0, m_MaxRotationCorrection);
            rotationDelta = Quaternion.AngleAxis(angleDelta, axisDelta);

            m_StabilizedPosition = Vector3.Lerp(m_StabilizedPosition, m_StabilizedPosition + positionDelta, 1 - m_Smoothing);
            m_StabilizedRotation = Quaternion.Slerp(m_StabilizedRotation, rotationDelta * m_StabilizedRotation, 1 - m_RotationSmoothing);

            m_CurrentJitter = rawPosition - m_StabilizedPosition;

            transform.SetPositionAndRotation(m_StabilizedPosition, m_StabilizedRotation);
        }

        private Vector3 LowPassFilterPosition(Vector3 input)
        {
            return Vector3.Lerp(m_TargetPosition, input, 1 - m_Smoothing);
        }

        private Quaternion LowPassFilterRotation(Quaternion input)
        {
            return Quaternion.Slerp(m_TargetRotation, input, 1 - m_RotationSmoothing);
        }

        private Vector3 MovingAveragePosition(Vector3 input)
        {
            m_PositionHistory.Enqueue(input);
            while (m_PositionHistory.Count > m_PositionWindowSize)
            {
                m_PositionHistory.Dequeue();
            }

            Vector3 sum = Vector3.zero;
            foreach (var pos in m_PositionHistory)
            {
                sum += pos;
            }
            return sum / m_PositionHistory.Count;
        }

        private Quaternion MovingAverageRotation(Quaternion input)
        {
            m_RotationHistory.Enqueue(input);
            while (m_RotationHistory.Count > m_RotationWindowSize)
            {
                m_RotationHistory.Dequeue();
            }

            Quaternion[] rotations = m_RotationHistory.ToArray();
            return AverageQuaternion(rotations);
        }

        private Quaternion AverageQuaternion(Quaternion[] rotations)
        {
            if (rotations.Length == 0) return Quaternion.identity;

            Quaternion result = rotations[0];
            for (int i = 1; i < rotations.Length; i++)
            {
                result = Quaternion.Slerp(result, rotations[i], 1.0f / (i + 1));
            }
            return result;
        }

        private Vector3 ExponentialFilterPosition(Vector3 input)
        {
            return Vector3.Lerp(m_TargetPosition, input, m_Smoothing);
        }

        private Quaternion ExponentialFilterRotation(Quaternion input)
        {
            return Quaternion.Slerp(m_TargetRotation, input, m_RotationSmoothing);
        }

        public void ResetStabilization()
        {
            Initialize();
        }

        public void SetSource(Transform source)
        {
            m_SourceTransform = source;
            Initialize();
        }
    }
}
