using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace TheaterRigging
{
    public class UIController : MonoBehaviour
    {
        public static UIController Instance { get; private set; }

        [Header("UI面板")]
        public GameObject mainPanel;
        public GameObject infoPanel;
        public GameObject tensionGraphPanel;
        public GameObject warningPanel;

        [Header("文本显示")]
        public Text positionText;
        public Text velocityText;
        public Text accelerationText;
        public Text tensionText;
        public Text safetyText;
        public Text modeText;

        [Header("张力图表")]
        public RectTransform graphContainer;
        public RectTransform graphLine;
        public RectTransform thresholdLine;
        public float graphWidth = 400f;
        public float graphHeight = 150f;

        [Header("吊点状态UI")]
        public GameObject[] riggingPointIndicators;

        [Header("按钮")]
        public Button playButton;
        public Button pauseButton;
        public Button recordButton;
        public Button replayButton;
        public Button stopButton;

        private List<Vector2> graphPoints = new List<Vector2>();

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        private void Start()
        {
            InitializeButtons();
        }

        private void InitializeButtons()
        {
            if (playButton != null)
                playButton.onClick.AddListener(OnPlayClicked);
            if (pauseButton != null)
                pauseButton.onClick.AddListener(OnPauseClicked);
            if (recordButton != null)
                recordButton.onClick.AddListener(OnRecordClicked);
            if (replayButton != null)
                replayButton.onClick.AddListener(OnReplayClicked);
            if (stopButton != null)
                stopButton.onClick.AddListener(OnStopClicked);
        }

        private void Update()
        {
            UpdateUI();
        }

        private void UpdateUI()
        {
            if (SimulationManager.Instance == null) return;

            ActorState actor = SimulationManager.Instance.actor;
            List<RiggingPoint> riggingPoints = SimulationManager.Instance.riggingPoints;
            SafetyReport safety = SimulationManager.Instance.safetyReport;

            if (positionText != null)
                positionText.text = $"位置: ({actor.position.x:F2}, {actor.position.y:F2}, {actor.position.z:F2})";

            if (velocityText != null)
                velocityText.text = $"速度: {actor.velocity.magnitude:F2} m/s";

            if (accelerationText != null)
                accelerationText.text = $"加速度: {actor.acceleration.magnitude:F2} m/s²";

            string tensionStr = "张力: ";
            for (int i = 0; i < riggingPoints.Count; i++)
            {
                float tensionKg = riggingPoints[i].tension / 9.81f;
                tensionStr += $"[{i + 1}] {tensionKg:F1}kg ";
            }
            if (tensionText != null) tensionText.text = tensionStr;

            if (safetyText != null)
            {
                string safetyStr = safety.isSafe ? "✓ 安全" : "⚠ 警告";
                safetyStr += $" | 动载系数: {safety.dynamicLoadFactor:F2}";
                if (!string.IsNullOrEmpty(safety.warningMessage))
                    safetyStr += $"\n{security.warningMessage}";
                safetyText.text = safetyStr;
            }

            if (modeText != null)
                modeText.text = $"模式: {SimulationManager.Instance.mode}";

            UpdateTensionGraph();
            UpdateRiggingPointIndicators();
            UpdateWarningPanel(safety);
        }

        private void UpdateTensionGraph()
        {
            if (SimulationManager.Instance == null || graphContainer == null) return;

            List<float> history = SimulationManager.Instance.tensionHistory;
            if (history.Count < 2) return;

            float maxTension = SimulationManager.Instance.maxTensionKg;

            graphPoints.Clear();
            for (int i = 0; i < history.Count; i++)
            {
                float x = (float)i / (history.Count - 1) * graphWidth;
                float y = Mathf.Clamp(history[i] / maxTension, 0f, 1.2f) * graphHeight;
                graphPoints.Add(new Vector2(x, y));
            }

            if (graphLine != null)
            {
                LineRenderer lr = graphLine.GetComponent<LineRenderer>();
                if (lr == null) lr = graphLine.gameObject.AddComponent<LineRenderer>();

                lr.positionCount = graphPoints.Count;
                for (int i = 0; i < graphPoints.Count; i++)
                {
                    Vector3 worldPos = graphContainer.TransformPoint(
                        new Vector3(graphPoints[i].x - graphWidth / 2, graphPoints[i].y - graphHeight / 2, 0));
                    lr.SetPosition(i, worldPos);
                }
                lr.startWidth = 0.02f;
                lr.endWidth = 0.02f;
                lr.material = new Material(Shader.Find("Standard"));
                lr.material.color = Color.cyan;
            }

            if (thresholdLine != null)
            {
                LineRenderer tlr = thresholdLine.GetComponent<LineRenderer>();
                if (tlr == null) tlr = thresholdLine.gameObject.AddComponent<LineRenderer>();

                Vector3 startPos = graphContainer.TransformPoint(
                    new Vector3(-graphWidth / 2, graphHeight / 2 - graphHeight, 0));
                Vector3 endPos = graphContainer.TransformPoint(
                    new Vector3(graphWidth / 2, graphHeight / 2 - graphHeight, 0));

                tlr.positionCount = 2;
                tlr.SetPosition(0, startPos);
                tlr.SetPosition(1, endPos);
                tlr.startWidth = 0.01f;
                tlr.endWidth = 0.01f;
                tlr.material = new Material(Shader.Find("Standard"));
                tlr.material.color = Color.red;
            }
        }

        private void UpdateRiggingPointIndicators()
        {
            if (SimulationManager.Instance == null || riggingPointIndicators == null) return;

            List<RiggingPoint> riggingPoints = SimulationManager.Instance.riggingPoints;

            for (int i = 0; i < riggingPointIndicators.Length; i++)
            {
                if (riggingPointIndicators[i] == null) continue;

                if (i < riggingPoints.Count && riggingPoints[i].isEnabled)
                {
                    riggingPointIndicators[i].SetActive(true);
                    Image img = riggingPointIndicators[i].GetComponent<Image>();
                    if (img != null)
                    {
                        img.color = riggingPoints[i].state == CableState.Overloaded
                            ? Color.red : Color.green;
                    }
                }
                else
                {
                    riggingPointIndicators[i].SetActive(false);
                }
            }
        }

        private void UpdateWarningPanel(SafetyReport safety)
        {
            if (warningPanel == null) return;

            warningPanel.SetActive(!safety.isSafe);
        }

        private void OnPlayClicked()
        {
            if (SimulationManager.Instance != null)
                SimulationManager.Instance.SetMode(SimulationMode.Play);
        }

        private void OnPauseClicked()
        {
            if (SimulationManager.Instance != null)
                SimulationManager.Instance.SetMode(SimulationMode.Edit);
        }

        private void OnRecordClicked()
        {
            if (SimulationManager.Instance != null)
                SimulationManager.Instance.SetMode(SimulationMode.Record);
        }

        private void OnReplayClicked()
        {
            if (SimulationManager.Instance != null)
                SimulationManager.Instance.SetMode(SimulationMode.Replay);
        }

        private void OnStopClicked()
        {
            if (SimulationManager.Instance != null)
                SimulationManager.Instance.SetMode(SimulationMode.Edit);
        }
    }
}