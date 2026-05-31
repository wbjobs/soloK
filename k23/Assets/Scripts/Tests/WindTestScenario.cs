using UnityEngine;

namespace TheaterRigging
{
    public class WindTestScenario : MonoBehaviour
    {
        [Header("测试配置")]
        public bool runWindTest = false;
        public float testDuration = 60f;
        public float[] testWindSpeeds = new float[] { 1f, 3f, 5f, 8f };

        [Header("测试结果")]
        public int currentTestIndex = 0;
        public float testTime = 0f;
        public Vector3 maxDrift;
        public Vector3 avgDrift;
        public float maxTensionVariation;
        public float baseTension;
        public bool testComplete = false;

        [Header("结论")]
        public bool needsAntiWindControl = false;
        public string recommendation = "";

        private SimulationManager sim;
        private int sampleCount = 0;
        private Vector3 driftSum;

        private void Start()
        {
            sim = SimulationManager.Instance;
        }

        private void Update()
        {
            if (runWindTest)
            {
                runWindTest = false;
                StartWindTest();
            }

            if (sim != null && sim.enableWindLoad && !testComplete)
            {
                RunTestStep();
            }
        }

        [ContextMenu("启动风载测试")]
        public void StartWindTest()
        {
            if (sim == null)
            {
                sim = SimulationManager.Instance;
                if (sim == null)
                {
                    Debug.LogError("SimulationManager未找到");
                    return;
                }
            }

            currentTestIndex = 0;
            testTime = 0f;
            sampleCount = 0;
            driftSum = Vector3.zero;
            maxDrift = Vector3.zero;
            testComplete = false;
            needsAntiWindControl = false;

            sim.enableWindLoad = true;
            sim.windConfig.baseSpeed = testWindSpeeds[0];
            sim.windConfig.psdType = PSDType.VonKarman;
            sim.windConfig.turbulenceIntensity = 0.3f;
            sim.windConfig.windDirection = Vector3.right;

            if (sim.WindModule != null)
            {
                sim.WindModule.ResetDrift();
            }

            sim.SetMode(SimulationMode.Play);

            baseTension = 0f;
            foreach (var rp in sim.riggingPoints)
            {
                baseTension += rp.tension;
            }
            baseTension = Mathf.Max(baseTension, 1f);

            Debug.Log($"风载测试启动 - 共{testWindSpeeds.Length}个风速等级");
        }

        private void RunTestStep()
        {
            testTime += Time.deltaTime;

            if (sim.WindModule != null)
            {
                Vector3 drift = sim.WindModule.TotalActorDrift;
                driftSum += drift;
                sampleCount++;
                avgDrift = driftSum / sampleCount;

                if (drift.magnitude > maxDrift.magnitude)
                {
                    maxDrift = drift;
                }
            }

            float currentTension = 0f;
            foreach (var rp in sim.riggingPoints)
            {
                currentTension += rp.tension;
            }
            float variation = Mathf.Abs(currentTension - baseTension) / baseTension;
            maxTensionVariation = Mathf.Max(maxTensionVariation, variation);

            if (testTime >= testDuration / testWindSpeeds.Length)
            {
                LogTestResults();

                currentTestIndex++;
                testTime = 0f;

                if (currentTestIndex < testWindSpeeds.Length)
                {
                    sim.windConfig.baseSpeed = testWindSpeeds[currentTestIndex];
                    if (sim.WindModule != null)
                    {
                        sim.WindModule.ResetDrift();
                    }
                    Debug.Log($"切换到风速等级 {currentTestIndex + 1}: {testWindSpeeds[currentTestIndex]} m/s");
                }
                else
                {
                    CompleteTest();
                }
            }
        }

        private void LogTestResults()
        {
            float speed = testWindSpeeds[currentTestIndex];
            Debug.Log(string.Format(
                "风速等级 {0}: {1:F1} m/s | " +
                "最大飘移: {2:F1} mm | " +
                "平均飘移: {3:F1} mm | " +
                "张力变化: {4:F1}%",
                currentTestIndex + 1,
                speed,
                maxDrift.magnitude * 1000f,
                avgDrift.magnitude * 1000f,
                maxTensionVariation * 100f
            ));
        }

        private void CompleteTest()
        {
            testComplete = true;
            sim.SetMode(SimulationMode.Edit);

            float driftThreshold = 0.1f;
            float tensionThreshold = 0.2f;

            needsAntiWindControl = maxDrift.magnitude > driftThreshold ||
                                   maxTensionVariation > tensionThreshold;

            if (needsAntiWindControl)
            {
                recommendation = "建议添加主动抗风控制算法:\n" +
                    "1. 前馈控制: 基于风载观测的补偿\n" +
                    "2. PID反馈: 位置闭环控制\n" +
                    "3. 张力均衡: 多吊点协同分配\n" +
                    "4. 自适应阻尼: 风载下增加系统阻尼";
            }
            else
            {
                recommendation = "当前系统抗风能力满足要求，无需额外控制算法";
            }

            Debug.Log("===== 风载测试完成 =====");
            Debug.Log($"最大飘移: {maxDrift.magnitude * 1000:F1} mm");
            Debug.Log($"最大张力变化: {maxTensionVariation * 100:F1}%");
            Debug.Log($"需要抗风控制: {needsAntiWindControl}");
            Debug.Log(recommendation);
        }

        [ContextMenu("重置测试")]
        public void ResetTest()
        {
            currentTestIndex = 0;
            testTime = 0f;
            maxDrift = Vector3.zero;
            avgDrift = Vector3.zero;
            maxTensionVariation = 0f;
            sampleCount = 0;
            driftSum = Vector3.zero;
            testComplete = false;
            needsAntiWindControl = false;
            recommendation = "";

            if (sim != null)
            {
                sim.enableWindLoad = false;
                if (sim.WindModule != null)
                {
                    sim.WindModule.ResetDrift();
                }
            }
        }
    }
}