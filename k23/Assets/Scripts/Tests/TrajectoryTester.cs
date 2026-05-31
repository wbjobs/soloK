using UnityEngine;

namespace TheaterRigging
{
    public class TrajectoryTester : MonoBehaviour
    {
        public bool runTests = false;

        private void Update()
        {
            if (runTests)
            {
                runTests = false;
                RunAllTests();
            }
        }

        [ContextMenu("运行所有测试")]
        public void RunAllTests()
        {
            Debug.Log("===== 开始仿真器自检 =====");
            TestVerletIntegration();
            TestDistanceConstraint();
            TestCableSystem();
            TestBezierCurve();
            TestSafetyMonitor();
            TestCollisionDetector();
            Debug.Log("===== 测试完成 =====");
        }

        private void TestVerletIntegration()
        {
            Debug.Log("[测试] Verlet积分");
            VerletParticle particle = new VerletParticle(Vector3.up * 10f, 1f, false);
            particle.AddForce(Vector3.down * 9.81f);
            particle.VerletIntegrate(0.01f);

            if (particle.position.y < 10f)
            {
                Debug.Log("  ✓ 重力作用正常: 位置下降");
            }
            else
            {
                Debug.LogError("  ✗ 重力作用异常");
            }
        }

        private void TestDistanceConstraint()
        {
            Debug.Log("[测试] 距离约束");
            VerletParticle p1 = new VerletParticle(Vector3.zero, 1f, true);
            VerletParticle p2 = new VerletParticle(Vector3.right * 3f, 1f, false);
            DistanceConstraint constraint = new DistanceConstraint(p1, p2, 1f, 1000f, 10f);

            for (int i = 0; i < 10; i++)
                constraint.Satisfy();

            float distance = Vector3.Distance(p1.position, p2.position);
            if (Mathf.Abs(distance - 1f) < 0.1f)
            {
                Debug.Log("  ✓ 距离约束收敛正常");
            }
            else
            {
                Debug.LogError($"  ✗ 距离约束失败: 实际距离 {distance:F3}");
            }
        }

        private void TestCableSystem()
        {
            Debug.Log("[测试] 钢丝绳系统");
            CableSystem cableSystem = new CableSystem(50000f, 500f, 0.3f, 0.5f, 30);

            ActorState actor = new ActorState();
            actor.position = new Vector3(0f, 3f, 0f);
            actor.mass = 70f;

            System.Collections.Generic.List<RiggingPoint> points = new System.Collections.Generic.List<RiggingPoint>
            {
                new RiggingPoint(0, new Vector3(-3f, 8f, 0f)),
                new RiggingPoint(1, new Vector3(3f, 8f, 0f))
            };
            points[0].currentCableLength = 5f;
            points[1].currentCableLength = 5f;

            cableSystem.BuildCables(points, actor, new Vector3(0f, 0.3f, 0f));

            if (cableSystem.Cables.Count == 2)
            {
                Debug.Log("  ✓ 钢丝绳构建成功");
            }
            else
            {
                Debug.LogError("  ✗ 钢丝绳构建失败");
            }

            if (cableSystem.ActorParticle != null)
            {
                Debug.Log("  ✓ 演员粒子创建成功");
            }
            else
            {
                Debug.LogError("  ✗ 演员粒子创建失败");
            }
        }

        private void TestBezierCurve()
        {
            Debug.Log("[测试] 贝塞尔曲线");
            TrajectoryController controller = new TrajectoryController();
            Vector3[] controlPoints = new Vector3[]
            {
                new Vector3(0f, 0f, 0f),
                new Vector3(1f, 2f, 0f),
                new Vector3(2f, 2f, 0f),
                new Vector3(3f, 0f, 0f)
            };
            controller.SetBezierControlPoints(controlPoints);
            controller.totalDuration = 10f;

            Vector3 start = controller.EvaluateBezier(0f);
            Vector3 end = controller.EvaluateBezier(10f);

            if (Vector3.Distance(start, controlPoints[0]) < 0.1f &&
                Vector3.Distance(end, controlPoints[3]) < 0.1f)
            {
                Debug.Log("  ✓ 贝塞尔曲线端点正确");
            }
            else
            {
                Debug.LogError("  ✗ 贝塞尔曲线端点错误");
            }

            float pathLength = controller.EstimatePathLength(50);
            Debug.Log($"  路径长度: {pathLength:F2}m");
        }

        private void TestSafetyMonitor()
        {
            Debug.Log("[测试] 安全监测");
            SafetyMonitor monitor = new SafetyMonitor(500f, 3.0f);

            float tensionSafe = 4000f;
            float tensionOverload = 6000f;

            if (monitor.IsTensionSafe(tensionSafe))
            {
                Debug.Log("  ✓ 正常张力判定正确");
            }
            else
            {
                Debug.LogError("  ✗ 正常张力判定错误");
            }

            if (!monitor.IsTensionSafe(tensionOverload))
            {
                Debug.Log("  ✓ 超载张力判定正确");
            }
            else
            {
                Debug.LogError("  ✗ 超载张力判定错误");
            }

            if (monitor.IsDynamicLoadSafe(2.5f) && !monitor.IsDynamicLoadSafe(3.5f))
            {
                Debug.Log("  ✓ 动载系数判定正确");
            }
            else
            {
                Debug.LogError("  ✗ 动载系数判定错误");
            }
        }

        private void TestCollisionDetector()
        {
            Debug.Log("[测试] 碰撞检测");
            System.Collections.Generic.List<CollisionBox> boxes = new System.Collections.Generic.List<CollisionBox>
            {
                new CollisionBox("测试盒", new Bounds(Vector3.zero, Vector3.one * 2f))
            };
            CollisionDetector detector = new CollisionDetector(boxes);

            ActorState actor = new ActorState();
            actor.position = Vector3.zero;
            actor.bounds = new Bounds(Vector3.zero, Vector3.one);

            detector.CheckCollisions(actor);
            if (detector.HasCollision())
            {
                Debug.Log("  ✓ 重叠碰撞检测正确");
            }
            else
            {
                Debug.LogError("  ✗ 重叠碰撞检测失败");
            }

            actor.position = new Vector3(10f, 0f, 0f);
            detector.CheckCollisions(actor);
            if (!detector.HasCollision())
            {
                Debug.Log("  ✓ 远离碰撞检测正确");
            }
            else
            {
                Debug.LogError("  ✗ 远离碰撞检测失败");
            }
        }
    }
}