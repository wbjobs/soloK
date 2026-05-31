using System;
using System.Collections.Generic;
using UnityEngine;

namespace VirtualProduction
{
    public class CameraCalibrationTool : MonoBehaviour
    {
        [Header("Calibration Settings")]
        [SerializeField] private int m_ChessboardRows = 6;
        [SerializeField] private int m_ChessboardCols = 9;
        [SerializeField] private float m_SquareSize = 0.025f;
        [SerializeField] private int m_RequiredSamples = 20;

        [Header("Camera Settings")]
        [SerializeField] private Camera m_TargetCamera;
        [SerializeField] private FreeDCameraTracker m_CameraTracker;

        [Header("Marker Detection")]
        [SerializeField] private Texture m_CalibrationImage;
        [SerializeField] private List<Vector2> m_DetectedCorners = new List<Vector2>();

        [Header("Distortion Parameters")]
        [SerializeField] private float[] m_DistortionCoefficients = new float[5];
        [SerializeField] private Vector2 m_FocalLength = new Vector2(1000, 1000);
        [SerializeField] private Vector2 m_PrincipalPoint = new Vector2(0.5f, 0.5f);

        [Header("Auto Calibration")]
        [SerializeField] private bool m_UseAutoMarkers = false;
        [SerializeField] private List<Transform> m_ReferenceMarkers = new List<Transform>();

        private List<CalibrationSample> m_CalibrationSamples = new List<CalibrationSample>();
        private bool m_IsCalibrating = false;

        public bool IsCalibrating => m_IsCalibrating;
        public int SampleCount => m_CalibrationSamples.Count;
        public float[] DistortionCoefficients => m_DistortionCoefficients;

        [Serializable]
        private class CalibrationSample
        {
            public List<Vector2> ImagePoints;
            public List<Vector3> ObjectPoints;
            public Matrix4x4 CameraPose;

            public CalibrationSample()
            {
                ImagePoints = new List<Vector2>();
                ObjectPoints = new List<Vector3>();
            }
        }

        public void StartCalibration()
        {
            m_CalibrationSamples.Clear();
            m_IsCalibrating = true;
        }

        public void CaptureSample()
        {
            if (!m_IsCalibrating) return;

            var sample = new CalibrationSample();
            GenerateChessboardObjectPoints(sample.ObjectPoints);

            if (m_DetectedCorners.Count >= m_ChessboardRows * m_ChessboardCols)
            {
                sample.ImagePoints.AddRange(m_DetectedCorners);
                m_CalibrationSamples.Add(sample);
            }
        }

        private void GenerateChessboardObjectPoints(List<Vector3> points)
        {
            points.Clear();
            for (int i = 0; i < m_ChessboardRows; i++)
            {
                for (int j = 0; j < m_ChessboardCols; j++)
                {
                    points.Add(new Vector3(
                        j * m_SquareSize,
                        i * m_SquareSize,
                        0f
                    ));
                }
            }
        }

        public void RunCalibration()
        {
            if (m_CalibrationSamples.Count < m_RequiredSamples)
            {
                Debug.LogWarning($"需要至少 {m_RequiredSamples} 个样本进行校准");
                return;
            }

            EstimateIntrinsicParameters();
            m_IsCalibrating = false;
        }

        private void EstimateIntrinsicParameters()
        {
            if (m_TargetCamera == null) return;

            float width = m_TargetCamera.pixelWidth;
            float height = m_TargetCamera.pixelHeight;

            float fov = m_TargetCamera.fieldOfView * Mathf.Deg2Rad;
            float fy = height / (2.0f * Mathf.Tan(fov / 2.0f));
            float fx = fy * (width / height);

            m_FocalLength = new Vector2(fx, fy);
            m_PrincipalPoint = new Vector2(width / 2.0f, height / 2.0f);

            m_DistortionCoefficients[0] = 0f;
            m_DistortionCoefficients[1] = 0f;
            m_DistortionCoefficients[2] = 0f;
            m_DistortionCoefficients[3] = 0f;
            m_DistortionCoefficients[4] = 0f;

            Debug.Log("相机校准完成");
            Debug.Log($"焦距: {m_FocalLength}");
            Debug.Log($"主点: {m_PrincipalPoint}");
        }

        public Vector2 UndistortPoint(Vector2 point)
        {
            if (m_TargetCamera == null) return point;

            float cx = m_PrincipalPoint.x;
            float cy = m_PrincipalPoint.y;
            float fx = m_FocalLength.x;
            float fy = m_FocalLength.y;

            float x = (point.x - cx) / fx;
            float y = (point.y - cy) / fy;

            float r2 = x * x + y * y;
            float r4 = r2 * r2;
            float r6 = r4 * r2;

            float k1 = m_DistortionCoefficients[0];
            float k2 = m_DistortionCoefficients[1];
            float p1 = m_DistortionCoefficients[2];
            float p2 = m_DistortionCoefficients[3];
            float k3 = m_DistortionCoefficients[4];

            float radialDistortion = 1 + k1 * r2 + k2 * r4 + k3 * r6;
            float xDistorted = x * radialDistortion + 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
            float yDistorted = y * radialDistortion + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;

            return new Vector2(xDistorted * fx + cx, yDistorted * fy + cy);
        }

        public void ApplyCalibrationToCamera()
        {
            if (m_TargetCamera == null) return;

            float fx = m_FocalLength.x;
            float fy = m_FocalLength.y;
            float width = m_TargetCamera.pixelWidth;

            float fov = 2.0f * Mathf.Atan(width / (2.0f * fx)) * Mathf.Rad2Deg;
            m_TargetCamera.fieldOfView = fov;
        }

        public void SaveCalibration(string path)
        {
            var data = new CalibrationData
            {
                FocalLength = m_FocalLength,
                PrincipalPoint = m_PrincipalPoint,
                DistortionCoefficients = m_DistortionCoefficients
            };

            string json = JsonUtility.ToJson(data, true);
            System.IO.File.WriteAllText(path, json);
        }

        public void LoadCalibration(string path)
        {
            if (System.IO.File.Exists(path))
            {
                string json = System.IO.File.ReadAllText(path);
                var data = JsonUtility.FromJson<CalibrationData>(json);

                m_FocalLength = data.FocalLength;
                m_PrincipalPoint = data.PrincipalPoint;
                m_DistortionCoefficients = data.DistortionCoefficients;
            }
        }

        [Serializable]
        private class CalibrationData
        {
            public Vector2 FocalLength;
            public Vector2 PrincipalPoint;
            public float[] DistortionCoefficients;
        }
    }
}
