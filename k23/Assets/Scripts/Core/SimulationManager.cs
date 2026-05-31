using System.Collections.Generic;
using UnityEngine;

namespace TheaterRigging
{
    public class SimulationManager : MonoBehaviour
    {
        public static SimulationManager Instance { get; private set; }

        [Header("仿真配置")]
        public SimulationMode mode = SimulationMode.Edit;
        public InputMode inputMode = InputMode.PresetPath;
        [Range(0.0005f, 0.02f)] public float timeStep = 0.008f;
        [Range(1, 10)] public int solverIterations = 4;
        public bool autoStart = false;

        [Header("重力参数")]
        public Vector3 gravity = new Vector3(0f, -9.81f, 0f);

        [Header("钢丝绳参数")]
        public float cableStiffness = 50000f;
        public float cableDamping = 500f;
        public float cableSegmentLength = 0.3f;
        public float cableMassPerSegment = 0.5f;
        public int maxCableSegments = 30;

        [Header("演员参数")]
        public ActorState actor = new ActorState();
        public Vector3 actorAttachOffset = new Vector3(0f, 0.3f, 0f);

        [Header("吊点系统")]
        public List<RiggingPoint> riggingPoints = new List<RiggingPoint>();
        public int maxRiggingPoints = 8;

        [Header("张力阈值")]
        public float maxTensionKg = 500f;
        public float safetyFactor = 3.0f;

        [Header("碰撞检测")]
        public List<CollisionBox> collisionBoxes = new List<CollisionBox>();
        public float collisionWarningDistance = 0.5f;

        [Header("编舞录制")]
        public List<TrajectoryKeyframe> recordedTrajectory = new List<TrajectoryKeyframe>();
        public float recordInterval = 0.05f;
        private float recordTimer = 0f;

        [Header("回放设置")]
        public float replayTime = 0f;
        public bool loopReplay = true;
        public Vector3 replayOffset = Vector3.zero;
        [Range(0.5f, 2f)] public float replaySpeed = 1f;

        [Header("状态监测")]
        public SafetyReport safetyReport = new SafetyReport();
        public List<float> tensionHistory = new List<float>();
        public int maxHistorySamples = 600;

        [Header("高级设置")]
        public bool enableCCD = true;
        public float ccdVelocityThreshold = 5f;
        public bool autoRecoverFromInstability = true;
        public Bounds sceneBounds = new Bounds(Vector3.zero, new Vector3(50f, 50f, 50f));

        [Header("钢丝绳干涉检测")]
        public bool enableInterferenceDetection = true;
        public float interferenceWarningDistance = 0.1f;
        public float interferenceCriticalDistance = 0.05f;
        public bool autoUnwind = true;

        [Header("风载扰动")]
        public bool enableWindLoad = false;
        public WindConfig windConfig = new WindConfig();

        private VerletPhysicsEngine physicsEngine;
        private CableSystem cableSystem;
        private TrajectoryController trajectoryController;
        private CollisionDetector collisionDetector;
        private SafetyMonitor safetyMonitor;
        private CableRenderer cableRenderer;
        private VectorArrowRenderer arrowRenderer;
        private TrajectoryRecorder trajectoryRecorder;
        private CableInterferenceDetector interferenceDetector;
        private WindLoadModule windModule;

        private bool isInitialized = false;
        private float simulationTime = 0f;
        private CCDResult lastCollisionResult;

        public CCDResult LastCollision => lastCollisionResult;
        public int CurrentSubStepCount => physicsEngine?.SubStepCount ?? 0;
        public bool IsSystemStable => physicsEngine?.IsStable ?? true;
        public CableInterferenceDetector InterferenceDetector => interferenceDetector;
        public WindLoadModule WindModule => windModule;
        public List<CableInterferenceResult> LastInterferenceResults => interferenceDetector?.LastResults;
        public List<UnwindingAction> RecommendedUnwindingActions { get; private set; } = new List<UnwindingAction>();

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
            Initialize();
            if (autoStart) mode = SimulationMode.Play;
        }

        public void Initialize()
        {
            if (isInitialized) return;

            physicsEngine = new VerletPhysicsEngine(gravity, timeStep, solverIterations);
            physicsEngine.SetSceneBounds(sceneBounds);

            cableSystem = new CableSystem(cableStiffness, cableDamping, cableSegmentLength,
                                          cableMassPerSegment, maxCableSegments);
            trajectoryController = new TrajectoryController();
            collisionDetector = new CollisionDetector(collisionBoxes);
            collisionDetector.CCDEnabled = enableCCD;

            safetyMonitor = new SafetyMonitor(maxTensionKg, safetyFactor);
            cableRenderer = new CableRenderer();
            arrowRenderer = new VectorArrowRenderer();
            trajectoryRecorder = new TrajectoryRecorder(recordedTrajectory, recordInterval);

            interferenceDetector = new CableInterferenceDetector();
            interferenceDetector.WarningThreshold = interferenceWarningDistance;
            interferenceDetector.CriticalThreshold = interferenceCriticalDistance;

            windModule = new WindLoadModule(windConfig);

            actor.ccdThreshold = ccdVelocityThreshold;
            actor.useCCD = enableCCD;

            if (riggingPoints.Count == 0)
            {
                riggingPoints.Add(new RiggingPoint(0, new Vector3(-3f, 8f, 0f)));
                riggingPoints.Add(new RiggingPoint(1, new Vector3(3f, 8f, 0f)));
                riggingPoints[0].currentCableLength = 5f;
                riggingPoints[1].currentCableLength = 5f;
            }

            actor.SavePreviousState();
            BuildCableSystem();
            isInitialized = true;
        }

        private void BuildCableSystem()
        {
            cableSystem.BuildCables(riggingPoints, actor, actorAttachOffset);
        }

        private void Update()
        {
            if (!isInitialized) return;

            if (mode == SimulationMode.Play)
            {
                simulationTime += Time.deltaTime;
                StepSimulation(Time.deltaTime);
            }
            else if (mode == SimulationMode.Record)
            {
                simulationTime += Time.deltaTime;
                StepSimulation(Time.deltaTime);
                RecordTrajectory();
            }
            else if (mode == SimulationMode.Replay)
            {
                replayTime += Time.deltaTime * replaySpeed;
                if (loopReplay && recordedTrajectory.Count > 0)
                {
                    float totalDuration = recordedTrajectory[recordedTrajectory.Count - 1].time;
                    if (replayTime > totalDuration) replayTime = 0f;
                }
                UpdateFromReplay();
            }

            UpdateVisualization();
        }

        private void StepSimulation(float dt)
        {
            if (inputMode == InputMode.PresetPath && trajectoryController.HasBezierCurve)
            {
                Vector3 targetPos = trajectoryController.EvaluateBezier(simulationTime);
                UpdateCableTargetsFromPosition(targetPos);
            }
            else if (inputMode == InputMode.ManualControl)
            {
                UpdateCableTargetsFromInput();
            }

            foreach (var rp in riggingPoints)
            {
                if (rp.isEnabled) rp.UpdateCableLength(dt);
            }

            cableSystem.UpdateCableLengths(riggingPoints);

            if (enableWindLoad && windModule != null)
            {
                windModule.SetConfig(windConfig);
                windModule.Update(dt, actor);
                windModule.ApplyWindForces(cableSystem);
                if (cableSystem.ActorParticle != null)
                {
                    windModule.ApplyWindForceToActor(cableSystem.ActorParticle);
                }
            }

            physicsEngine.Step(actor, cableSystem, dt);
            UpdateActorFromPhysics();

            CheckCollisions();
            if (collisionDetector.HasCollision())
            {
                HandleCollisionResponse();
            }

            if (enableInterferenceDetection && interferenceDetector != null)
            {
                interferenceDetector.WarningThreshold = interferenceWarningDistance;
                interferenceDetector.CriticalThreshold = interferenceCriticalDistance;
                List<CableInterferenceResult> interferences = interferenceDetector.DetectInterference(cableSystem);

                RecommendedUnwindingActions = interferenceDetector.GenerateUnwindingSequence(
                    interferences, riggingPoints, actor);

                if (autoUnwind && interferenceDetector.HasCriticalInterference())
                {
                    PerformAutoUnwind(RecommendedUnwindingActions);
                }
            }

            UpdateTensionValues();
            UpdateSafetyMonitor();
            RecordTensionHistory();

            if (!physicsEngine.IsStable && autoRecoverFromInstability)
            {
                stabilityRecoveryCount++;
                if (stabilityRecoveryCount > 10)
                {
                    Debug.LogError("多次尝试恢复稳定性失败，停止仿真");
                    mode = SimulationMode.Edit;
                    stabilityRecoveryCount = 0;
                }
            }
            else
            {
                stabilityRecoveryCount = 0;
            }
        }

        private void PerformAutoUnwind(List<UnwindingAction> actions)
        {
            if (actions == null || actions.Count == 0) return;

            foreach (var action in actions)
            {
                if (action.cableIndex >= 0 && action.cableIndex < riggingPoints.Count)
                {
                    RiggingPoint rp = riggingPoints[action.cableIndex];
                    rp.targetCableLength = Mathf.Max(1f, rp.targetCableLength + action.lengthAdjustment * 0.1f);
                }
            }
        }

        private int stabilityRecoveryCount = 0;

        private void HandleCollisionResponse()
        {
            if (cableSystem.ActorParticle != null)
            {
                cableSystem.ActorParticle.position = actor.position;
                cableSystem.ActorParticle.previousPosition = actor.previousPosition;
            }

            foreach (var cable in cableSystem.Cables)
            {
                if (cable.Particles.Count > 1)
                {
                    for (int i = 1; i < cable.Particles.Count; i++)
                    {
                        VerletParticle particle = cable.Particles[i];
                        if (!particle.isPinned)
                        {
                            Vector3 correction = actor.position - cable.Particles[cable.Particles.Count - 1].position;
                            particle.position += correction * (float)i / cable.Particles.Count;
                        }
                    }
                }
            }

            lastCollisionResult = collisionDetector.LastCCDResult;
            safetyReport.hasCollision = true;
            safetyReport.collisionObjectName = lastCollisionResult.objectName;
            safetyReport.collisionTimeOfImpact = lastCollisionResult.timeOfImpact;
            safetyReport.collisionNormal = lastCollisionResult.hitNormal;
            safetyReport.ccdTriggered = lastCollisionResult.hasCollision;
        }

        private void UpdateCableTargetsFromPosition(Vector3 targetPos)
        {
            foreach (var rp in riggingPoints)
            {
                if (!rp.isEnabled) continue;
                Vector3 attachPos = targetPos + actorAttachOffset;
                float distance = Vector3.Distance(rp.worldPosition, attachPos);
                rp.targetCableLength = Mathf.Max(1f, distance);
            }
        }

        private void UpdateCableTargetsFromInput()
        {
            float wheelInput = Input.GetAxis("Mouse ScrollWheel");
            float horizontal = Input.GetAxis("Horizontal");
            float vertical = Input.GetAxis("Vertical");

            if (riggingPoints.Count > 0)
            {
                riggingPoints[0].targetCableLength -= wheelInput * 2f;
                riggingPoints[0].targetCableLength = Mathf.Clamp(riggingPoints[0].targetCableLength, 1f, 15f);
            }

            if (Input.GetKey(KeyCode.Alpha1) && riggingPoints.Count > 0)
                riggingPoints[0].targetCableLength -= vertical * 2f * Time.deltaTime;
            if (Input.GetKey(KeyCode.Alpha2) && riggingPoints.Count > 1)
                riggingPoints[1].targetCableLength -= vertical * 2f * Time.deltaTime;
        }

        private void UpdateActorFromPhysics()
        {
            if (cableSystem.ActorParticle != null)
            {
                actor.position = cableSystem.ActorParticle.position;
                actor.velocity = (cableSystem.ActorParticle.position - cableSystem.ActorParticle.previousPosition) / Mathf.Max(timeStep, 0.0001f);
                actor.acceleration = cableSystem.ActorParticle.acceleration;
                actor.bounds.center = actor.position;
            }
        }

        private void UpdateTensionValues()
        {
            float[] tensions = cableSystem.GetCableTensions();
            for (int i = 0; i < riggingPoints.Count && i < tensions.Length; i++)
            {
                riggingPoints[i].tension = tensions[i];
                riggingPoints[i].state = tensions[i] > maxTensionKg * 9.81f
                    ? CableState.Overloaded : CableState.Normal;
            }
        }

        private void UpdateSafetyMonitor()
        {
            safetyReport = safetyMonitor.EvaluateSafety(riggingPoints, actor);
            if (!safetyReport.isSafe && mode == SimulationMode.Play)
            {
                mode = SimulationMode.Edit;
                Debug.LogError($"安全报警: {safetyReport.warningMessage}");
            }
        }

        private void CheckCollisions()
        {
            collisionDetector.CheckCollisions(actor);
        }

        private void RecordTensionHistory()
        {
            float maxT = 0f;
            foreach (var rp in riggingPoints)
            {
                if (rp.tension > maxT) maxT = rp.tension;
            }
            tensionHistory.Add(maxT / 9.81f);
            if (tensionHistory.Count > maxHistorySamples)
                tensionHistory.RemoveAt(0);
        }

        private void RecordTrajectory()
        {
            recordTimer += Time.deltaTime;
            if (recordTimer >= recordInterval)
            {
                recordTimer = 0f;
                float[] lengths = new float[riggingPoints.Count];
                for (int i = 0; i < riggingPoints.Count; i++)
                    lengths[i] = riggingPoints[i].currentCableLength;

                recordedTrajectory.Add(new TrajectoryKeyframe(
                    simulationTime, actor.position, actor.rotation, lengths));
            }
        }

        private void UpdateFromReplay()
        {
            if (recordedTrajectory.Count < 2) return;

            TrajectoryKeyframe prev = recordedTrajectory[0];
            TrajectoryKeyframe next = recordedTrajectory[recordedTrajectory.Count - 1];

            for (int i = 0; i < recordedTrajectory.Count - 1; i++)
            {
                if (recordedTrajectory[i].time <= replayTime && recordedTrajectory[i + 1].time >= replayTime)
                {
                    prev = recordedTrajectory[i];
                    next = recordedTrajectory[i + 1];
                    break;
                }
            }

            float t = Mathf.InverseLerp(prev.time, next.time, replayTime);
            Vector3 pos = Vector3.Lerp(prev.position, next.position, t) + replayOffset;
            actor.position = pos;
            actor.velocity = (next.position - prev.position) / Mathf.Max(next.time - prev.time, 0.001f);

            for (int i = 0; i < riggingPoints.Count && i < prev.cableLengths.Length; i++)
            {
                riggingPoints[i].currentCableLength = Mathf.Lerp(prev.cableLengths[i], next.cableLengths[i], t);
                riggingPoints[i].targetCableLength = riggingPoints[i].currentCableLength;
            }
        }

        private void UpdateVisualization()
        {
            cableRenderer.UpdateCableRenderers(cableSystem, riggingPoints);
            arrowRenderer.UpdateArrows(actor);
        }

        public void SetMode(SimulationMode newMode)
        {
            mode = newMode;
            if (newMode == SimulationMode.Record)
            {
                recordedTrajectory.Clear();
                simulationTime = 0f;
                recordTimer = 0f;
            }
            if (newMode == SimulationMode.Replay)
            {
                replayTime = 0f;
            }
        }

        public void LoadBezierCurve(Vector3[] controlPoints)
        {
            trajectoryController.SetBezierControlPoints(controlPoints);
        }

        public void AddCollisionBox(string name, Bounds bounds)
        {
            collisionBoxes.Add(new CollisionBox(name, bounds));
            collisionDetector = new CollisionDetector(collisionBoxes);
        }

        public float[] GetCableTensions()
        {
            float[] result = new float[riggingPoints.Count];
            for (int i = 0; i < riggingPoints.Count; i++)
                result[i] = riggingPoints[i].tension;
            return result;
        }

        public void AddRiggingPoint(Vector3 position)
        {
            if (riggingPoints.Count >= maxRiggingPoints)
            {
                Debug.LogWarning($"已达到最大吊点数 {maxRiggingPoints}");
                return;
            }
            int index = riggingPoints.Count;
            riggingPoints.Add(new RiggingPoint(index, position));
            if (isInitialized) BuildCableSystem();
        }

        public void RemoveRiggingPoint(int index)
        {
            if (index < 0 || index >= riggingPoints.Count) return;
            riggingPoints.RemoveAt(index);
            for (int i = 0; i < riggingPoints.Count; i++)
                riggingPoints[i].index = i;
            if (isInitialized) BuildCableSystem();
        }

        private void OnDrawGizmos()
        {
            if (riggingPoints == null) return;

            Gizmos.color = Color.yellow;
            foreach (var rp in riggingPoints)
            {
                Gizmos.DrawSphere(rp.worldPosition, 0.15f);
            }

            Gizmos.color = Color.blue;
            if (actor != null)
            {
                Gizmos.DrawWireCube(actor.position, actor.bounds.size);
            }

            if (collisionBoxes != null)
            {
                foreach (var box in collisionBoxes)
                {
                    Gizmos.color = box.isColliding ? Color.red : new Color(1f, 0.5f, 0f, 0.5f);
                    Gizmos.DrawWireCube(box.bounds.center, box.bounds.size);
                }
            }
        }
    }
}