using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public class CableRenderer
    {
        private GameObject cableRoot;
        private List<GameObject> cableObjects = new List<GameObject>();
        private List<GameObject> interferenceMarkers = new List<GameObject>();
        private GameObject interferenceRoot;
        private bool showInterferenceMarkers = true;

        public bool ShowInterferenceMarkers
        {
            get => showInterferenceMarkers;
            set
            {
                showInterferenceMarkers = value;
                if (interferenceRoot != null)
                    interferenceRoot.SetActive(value);
            }
        }

        public CableRenderer()
        {
            cableRoot = new GameObject("CableRenderers");
            Object.DontDestroyOnLoad(cableRoot);

            interferenceRoot = new GameObject("InterferenceMarkers");
            interferenceRoot.transform.SetParent(cableRoot.transform);
        }

        public void UpdateCableRenderers(CableSystem cableSystem, List<RiggingPoint> riggingPoints)
        {
            if (cableSystem == null || cableSystem.Cables == null) return;

            EnsureCableObjects(cableSystem.Cables.Count);

            for (int i = 0; i < cableSystem.Cables.Count && i < cableObjects.Count; i++)
            {
                Cable cable = cableSystem.Cables[i];
                GameObject cableObj = cableObjects[i];
                LineRenderer lr = cableObj.GetComponent<LineRenderer>();

                if (lr == null)
                {
                    lr = cableObj.AddComponent<LineRenderer>();
                    ConfigureLineRenderer(lr, cable.riggingPoint);
                }

                Vector3[] positions = cableSystem.GetCablePositions(i);
                if (positions.Length > 0)
                {
                    lr.positionCount = positions.Length;
                    lr.SetPositions(positions);

                    if (cable.riggingPoint != null)
                    {
                        float tensionKg = cable.riggingPoint.tension / 9.81f;
                        float maxTension = 500f;
                        float ratio = Mathf.Clamp01(tensionKg / maxTension);

                        Color cableColor = Color.Lerp(Color.green, Color.red, ratio);
                        if (cable.riggingPoint.state == CableState.Slack)
                            cableColor = Color.gray;

                        lr.startColor = cableColor;
                        lr.endColor = cableColor;
                    }
                }
            }

            for (int i = cableSystem.Cables.Count; i < cableObjects.Count; i++)
            {
                if (cableObjects[i] != null)
                    cableObjects[i].SetActive(false);
            }
        }

        private void EnsureCableObjects(int count)
        {
            while (cableObjects.Count < count)
            {
                GameObject cableObj = new GameObject($"Cable_{cableObjects.Count}");
                cableObj.transform.SetParent(cableRoot.transform);
                LineRenderer lr = cableObj.AddComponent<LineRenderer>();
                ConfigureLineRenderer(lr, null);
                cableObjects.Add(cableObj);
            }

            for (int i = 0; i < cableObjects.Count; i++)
            {
                if (cableObjects[i] != null)
                    cableObjects[i].SetActive(i < count);
            }
        }

        private void ConfigureLineRenderer(LineRenderer lr, RiggingPoint rp)
        {
            lr.material = new Material(Shader.Find("Standard"));
            lr.widthMultiplier = 0.03f;
            lr.positionCount = 0;
            lr.useWorldSpace = true;
            lr.numCapVertices = 2;
            lr.numCornerVertices = 2;

            if (lr.material != null)
            {
                lr.material.color = Color.green;
                lr.material.SetFloat("_Glossiness", 0.3f);
            }
        }

        public void Clear()
        {
            foreach (var obj in cableObjects)
            {
                if (obj != null) Object.Destroy(obj);
            }
            cableObjects.Clear();
        }

        public int CableCount => cableObjects.Count;

        public void UpdateInterferenceMarkers(List<CableInterferenceResult> interferences)
        {
            if (!showInterferenceMarkers || interferenceRoot == null) return;

            if (interferences == null || interferences.Count == 0)
            {
                foreach (var marker in interferenceMarkers)
                {
                    if (marker != null) marker.SetActive(false);
                }
                return;
            }

            while (interferenceMarkers.Count < interferences.Count)
            {
                GameObject marker = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                Object.Destroy(marker.GetComponent<Collider>());
                marker.transform.SetParent(interferenceRoot.transform);
                marker.name = "InterferenceMarker";

                Renderer renderer = marker.GetComponent<Renderer>();
                if (renderer != null)
                {
                    renderer.material = new Material(Shader.Find("Standard"));
                    renderer.material.SetFloat("_Glossiness", 0.1f);
                }

                interferenceMarkers.Add(marker);
            }

            for (int i = 0; i < interferences.Count; i++)
            {
                if (i >= interferenceMarkers.Count) break;

                CableInterferenceResult result = interferences[i];
                GameObject marker = interferenceMarkers[i];
                marker.SetActive(true);

                Vector3 midPoint = (result.closestPointA + result.closestPointB) * 0.5f;
                marker.transform.position = midPoint;

                float size = Mathf.Lerp(0.05f, 0.2f, result.riskFactor);
                marker.transform.localScale = Vector3.one * size;

                Renderer renderer = marker.GetComponent<Renderer>();
                if (renderer != null)
                {
                    Color color = result.isCritical ? Color.red :
                                  result.isHighRisk ? Color.yellow : Color.green;
                    renderer.material.color = color;
                    renderer.material.SetFloat("_Emission", result.isCritical ? 1f : 0f);
                }
            }

            for (int i = interferences.Count; i < interferenceMarkers.Count; i++)
            {
                if (interferenceMarkers[i] != null)
                    interferenceMarkers[i].SetActive(false);
            }
        }
    }
}