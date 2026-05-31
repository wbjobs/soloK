using System.Collections.Generic;
using UnityEngine;

#if UNITY_EDITOR
using UnityEditor;
#endif

namespace TheaterRigging
{
#if UNITY_EDITOR
    [CustomEditor(typeof(SimulationManager))]
    public class SimulationManagerEditor : Editor
    {
        private SerializedProperty modeProp;
        private SerializedProperty inputModeProp;
        private SerializedProperty timeStepProp;
        private SerializedProperty gravityProp;
        private SerializedProperty cableStiffnessProp;
        private SerializedProperty cableDampingProp;
        private SerializedProperty maxTensionKgProp;
        private SerializedProperty safetyFactorProp;
        private SerializedProperty enableCCDProp;
        private SerializedProperty ccdVelocityThresholdProp;
        private SerializedProperty sceneBoundsProp;
        private SerializedProperty enableInterferenceProp;
        private SerializedProperty interferenceWarningProp;
        private SerializedProperty interferenceCriticalProp;
        private SerializedProperty autoUnwindProp;
        private SerializedProperty enableWindLoadProp;

        private Vector2 scrollPosition;
        private bool showRiggingPoints = true;
        private bool showCollisionBoxes = true;
        private bool showPhysicsSettings = true;
        private bool showSafetySettings = true;
        private bool showAdvancedSettings = true;
        private bool showStabilityMonitor = true;
        private bool showCollisionMonitor = true;
        private bool showInterferenceMonitor = true;
        private bool showWindLoadPanel = true;
        private bool showUnwindingActions = true;

        private void OnEnable()
        {
            modeProp = serializedObject.FindProperty("mode");
            inputModeProp = serializedObject.FindProperty("inputMode");
            timeStepProp = serializedObject.FindProperty("timeStep");
            gravityProp = serializedObject.FindProperty("gravity");
            cableStiffnessProp = serializedObject.FindProperty("cableStiffness");
            cableDampingProp = serializedObject.FindProperty("cableDamping");
            maxTensionKgProp = serializedObject.FindProperty("maxTensionKg");
            safetyFactorProp = serializedObject.FindProperty("safetyFactor");
            enableCCDProp = serializedObject.FindProperty("enableCCD");
            ccdVelocityThresholdProp = serializedObject.FindProperty("ccdVelocityThreshold");
            sceneBoundsProp = serializedObject.FindProperty("sceneBounds");
            enableInterferenceProp = serializedObject.FindProperty("enableInterferenceDetection");
            interferenceWarningProp = serializedObject.FindProperty("interferenceWarningDistance");
            interferenceCriticalProp = serializedObject.FindProperty("interferenceCriticalDistance");
            autoUnwindProp = serializedObject.FindProperty("autoUnwind");
            enableWindLoadProp = serializedObject.FindProperty("enableWindLoad");
        }

        public override void OnInspectorGUI()
        {
            serializedObject.Update();

            SimulationManager sim = (SimulationManager)target;

            DrawSimulationControl(sim);
            DrawStabilityMonitor(sim);
            DrawCollisionMonitor(sim);
            DrawInterferenceMonitor(sim);
            DrawWindLoadPanel(sim);
            DrawPhysicsSettings(sim);
            DrawRiggingPoints(sim);
            DrawCollisionBoxes(sim);
            DrawSafetySettings(sim);
            DrawAdvancedSettings(sim);

            if (GUI.changed)
            {
                EditorUtility.SetDirty(target);
            }

            serializedObject.ApplyModifiedProperties();
        }

        private void DrawSimulationControl(SimulationManager sim)
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("仿真控制", EditorStyles.boldLabel);
            EditorGUILayout.BeginVertical("HelpBox");
            EditorGUI.indentLevel++;

            EditorGUILayout.PropertyField(modeProp, new GUIContent("仿真模式"));
            EditorGUILayout.PropertyField(inputModeProp, new GUIContent("输入模式"));

            EditorGUILayout.Space();
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("播放/P", GUILayout.Height(25)))
            {
                sim.SetMode(SimulationMode.Play);
            }
            if (GUILayout.Button("暂停/E", GUILayout.Height(25)))
            {
                sim.SetMode(SimulationMode.Edit);
            }
            if (GUILayout.Button("录制/R", GUILayout.Height(25)))
            {
                sim.SetMode(SimulationMode.Record);
            }
            EditorGUILayout.EndHorizontal();

            EditorGUI.indentLevel--;
            EditorGUILayout.EndVertical();
        }

        private void DrawStabilityMonitor(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showStabilityMonitor = EditorGUILayout.Foldout(showStabilityMonitor, "稳定性监控");
            if (showStabilityMonitor)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                bool isStable = sim.IsSystemStable;
                Color statusColor = isStable ? Color.green : Color.red;
                EditorGUILayout.LabelField($"系统状态: {(isStable ? "稳定" : "不稳定")}",
                    new GUIStyle(EditorStyles.boldLabel) { normal = { textColor = statusColor } });

                EditorGUILayout.LabelField($"当前子步数: {sim.CurrentSubStepCount}");

                if (Application.isPlaying)
                {
                    Rect progressRect = EditorGUILayout.GetControlRect(false, 20);
                    float energyRatio = Mathf.Clamp01(1f);
                    EditorGUI.ProgressBar(progressRect, energyRatio, "系统能量");
                }

                EditorGUILayout.HelpBox(
                    "自适应子步: 当检测到高加速度时自动细分时间步\n" +
                    "能量监控: 防止能量爆炸导致数值不稳定\n" +
                    "自动恢复: 检测到不稳定时自动重置状态",
                    MessageType.Info);

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawCollisionMonitor(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showCollisionMonitor = EditorGUILayout.Foldout(showCollisionMonitor, "碰撞监控");
            if (showCollisionMonitor)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                bool hasCollision = sim.safetyReport.hasCollision;
                Color collisionColor = hasCollision ? Color.red : Color.green;
                EditorGUILayout.LabelField($"碰撞状态: {(hasCollision ? "碰撞中" : "正常")}",
                    new GUIStyle(EditorStyles.boldLabel) { normal = { textColor = collisionColor } });

                if (hasCollision)
                {
                    EditorGUILayout.LabelField($"碰撞对象: {sim.safetyReport.collisionObjectName}");
                    EditorGUILayout.LabelField($"CCD触发: {(sim.safetyReport.ccdTriggered ? "是" : "否")}");
                    EditorGUILayout.LabelField($"碰撞时间: {sim.safetyReport.collisionTimeOfImpact:F3}s");

                    Vector3 normal = sim.safetyReport.collisionNormal;
                    EditorGUILayout.Vector3Field("碰撞法线", normal);

                    EditorGUILayout.HelpBox("已检测到碰撞，CCD已处理穿透", MessageType.Warning);
                }

                EditorGUILayout.HelpBox(
                    "CCD (连续碰撞检测): 防止高速物体穿透\n" +
                    "触发阈值: 速度 > 5m/s 或 位移 > 物体尺寸一半\n" +
                    "扫掠测试: 计算精确碰撞时间",
                    MessageType.Info);

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawPhysicsSettings(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showPhysicsSettings = EditorGUILayout.Foldout(showPhysicsSettings, "物理参数");
            if (showPhysicsSettings)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                EditorGUILayout.PropertyField(timeStepProp, new GUIContent("基础时间步长"));
                EditorGUILayout.PropertyField(gravityProp, new GUIContent("重力加速度"));
                EditorGUILayout.PropertyField(cableStiffnessProp, new GUIContent("钢丝绳刚度"));
                EditorGUILayout.PropertyField(cableDampingProp, new GUIContent("钢丝绳阻尼"));

                EditorGUILayout.Space();
                EditorGUILayout.HelpBox(
                    "刚度越高，钢丝绳越不容易伸长，但更容易不稳定\n" +
                    "阻尼越高，振动衰减越快，但可能感觉不自然\n" +
                    "建议: 刚度 50000-100000, 阻尼 500-1000",
                    MessageType.Info);

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawRiggingPoints(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showRiggingPoints = EditorGUILayout.Foldout(showRiggingPoints, $"吊点系统 ({sim.riggingPoints.Count}/8)");
            if (showRiggingPoints)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                for (int i = 0; i < sim.riggingPoints.Count; i++)
                {
                    RiggingPoint rp = sim.riggingPoints[i];
                    EditorGUILayout.BeginVertical("HelpBox");

                    EditorGUILayout.LabelField($"吊点 {i + 1}: {rp.name}", EditorStyles.boldLabel);
                    rp.worldPosition = EditorGUILayout.Vector3Field("世界位置", rp.worldPosition);
                    rp.targetCableLength = EditorGUILayout.Slider("目标绳长", rp.targetCableLength, 1f, 15f);
                    rp.maxSpeed = EditorGUILayout.Slider("最大速度", rp.maxSpeed, 1f, 10f);
                    rp.isEnabled = EditorGUILayout.Toggle("启用", rp.isEnabled);

                    float tensionKg = rp.tension / 9.81f;
                    Color tensionColor = tensionKg > sim.maxTensionKg ? Color.red :
                                        tensionKg > sim.maxTensionKg * 0.8f ? Color.yellow : Color.green;

                    Rect tensionRect = EditorGUILayout.GetControlRect(false, 20);
                    EditorGUI.ProgressBar(tensionRect, Mathf.Clamp01(tensionKg / sim.maxTensionKg),
                        $"张力: {tensionKg:F1} kg / {sim.maxTensionKg:F0} kg");
                    tensionRect.y += EditorGUIUtility.singleLineHeight;

                    EditorGUILayout.EndVertical();
                }

                EditorGUILayout.Space();
                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("添加吊点") && sim.riggingPoints.Count < 8)
                {
                    sim.AddRiggingPoint(new Vector3(0f, 8f, 0f));
                }
                if (GUILayout.Button("添加8个测试吊点"))
                {
                    for (int i = 0; i < 8; i++)
                    {
                        float angle = (float)i / 8 * Mathf.PI * 2f;
                        Vector3 pos = new Vector3(
                            Mathf.Cos(angle) * 4f,
                            8f,
                            Mathf.Sin(angle) * 2f
                        );
                        sim.AddRiggingPoint(pos);
                    }
                }
                if (GUILayout.Button("清除吊点") && sim.riggingPoints.Count > 0)
                {
                    while (sim.riggingPoints.Count > 0)
                        sim.RemoveRiggingPoint(sim.riggingPoints.Count - 1);
                }
                EditorGUILayout.EndHorizontal();

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawCollisionBoxes(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showCollisionBoxes = EditorGUILayout.Foldout(showCollisionBoxes, $"碰撞包围盒 ({sim.collisionBoxes.Count})");
            if (showCollisionBoxes)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                for (int i = 0; i < sim.collisionBoxes.Count; i++)
                {
                    CollisionBox box = sim.collisionBoxes[i];
                    EditorGUILayout.BeginVertical("HelpBox");

                    box.name = EditorGUILayout.TextField("名称", box.name);
                    Vector3 center = EditorGUILayout.Vector3Field("中心", box.bounds.center);
                    Vector3 size = EditorGUILayout.Vector3Field("尺寸", box.bounds.size);
                    box.bounds = new Bounds(center, size);
                    box.isEnabled = EditorGUILayout.Toggle("启用碰撞检测", box.isEnabled);

                    if (box.isColliding)
                    {
                        EditorGUILayout.HelpBox($"⚠ 正在与 {box.name} 碰撞!", MessageType.Warning);
                    }

                    EditorGUILayout.EndVertical();
                }

                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("添加测试碰撞盒"))
                {
                    sim.AddCollisionBox("障碍物", new Bounds(new Vector3(5f, 2f, 0f), new Vector3(1f, 4f, 2f)));
                }
                EditorGUILayout.EndHorizontal();

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawSafetySettings(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showSafetySettings = EditorGUILayout.Foldout(showSafetySettings, "安全参数");
            if (showSafetySettings)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                EditorGUILayout.PropertyField(maxTensionKgProp, new GUIContent("最大张力 (kg)"));
                EditorGUILayout.PropertyField(safetyFactorProp, new GUIContent("安全系数"));

                EditorGUILayout.Space();
                EditorGUILayout.LabelField($"当前动载系数: {sim.safetyReport.dynamicLoadFactor:F2}",
                    new GUIStyle(EditorStyles.label)
                    {
                        normal = { textColor = sim.safetyReport.dynamicLoadFactor > sim.safetyFactor ? Color.red : Color.green }
                    });

                Rect dlfRect = EditorGUILayout.GetControlRect(false, 20);
                EditorGUI.ProgressBar(dlfRect,
                    Mathf.Clamp01(sim.safetyReport.dynamicLoadFactor / sim.safetyFactor),
                    $"动载系数: {sim.safetyReport.dynamicLoadFactor:F2} / {sim.safetyFactor}");

                if (!sim.safetyReport.isSafe)
                {
                    EditorGUILayout.HelpBox(sim.safetyReport.warningMessage, MessageType.Error);
                }

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawInterferenceMonitor(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showInterferenceMonitor = EditorGUILayout.Foldout(showInterferenceMonitor, "钢丝绳干涉检测");
            if (showInterferenceMonitor)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                EditorGUILayout.PropertyField(enableInterferenceProp, new GUIContent("启用干涉检测"));
                if (sim.enableInterferenceDetection)
                {
                    EditorGUILayout.PropertyField(interferenceWarningProp, new GUIContent("警告阈值 (m)"));
                    EditorGUILayout.PropertyField(interferenceCriticalProp, new GUIContent("危险阈值 (m)"));
                    EditorGUILayout.PropertyField(autoUnwindProp, new GUIContent("自动解缠绕"));

                    EditorGUILayout.Space();

                    if (Application.isPlaying)
                    {
                        var results = sim.LastInterferenceResults;
                        if (results != null && results.Count > 0)
                        {
                            EditorGUILayout.LabelField($"检测到 {results.Count} 处干涉风险:", EditorStyles.boldLabel);

                            foreach (var result in results)
                            {
                                Color riskColor = result.isCritical ? Color.red :
                                                  result.isHighRisk ? Color.yellow : Color.green;

                                EditorGUILayout.BeginHorizontal();
                                EditorGUILayout.LabelField($"  吊点{result.cableAIndex + 1}-{result.cableBIndex + 1}:  " +
                                    $"{result.minimumDistance * 1000:F1}mm",
                                    new GUIStyle(EditorStyles.label) { normal = { textColor = riskColor } });
                                EditorGUILayout.EndHorizontal();
                            }

                            if (sim.autoUnwind && results.Exists(r => r.isCritical))
                            {
                                EditorGUILayout.HelpBox("⚠ 检测到危险干涉，正在自动解缠绕", MessageType.Warning);
                            }

                            if (showUnwindingActions && sim.RecommendedUnwindingActions != null
                                && sim.RecommendedUnwindingActions.Count > 0)
                            {
                                EditorGUILayout.Space();
                                EditorGUILayout.LabelField("推荐解缠绕动作:", EditorStyles.boldLabel);
                                foreach (var action in sim.RecommendedUnwindingActions)
                                {
                                    EditorGUILayout.LabelField($"  • {action.description}");
                                }
                            }
                        }
                        else
                        {
                            EditorGUILayout.LabelField("✓ 无干涉风险",
                                new GUIStyle(EditorStyles.label) { normal = { textColor = Color.green } });
                        }
                    }
                    else
                    {
                        EditorGUILayout.HelpBox("运行时实时检测钢丝绳之间的最小距离", MessageType.Info);
                    }
                }

                EditorGUILayout.HelpBox(
                    "线段-线段距离算法检测所有吊点对之间的最小距离\n" +
                    "警告阈值 < 100mm 触发警告\n" +
                    "危险阈值 < 50mm 触发自动解缠绕",
                    MessageType.Info);

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawWindLoadPanel(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showWindLoadPanel = EditorGUILayout.Foldout(showWindLoadPanel, "风载扰动模拟");
            if (showWindLoadPanel)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                EditorGUILayout.PropertyField(enableWindLoadProp, new GUIContent("启用风载扰动"));

                if (sim.windConfig == null)
                {
                    sim.windConfig = new WindConfig();
                }

                if (sim.enableWindLoad)
                {
                    EditorGUILayout.Space();
                    EditorGUILayout.LabelField("风源类型", EditorStyles.boldLabel);
                    sim.windConfig.sourceType = (WindSourceType)EditorGUILayout.EnumPopup("风源", sim.windConfig.sourceType);

                    EditorGUILayout.Space();
                    EditorGUILayout.LabelField("湍流谱类型", EditorStyles.boldLabel);
                    sim.windConfig.psdType = (PSDType)EditorGUILayout.EnumPopup("功率谱密度", sim.windConfig.psdType);

                    EditorGUILayout.Space();
                    EditorGUILayout.LabelField("风场参数", EditorStyles.boldLabel);
                    sim.windConfig.baseSpeed = EditorGUILayout.Slider("基本风速 (m/s)", sim.windConfig.baseSpeed, 0f, 10f);
                    sim.windConfig.turbulenceIntensity = EditorGUILayout.Slider("湍流强度", sim.windConfig.turbulenceIntensity, 0f, 1f);
                    sim.windConfig.windDirection = EditorGUILayout.Vector3Field("风向", sim.windConfig.windDirection);
                    sim.windConfig.windDirection.Normalize();

                    EditorGUILayout.Space();
                    EditorGUILayout.LabelField("阵风参数", EditorStyles.boldLabel);
                    sim.windConfig.gustFrequency = EditorGUILayout.Slider("阵风频率 (Hz)", sim.windConfig.gustFrequency, 0f, 5f);
                    sim.windConfig.gustAmplitude = EditorGUILayout.Slider("阵风振幅 (m/s)", sim.windConfig.gustAmplitude, 0f, 5f);

                    if (sim.windConfig.psdType == PSDType.Custom)
                    {
                        sim.windConfig.cornerFrequency = EditorGUILayout.Slider("转折频率 (Hz)", sim.windConfig.cornerFrequency, 0.1f, 10f);
                    }

                    if (Application.isPlaying && sim.WindModule != null)
                    {
                        EditorGUILayout.Space();
                        EditorGUILayout.LabelField("实时监测", EditorStyles.boldLabel);

                        Vector3 windVel = sim.WindModule.CurrentWindVelocity;
                        EditorGUILayout.Vector3Field("瞬时风速", windVel);
                        EditorGUILayout.LabelField($"风速大小: {windVel.magnitude:F2} m/s");

                        Vector3 drift = sim.WindModule.TotalActorDrift;
                        EditorGUILayout.Vector3Field("累积飘移", drift);
                        EditorGUILayout.LabelField($"飘移量: {drift.magnitude * 1000:F1} mm");

                        float powerDensity = sim.WindModule.GetWindPowerDensity();
                        EditorGUILayout.LabelField($"风功率密度: {powerDensity:F2} W/m²");

                        float reynolds = sim.WindModule.GetReynoldsNumber();
                        EditorGUILayout.LabelField($"雷诺数: {reynolds:E2}");

                        Vector3 windForce = sim.WindModule.ActorWindForce;
                        EditorGUILayout.LabelField($"演员风阻力: {windForce.magnitude:F2} N");

                        if (drift.magnitude > 0.1f)
                        {
                            EditorGUILayout.HelpBox(
                                "⚠ 飘移量较大，建议评估是否需要添加主动抗风控制算法",
                                MessageType.Warning);
                        }
                    }
                }

                string psdInfo = sim.windConfig.psdType switch
                {
                    PSDType.WhiteNoise => "白噪声: 所有频率能量均匀分布",
                    PSDType.PinkNoise => "粉红噪声: 1/f谱，能量随频率降低",
                    PSDType.BrownianNoise => "布朗噪声: 1/f²谱，平滑随机游走",
                    PSDType.VonKarman => "Von Karman: 大气湍流标准模型",
                    PSDType.Dryden => "Dryden: 航空航天常用模型",
                    PSDType.Custom => "自定义: 混合多种谱特性",
                    _ => ""
                };

                EditorGUILayout.Space();
                EditorGUILayout.HelpBox(
                    $"风载模拟 - {sim.windConfig.sourceType}\n{psdInfo}\n" +
                    "风力作用于演员和每一段钢丝绳\n" +
                    "观察飘移量评估系统抗风能力",
                    MessageType.Info);

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawAdvancedSettings(SimulationManager sim)
        {
            EditorGUILayout.Space();
            showAdvancedSettings = EditorGUILayout.Foldout(showAdvancedSettings, "高级设置");
            if (showAdvancedSettings)
            {
                EditorGUILayout.BeginVertical("HelpBox");
                EditorGUI.indentLevel++;

                EditorGUILayout.PropertyField(enableCCDProp, new GUIContent("启用连续碰撞检测 (CCD)"));
                if (sim.enableCCD)
                {
                    EditorGUILayout.PropertyField(ccdVelocityThresholdProp, new GUIContent("CCD速度阈值 (m/s)"));
                }

                EditorGUILayout.PropertyField(sceneBoundsProp, new GUIContent("场景边界"));

                EditorGUILayout.Space();
                EditorGUILayout.HelpBox(
                    "CCD防止高速物体穿透，但会增加计算开销\n" +
                    "场景边界用于钳位粒子位置，防止飞出场景",
                    MessageType.Info);

                EditorGUI.indentLevel--;
                EditorGUILayout.EndVertical();
            }
        }
    }
#endif
}