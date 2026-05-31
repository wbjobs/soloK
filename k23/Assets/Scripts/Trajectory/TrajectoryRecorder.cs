using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public class TrajectoryRecorder
    {
        private List<TrajectoryKeyframe> recordedTrajectory;
        private float recordInterval;
        private float recordTimer;
        private float currentTime;

        public int FrameCount => recordedTrajectory?.Count ?? 0;
        public float Duration => recordedTrajectory.Count > 0
            ? recordedTrajectory[recordedTrajectory.Count - 1].time
            : 0f;

        public TrajectoryRecorder(List<TrajectoryKeyframe> trajectory, float interval)
        {
            recordedTrajectory = trajectory;
            recordInterval = interval;
            recordTimer = 0f;
            currentTime = 0f;
        }

        public void Reset()
        {
            recordedTrajectory.Clear();
            recordTimer = 0f;
            currentTime = 0f;
        }

        public void RecordFrame(float dt, ActorState actor, List<RiggingPoint> riggingPoints)
        {
            currentTime += dt;
            recordTimer += dt;

            if (recordTimer >= recordInterval)
            {
                recordTimer = 0f;

                float[] lengths = new float[riggingPoints.Count];
                for (int i = 0; i < riggingPoints.Count; i++)
                    lengths[i] = riggingPoints[i].currentCableLength;

                TrajectoryKeyframe keyframe = new TrajectoryKeyframe(
                    currentTime, actor.position, actor.rotation, lengths);
                recordedTrajectory.Add(keyframe);
            }
        }

        public TrajectoryKeyframe? GetKeyframeAtTime(float time)
        {
            if (recordedTrajectory.Count < 2) return null;

            TrajectoryKeyframe prev = recordedTrajectory[0];
            TrajectoryKeyframe next = recordedTrajectory[recordedTrajectory.Count - 1];

            for (int i = 0; i < recordedTrajectory.Count - 1; i++)
            {
                if (recordedTrajectory[i].time <= time && recordedTrajectory[i + 1].time >= time)
                {
                    prev = recordedTrajectory[i];
                    next = recordedTrajectory[i + 1];
                    break;
                }
            }

            float t = Mathf.InverseLerp(prev.time, next.time, time);
            float[] interpLengths = new float[Mathf.Max(prev.cableLengths.Length, next.cableLengths.Length)];
            for (int i = 0; i < interpLengths.Length; i++)
            {
                float pLen = i < prev.cableLengths.Length ? prev.cableLengths[i] : 0f;
                float nLen = i < next.cableLengths.Length ? next.cableLengths[i] : 0f;
                interpLengths[i] = Mathf.Lerp(pLen, nLen, t);
            }

            return new TrajectoryKeyframe(
                time,
                Vector3.Lerp(prev.position, next.position, t),
                Quaternion.Slerp(prev.rotation, next.rotation, t),
                interpLengths
            );
        }

        public void ApplyOffset(Vector3 offset)
        {
            for (int i = 0; i < recordedTrajectory.Count; i++)
            {
                TrajectoryKeyframe kf = recordedTrajectory[i];
                kf.position += offset;
                recordedTrajectory[i] = kf;
            }
        }

        public List<TrajectoryKeyframe> GetTrajectory()
        {
            return recordedTrajectory;
        }

        public void SaveToJson(string filePath)
        {
            TrajectoryData data = new TrajectoryData
            {
                keyframes = recordedTrajectory.ToArray()
            };
            string json = JsonUtility.ToJson(data, true);
            System.IO.File.WriteAllText(filePath, json);
        }

        public void LoadFromJson(string filePath)
        {
            if (System.IO.File.Exists(filePath))
            {
                string json = System.IO.File.ReadAllText(filePath);
                TrajectoryData data = JsonUtility.FromJson<TrajectoryData>(json);
                if (data != null && data.keyframes != null)
                {
                    recordedTrajectory.Clear();
                    recordedTrajectory.AddRange(data.keyframes);
                }
            }
        }

        [System.Serializable]
        private class TrajectoryData
        {
            public TrajectoryKeyframe[] keyframes;
        }
    }
}