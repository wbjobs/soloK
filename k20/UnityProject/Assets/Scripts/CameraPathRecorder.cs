using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace VirtualProduction
{
    public class CameraPathRecorder : MonoBehaviour
    {
        [Header("Recording Settings")]
        [SerializeField] private float m_RecordInterval = 0.033f;
        [SerializeField] private bool m_RecordRotation = true;
        [SerializeField] private bool m_RecordZoom = true;
        [SerializeField] private bool m_RecordFocus = true;

        [Header("Playback Settings")]
        [SerializeField] private bool m_LoopPlayback = false;
        [SerializeField] private float m_PlaybackSpeed = 1.0f;
        [SerializeField] private float m_Smoothness = 0.1f;

        [Header("Source")]
        [SerializeField] private FreeDCameraTracker m_CameraTracker;
        [SerializeField] private Transform m_TargetTransform;

        [Header("UI Status")]
        [SerializeField] private bool m_IsRecording = false;
        [SerializeField] private bool m_IsPlaying = false;
        [SerializeField] private int m_CurrentFrameIndex = 0;
        [SerializeField] private int m_TotalFrames = 0;

        private List<CameraPathFrame> m_PathFrames = new List<CameraPathFrame>();
        private float m_LastRecordTime = 0f;
        private float m_PlaybackTime = 0f;

        public bool IsRecording => m_IsRecording;
        public bool IsPlaying => m_IsPlaying;
        public int FrameCount => m_PathFrames.Count;
        public IReadOnlyList<CameraPathFrame> PathFrames => m_PathFrames;

        [Serializable]
        public class CameraPathFrame
        {
            public float Timestamp;
            public Vector3 Position;
            public Quaternion Rotation;
            public float Zoom;
            public float Focus;
            public float Aperture;
        }

        private void Update()
        {
            if (m_IsRecording)
            {
                UpdateRecording();
            }
            else if (m_IsPlaying)
            {
                UpdatePlayback();
            }
        }

        private void UpdateRecording()
        {
            if (Time.time - m_LastRecordTime >= m_RecordInterval)
            {
                RecordFrame();
                m_LastRecordTime = Time.time;
            }
        }

        private void RecordFrame()
        {
            if (m_TargetTransform == null && m_CameraTracker == null) return;

            var frame = new CameraPathFrame
            {
                Timestamp = Time.time
            };

            if (m_TargetTransform != null)
            {
                frame.Position = m_TargetTransform.position;
                frame.Rotation = m_TargetTransform.rotation;
            }

            if (m_CameraTracker != null)
            {
                var data = m_CameraTracker.LatestData;
                frame.Zoom = (float)data.Zoom;
                frame.Focus = (float)data.Focus;
                frame.Aperture = (float)data.Aperture;
            }

            m_PathFrames.Add(frame);
            m_TotalFrames = m_PathFrames.Count;
        }

        private void UpdatePlayback()
        {
            if (m_PathFrames.Count == 0)
            {
                StopPlayback();
                return;
            }

            m_PlaybackTime += Time.deltaTime * m_PlaybackSpeed;

            float totalDuration = m_PathFrames[m_PathFrames.Count - 1].Timestamp - m_PathFrames[0].Timestamp;

            if (m_LoopPlayback && m_PlaybackTime > totalDuration)
            {
                m_PlaybackTime -= totalDuration;
            }

            float targetTime = m_PlaybackTime + m_PathFrames[0].Timestamp;

            for (int i = 0; i < m_PathFrames.Count - 1; i++)
            {
                if (targetTime >= m_PathFrames[i].Timestamp && targetTime <= m_PathFrames[i + 1].Timestamp)
                {
                    float t = Mathf.InverseLerp(m_PathFrames[i].Timestamp, m_PathFrames[i + 1].Timestamp, targetTime);
                    InterpolateFrame(m_PathFrames[i], m_PathFrames[i + 1], t);
                    m_CurrentFrameIndex = i;
                    break;
                }
            }

            if (!m_LoopPlayback && m_PlaybackTime >= totalDuration)
            {
                StopPlayback();
            }
        }

        private void InterpolateFrame(CameraPathFrame from, CameraPathFrame to, float t)
        {
            if (m_TargetTransform != null)
            {
                m_TargetTransform.position = Vector3.Lerp(from.Position, to.Position, t);
                m_TargetTransform.rotation = Quaternion.Slerp(from.Rotation, to.Rotation, t);
            }
        }

        public void StartRecording()
        {
            m_PathFrames.Clear();
            m_IsRecording = true;
            m_IsPlaying = false;
            m_LastRecordTime = Time.time;
        }

        public void StopRecording()
        {
            m_IsRecording = false;
            m_TotalFrames = m_PathFrames.Count;
        }

        public void StartPlayback()
        {
            if (m_PathFrames.Count == 0) return;

            m_IsRecording = false;
            m_IsPlaying = true;
            m_PlaybackTime = 0f;
            m_CurrentFrameIndex = 0;
        }

        public void StopPlayback()
        {
            m_IsPlaying = false;
        }

        public void SetPlaybackFrame(int index)
        {
            if (index >= 0 && index < m_PathFrames.Count)
            {
                m_CurrentFrameIndex = index;
                m_PlaybackTime = m_PathFrames[index].Timestamp - m_PathFrames[0].Timestamp;

                if (m_TargetTransform != null)
                {
                    m_TargetTransform.position = m_PathFrames[index].Position;
                    m_TargetTransform.rotation = m_PathFrames[index].Rotation;
                }
            }
        }

        public void DeleteFrame(int index)
        {
            if (index >= 0 && index < m_PathFrames.Count)
            {
                m_PathFrames.RemoveAt(index);
                m_TotalFrames = m_PathFrames.Count;
            }
        }

        public void InsertFrame(int index, CameraPathFrame frame)
        {
            if (index >= 0 && index <= m_PathFrames.Count)
            {
                m_PathFrames.Insert(index, frame);
                m_TotalFrames = m_PathFrames.Count;
            }
        }

        public void ClearPath()
        {
            m_PathFrames.Clear();
            m_TotalFrames = 0;
        }

        public void SavePath(string filePath)
        {
            var wrapper = new PathDataWrapper { Frames = m_PathFrames };
            string json = JsonUtility.ToJson(wrapper, true);
            File.WriteAllText(filePath, json);
        }

        public void LoadPath(string filePath)
        {
            if (File.Exists(filePath))
            {
                string json = File.ReadAllText(filePath);
                var wrapper = JsonUtility.FromJson<PathDataWrapper>(json);
                m_PathFrames = wrapper.Frames ?? new List<CameraPathFrame>();
                m_TotalFrames = m_PathFrames.Count;
            }
        }

        [Serializable]
        private class PathDataWrapper
        {
            public List<CameraPathFrame> Frames;
        }

        private void OnDrawGizmos()
        {
            if (m_PathFrames.Count < 2) return;

            Gizmos.color = Color.cyan;
            for (int i = 0; i < m_PathFrames.Count - 1; i++)
            {
                Gizmos.DrawLine(m_PathFrames[i].Position, m_PathFrames[i + 1].Position);
            }

            Gizmos.color = Color.yellow;
            for (int i = 0; i < m_PathFrames.Count; i++)
            {
                Gizmos.DrawSphere(m_PathFrames[i].Position, 0.05f);
            }

            if (m_IsPlaying && m_CurrentFrameIndex >= 0 && m_CurrentFrameIndex < m_PathFrames.Count)
            {
                Gizmos.color = Color.red;
                Gizmos.DrawSphere(m_PathFrames[m_CurrentFrameIndex].Position, 0.1f);
            }
        }
    }
}
