using UnityEngine;

namespace TheaterRigging
{
    public class StageSceneBuilder : MonoBehaviour
    {
        public static StageSceneBuilder Instance { get; private set; }

        private GameObject stageRoot;
        private GameObject sceneryRoot;
        private GameObject orchestraPit;
        private GameObject lightingRoot;

        public void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        public void BuildStage()
        {
            CreateStageRoot();
            CreateStageFloor();
            CreateBackdrop();
            CreateSideWings();
            CreateOrchestraPit();
            CreateLighting();
            CreateScenery();
        }

        private void CreateStageRoot()
        {
            stageRoot = new GameObject("Stage");
            stageRoot.transform.position = Vector3.zero;
        }

        private void CreateStageFloor()
        {
            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Cube);
            floor.name = "StageFloor";
            floor.transform.SetParent(stageRoot.transform);
            floor.transform.position = new Vector3(0f, -0.1f, 0f);
            floor.transform.localScale = new Vector3(15f, 0.2f, 8f);

            Renderer renderer = floor.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material = new Material(Shader.Find("Standard"));
                renderer.material.color = new Color(0.4f, 0.3f, 0.25f);
            }
        }

        private void CreateBackdrop()
        {
            GameObject backdrop = GameObject.CreatePrimitive(PrimitiveType.Cube);
            backdrop.name = "Backdrop";
            backdrop.transform.SetParent(stageRoot.transform);
            backdrop.transform.position = new Vector3(0f, 4f, -4f);
            backdrop.transform.localScale = new Vector3(15f, 8f, 0.3f);

            Renderer renderer = backdrop.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material = new Material(Shader.Find("Standard"));
                renderer.material.color = new Color(0.2f, 0.2f, 0.3f);
            }
        }

        private void CreateSideWings()
        {
            GameObject leftWing = GameObject.CreatePrimitive(PrimitiveType.Cube);
            leftWing.name = "LeftWing";
            leftWing.transform.SetParent(stageRoot.transform);
            leftWing.transform.position = new Vector3(-7f, 4f, 0f);
            leftWing.transform.localScale = new Vector3(0.5f, 8f, 8f);

            GameObject rightWing = GameObject.CreatePrimitive(PrimitiveType.Cube);
            rightWing.name = "RightWing";
            rightWing.transform.SetParent(stageRoot.transform);
            rightWing.transform.position = new Vector3(7f, 4f, 0f);
            rightWing.transform.localScale = new Vector3(0.5f, 8f, 8f);

            Material wingMaterial = new Material(Shader.Find("Standard"));
            wingMaterial.color = new Color(0.3f, 0.25f, 0.2f);
            leftWing.GetComponent<Renderer>().material = wingMaterial;
            rightWing.GetComponent<Renderer>().material = wingMaterial;
        }

        private void CreateOrchestraPit()
        {
            orchestraPit = new GameObject("OrchestraPit");
            orchestraPit.transform.SetParent(stageRoot.transform);
            orchestraPit.transform.position = new Vector3(0f, -2f, 4f);

            GameObject pitFloor = GameObject.CreatePrimitive(PrimitiveType.Cube);
            pitFloor.name = "PitFloor";
            pitFloor.transform.SetParent(orchestraPit.transform);
            pitFloor.transform.position = new Vector3(0f, -2.5f, 4f);
            pitFloor.transform.localScale = new Vector3(12f, 0.2f, 3f);

            Renderer renderer = pitFloor.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material = new Material(Shader.Find("Standard"));
                renderer.material.color = new Color(0.15f, 0.1f, 0.1f);
            }

            Collider collider = pitFloor.GetComponent<Collider>();
            if (collider != null)
            {
                Bounds pitBounds = new Bounds(pitFloor.transform.position, pitFloor.transform.localScale);
                if (SimulationManager.Instance != null)
                {
                    SimulationManager.Instance.AddCollisionBox("乐队池", pitBounds);
                }
            }
        }

        private void CreateLighting()
        {
            lightingRoot = new GameObject("Lighting");
            lightingRoot.transform.SetParent(stageRoot.transform);

            GameObject frontLight = new GameObject("FrontLight");
            frontLight.transform.SetParent(lightingRoot.transform);
            frontLight.transform.position = new Vector3(0f, 8f, 6f);
            Light frontLightComponent = frontLight.AddComponent<Light>();
            frontLightComponent.type = LightType.Spot;
            frontLightComponent.color = Color.white;
            frontLightComponent.intensity = 2f;
            frontLightComponent.spotAngle = 60f;
            frontLight.transform.rotation = Quaternion.Euler(60f, 0f, 0f);

            GameObject leftLight = new GameObject("LeftLight");
            leftLight.transform.SetParent(lightingRoot.transform);
            leftLight.transform.position = new Vector3(-5f, 7f, 3f);
            Light leftLightComponent = leftLight.AddComponent<Light>();
            leftLightComponent.type = LightType.Spot;
            leftLightComponent.color = new Color(0.8f, 0.7f, 1f);
            leftLightComponent.intensity = 1.5f;
            leftLightComponent.spotAngle = 45f;
            leftLight.transform.rotation = Quaternion.Euler(45f, 30f, 0f);

            GameObject rightLight = new GameObject("RightLight");
            rightLight.transform.SetParent(lightingRoot.transform);
            rightLight.transform.position = new Vector3(5f, 7f, 3f);
            Light rightLightComponent = rightLight.AddComponent<Light>();
            rightLightComponent.type = LightType.Spot;
            rightLightComponent.color = new Color(1f, 0.8f, 0.7f);
            rightLightComponent.intensity = 1.5f;
            rightLightComponent.spotAngle = 45f;
            rightLight.transform.rotation = Quaternion.Euler(45f, -30f, 0f);
        }

        private void CreateScenery()
        {
            sceneryRoot = new GameObject("Scenery");
            sceneryRoot.transform.SetParent(stageRoot.transform);

            CreateSceneryElement("柱子1", new Vector3(-4f, 1.5f, -2f), new Vector3(0.5f, 3f, 0.5f), new Color(0.6f, 0.5f, 0.4f));
            CreateSceneryElement("柱子2", new Vector3(4f, 1.5f, -2f), new Vector3(0.5f, 3f, 0.5f), new Color(0.6f, 0.5f, 0.4f));
            CreateSceneryElement("道具台", new Vector3(0f, 0.5f, -1f), new Vector3(2f, 1f, 1.5f), new Color(0.5f, 0.4f, 0.3f));
            CreateSceneryElement("背景道具", new Vector3(0f, 2.5f, -3f), new Vector3(3f, 2f, 0.3f), new Color(0.35f, 0.3f, 0.25f));
        }

        private void CreateSceneryElement(string name, Vector3 position, Vector3 scale, Color color)
        {
            GameObject element = GameObject.CreatePrimitive(PrimitiveType.Cube);
            element.name = name;
            element.transform.SetParent(sceneryRoot.transform);
            element.transform.position = position;
            element.transform.localScale = scale;

            Renderer renderer = element.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material = new Material(Shader.Find("Standard"));
                renderer.material.color = color;
            }

            if (SimulationManager.Instance != null)
            {
                Bounds bounds = new Bounds(position, scale);
                SimulationManager.Instance.AddCollisionBox(name, bounds);
            }
        }

        public void RebuildStage()
        {
            if (stageRoot != null)
            {
                Destroy(stageRoot);
            }
            BuildStage();
        }
    }
}