using UnityEngine;

namespace TheaterRigging
{
    public class StabilityTest : MonoBehaviour
    {
        [Header("测试配置")]
        public bool runHighAccelerationTest = false;
        public bool runHighSpeedCollisionTest = false;
        public int testRiggingPointCount = 8;
        public float testAcceleration = 25f;
        public float testSpeed = 10f;

        [Header("测试状态")]
        public bool testRunning = false;
        public float testTime = 0f;
        public string testResult = "";
        public int stabilityFailures = 0;
        public int collisionDetections = 0;
        public bool ccdPreventedPenetration = false;

        private VerletPhysicsEngine testEngine;
        private CableSystem testCableSystem;
        private ActorState testActor;

        private void Start()
        {
            InitializeTestEnvironment();
        }

        private void Update()
        {
            if (runHighAccelerationTest)
            {
                runHighAccelerationTest = false;
                RunHighAccelerationTest();
            }

            if (runHighSpeedCollisionTest)
            {
                runHighSpeedCollisionTest = false;
                RunHighSpeedCollisionTest();
            }
        }

        [ContextMenu("初始化测试环境")]
        public void InitializeTestEnvironment()
        {
            testActor = new ActorState();
            testActor.position = new Vector3(0f, 3f, 0f);
            testActor.mass = 70f;
            testActor.useCCD = true;
            testActor.ccdThreshold = 5f;

            testEngine = new VerletPhysicsEngine(new Vector3(0f, -9.81f, 0f), 0.008f, 8);
            testCableSystem = new CableSystem(80000f, 800f, 0.2f, 0.3f, 20);

            testResult = "测试环境已初始化";
            Debug.Log(testResult);
        }

        [ContextMenu("运行高加速度稳定性测试")]
        public string RunHighAccelerationTest()
        {
            if (testEngine == null || testCableSystem == null)
            {
                InitializeTestEnvironment();
            }

            testRunning = true;
            testTime = 0f;
            stabilityFailures = 0;

            List<RiggingPoint> testPoints = new List<RiggingPoint>();
            for (int i = 0; i < testRiggingPointCount; i++)
            {
                float angle = (float)i / testRiggingPointCount * Mathf.PI * 2f;
                Vector3 pos = new Vector3(
                    Mathf.Cos(angle) * 4f,
                    8f,
                    Mathf.Sin(angle) * 2f
                );
                testPoints.Add(new RiggingPoint(i, pos));
                testPoints[i].currentCableLength = 5f;
                testPoints[i].targetCableLength = 5f;
            }

            testCableSystem.BuildCables(testPoints, testActor, new Vector3(0f, 0.3f, 0f));

            float testDuration = 5f;
            float dt = 0.008f;
            int steps = Mathf.CeilToInt(testDuration / dt);

            float maxVelocity = 0f;
            float maxTension = 0f;
            bool becameUnstable = false;

            for (int step = 0; step < steps; step++)
            {
                testTime += dt;

                float accelerationPhase = Mathf.Min(testTime / 0.5f, 1f);
                float accelerationAmount = testAcceleration * accelerationPhase;

                testActor.AddForce(new Vector3(accelerationAmount, 0f, 0f) * testActor.mass);

                foreach (var rp in testPoints)
                {
                    rp.targetCableLength = 5f + Mathf.Sin(testTime * 4f) * 0.5f;
                    rp.UpdateCableLength(dt);
                }

                testCableSystem.UpdateCableLengths(testPoints);
                testEngine.Step(testActor, testCableSystem, dt);

                maxVelocity = Mathf.Max(maxVelocity, testActor.velocity.magnitude);

                float[] tensions = testCableSystem.GetCableTensions();
                foreach (var t in tensions)
                    maxTension = Mathf.Max(maxTension, t);

                if (!testEngine.IsStable)
                {
                    stabilityFailures++;
                    becameUnstable = true;
                }

                if (float.IsNaN(testActor.position.x) ||
                    float.IsInfinity(testActor.position.x) ||
                    testActor.position.magnitude > 50f)
                {
                    testResult = $"失败: 数值爆炸在 {testTime:F2}s";
                    testRunning = false;
                    Debug.LogError(testResult);
                    return testResult;
                }
            }

            testResult = string.Format(
                "高加速度测试完成:\n" +
                "- 吊点数: {0}\n" +
                "- 目标加速度: {1:F1} m/s² ({2:F1}g)\n" +
                "- 最大速度: {3:F2} m/s\n" +
                "- 最大张力: {4:F0} N ({5:F1} kg)\n" +
                "- 稳定性警告: {6}\n" +
                "- 系统稳定: {7}",
                testRiggingPointCount,
                testAcceleration,
                testAcceleration / 9.81f,
                maxVelocity,
                maxTension,
                maxTension / 9.81f,
                stabilityFailures,
                !becameUnstable
            );

            testRunning = false;
            Debug.Log(testResult);
            return testResult;
        }

        [ContextMenu("运行高速碰撞测试")]
        public string RunHighSpeedCollisionTest()
        {
            if (testEngine == null || testCableSystem == null)
            {
                InitializeTestEnvironment();
            }

            testRunning = true;
            testTime = 0f;
            collisionDetections = 0;
            ccdPreventedPenetration = false;

            List<CollisionBox> testBoxes = new List<CollisionBox>
            {
                new CollisionBox("墙壁", new Bounds(new Vector3(5f, 3f, 0f), new Vector3(0.5f, 6f, 4f)))
            };

            CollisionDetector detector = new CollisionDetector(testBoxes);
            detector.CCDEnabled = true;

            testActor.position = new Vector3(0f, 3f, 0f);
            testActor.SavePreviousState();
            testActor.velocity = new Vector3(testSpeed, 0f, 0f);

            float dt = 0.016f;
            bool collisionDetected = false;
            bool penetrated = false;
            Vector3 firstCollisionPos = Vector3.zero;
            float firstCollisionTime = 0f;

            for (int step = 0; step < 100; step++)
            {
                testTime += dt;

                testActor.previousPosition = testActor.position;
                testActor.position += testActor.velocity * dt;
                testActor.bounds.center = testActor.position;

                detector.CheckCollisions(testActor);

                if (detector.HasCollision() && !collisionDetected)
                {
                    collisionDetected = true;
                    firstCollisionPos = testActor.position;
                    firstCollisionTime = testTime;
                    collisionDetections++;

                    float penetration = testActor.bounds.max.x - testBoxes[0].bounds.min.x;
                    if (penetration < 0.1f)
                    {
                        ccdPreventedPenetration = true;
                    }
                    else
                    {
                        penetrated = true;
                    }
                }

                if (collisionDetected)
                {
                    float bounceX = 5f - testActor.bounds.extents.x - 0.01f;
                    if (testActor.position.x > bounceX)
                    {
                        testActor.position.x = bounceX;
                    }
                }
            }

            testResult = string.Format(
                "高速碰撞测试完成:\n" +
                "- 测试速度: {0:F1} m/s\n" +
                "- 碰撞检测: {1}\n" +
                "- 首次碰撞时间: {2:F3}s\n" +
                "- 碰撞位置: ({3:F2}, {4:F2}, {5:F2})\n" +
                "- CCD防止穿透: {6}\n" +
                "- 发生穿透: {7}",
                testSpeed,
                collisionDetected ? "是" : "否",
                firstCollisionTime,
                firstCollisionPos.x,
                firstCollisionPos.y,
                firstCollisionPos.z,
                ccdPreventedPenetration ? "是" : "否",
                penetrated ? "是" : "否"
            );

            testRunning = false;
            Debug.Log(testResult);
            return testResult;
        }

        [ContextMenu("运行所有测试")]
        public void RunAllTests()
        {
            Debug.Log("===== 稳定性和碰撞测试套件 =====");
            RunHighAccelerationTest();
            RunHighSpeedCollisionTest();
            Debug.Log("===== 测试完成 =====");
        }
    }
}