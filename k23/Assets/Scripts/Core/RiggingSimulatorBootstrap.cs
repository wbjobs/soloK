using UnityEngine;

namespace TheaterRigging
{
    public class RiggingSimulatorBootstrap : MonoBehaviour
    {
        [Header("舞台设置")]
        public bool buildStageOnStart = true;

        [Header("吊点设置")]
        public Vector3[] defaultRiggingPoints = new Vector3[]
        {
            new Vector3(-3f, 8f, 0f),
            new Vector3(3f, 8f, 0f),
            new Vector3(0f, 9f, -2f)
        };

        [Header("贝塞尔曲线预设")]
        public Vector3[] bezierControlPoints = new Vector3[]
        {
            new Vector3(0f, 3f, 0f),
            new Vector3(-5f, 5f, 2f),
            new Vector3(5f, 5f, -2f),
            new Vector3(0f, 3f, 0f)
        };

        [Header("演员参数")]
        public float actorMass = 70f;
        public Vector3 actorInertia = new Vector3(2f, 2f, 2f);
        public Vector3 actorStartPosition = new Vector3(0f, 3f, 0f);

        private void Start()
        {
            InitializeSimulation();
        }

        private void InitializeSimulation()
        {
            if (buildStageOnStart && StageSceneBuilder.Instance != null)
            {
                StageSceneBuilder.Instance.BuildStage();
            }

            if (SimulationManager.Instance == null)
            {
                GameObject simManagerObj = new GameObject("SimulationManager");
                simManagerObj.AddComponent<SimulationManager>();
            }

            SimulationManager sim = SimulationManager.Instance;
            if (sim == null) return;

            sim.actor.mass = actorMass;
            sim.actor.inertiaTensor = actorInertia;
            sim.actor.position = actorStartPosition;

            foreach (var point in defaultRiggingPoints)
            {
                sim.AddRiggingPoint(point);
            }

            sim.LoadBezierCurve(bezierControlPoints);

            sim.Initialize();

            Debug.Log("剧场飞行器吊挂系统仿真器已启动");
            Debug.Log("控制说明:");
            Debug.Log("  播放/P键: 开始仿真");
            Debug.Log("  暂停/Edit: 编辑模式");
            Debug.Log("  录制/R键: 录制轨迹");
            Debug.Log("  回放: 回放录制的轨迹");
            Debug.Log("  1/2键 + 上下方向键: 控制各吊点绳长");
            Debug.Log("  鼠标滚轮: 控制吊点1绳长");
        }

        private void Update()
        {
            HandleInput();
        }

        private void HandleInput()
        {
            if (SimulationManager.Instance == null) return;

            if (Input.GetKeyDown(KeyCode.P))
            {
                SimulationManager.Instance.SetMode(SimulationMode.Play);
            }
            if (Input.GetKeyDown(KeyCode.E))
            {
                SimulationManager.Instance.SetMode(SimulationMode.Edit);
            }
            if (Input.GetKeyDown(KeyCode.R))
            {
                SimulationManager.Instance.SetMode(SimulationMode.Record);
            }
            if (Input.GetKeyDown(KeyCode.L))
            {
                SimulationManager.Instance.SetMode(SimulationMode.Replay);
            }
        }
    }
}