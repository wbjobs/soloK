using UnityEngine;

namespace TheaterRigging
{
    public class VectorArrowRenderer
    {
        private GameObject arrowRoot;
        private GameObject velocityArrow;
        private GameObject accelerationArrow;
        private GameObject displacementArrow;

        private LineRenderer velocityLR;
        private LineRenderer accelerationLR;
        private LineRenderer displacementLR;

        private TextMesh velocityLabel;
        private TextMesh accelerationLabel;
        private TextMesh displacementLabel;

        private Vector3 initialPosition;
        private bool isInitialized;

        public VectorArrowRenderer()
        {
            arrowRoot = new GameObject("VectorArrows");
            Object.DontDestroyOnLoad(arrowRoot);
            CreateArrowObjects();
        }

        private void CreateArrowObjects()
        {
            velocityArrow = CreateArrow("VelocityArrow", Color.blue, out velocityLR, out velocityLabel);
            accelerationArrow = CreateArrow("AccelerationArrow", Color.red, out accelerationLR, out accelerationLabel);
            displacementArrow = CreateArrow("DisplacementArrow", Color.yellow, out displacementLR, out displacementLabel);

            velocityArrow.transform.SetParent(arrowRoot.transform);
            accelerationArrow.transform.SetParent(arrowRoot.transform);
            displacementArrow.transform.SetParent(arrowRoot.transform);

            velocityArrow.SetActive(false);
            accelerationArrow.SetActive(false);
            displacementArrow.SetActive(false);
        }

        private GameObject CreateArrow(string name, Color color, out LineRenderer lr, out TextMesh label)
        {
            GameObject obj = new GameObject(name);
            lr = obj.AddComponent<LineRenderer>();
            lr.material = new Material(Shader.Find("Standard"));
            lr.material.color = color;
            lr.widthMultiplier = 0.02f;
            lr.useWorldSpace = true;
            lr.numCapVertices = 2;
            lr.numCornerVertices = 2;

            GameObject labelObj = new GameObject("Label");
            labelObj.transform.SetParent(obj.transform);
            label = labelObj.AddComponent<TextMesh>();
            label.characterSize = 0.05f;
            label.fontSize = 24;
            label.color = color;
            label.alignment = TextAlignment.Center;
            label.anchor = TextAnchor.MiddleCenter;

            return obj;
        }

        public void UpdateArrows(ActorState actor)
        {
            if (actor == null) return;

            if (!isInitialized)
            {
                initialPosition = actor.position;
                isInitialized = true;
            }

            UpdateVelocityArrow(actor);
            UpdateAccelerationArrow(actor);
            UpdateDisplacementArrow(actor);
        }

        private void UpdateVelocityArrow(ActorState actor)
        {
            if (actor.velocity.magnitude > 0.1f)
            {
                velocityArrow.SetActive(true);
                DrawArrow(velocityLR, actor.position, actor.velocity, 0.3f);

                if (velocityLabel != null)
                {
                    Vector3 labelPos = actor.position + actor.velocity.normalized * 0.5f;
                    velocityLabel.transform.position = labelPos;
                    velocityLabel.text = $"v={actor.velocity.magnitude:F2}m/s";
                }
            }
            else
            {
                velocityArrow.SetActive(false);
            }
        }

        private void UpdateAccelerationArrow(ActorState actor)
        {
            if (actor.acceleration.magnitude > 0.5f)
            {
                accelerationArrow.SetActive(true);
                DrawArrow(accelerationLR, actor.position, actor.acceleration, 0.2f);

                if (accelerationLabel != null)
                {
                    Vector3 labelPos = actor.position + actor.acceleration.normalized * 0.5f;
                    accelerationLabel.transform.position = labelPos;
                    accelerationLabel.text = $"a={actor.acceleration.magnitude:F2}m/s²";
                }
            }
            else
            {
                accelerationArrow.SetActive(false);
            }
        }

        private void UpdateDisplacementArrow(ActorState actor)
        {
            Vector3 displacement = actor.position - initialPosition;
            if (displacement.magnitude > 0.1f)
            {
                displacementArrow.SetActive(true);
                DrawArrow(displacementLR, initialPosition, displacement, 0.15f);

                if (displacementLabel != null)
                {
                    Vector3 labelPos = actor.position + Vector3.up * 0.3f;
                    displacementLabel.transform.position = labelPos;
                    displacementLabel.text = $"d={displacement.magnitude:F2}m";
                }
            }
            else
            {
                displacementArrow.SetActive(false);
            }
        }

        private void DrawArrow(LineRenderer lr, Vector3 origin, Vector3 direction, float scale)
        {
            Vector3 endPoint = origin + direction * scale;
            lr.positionCount = 2;
            lr.SetPosition(0, origin);
            lr.SetPosition(1, endPoint);

            Vector3 arrowDir = direction.normalized;
            Vector3 right = Vector3.Cross(arrowDir, Vector3.up);
            if (right.magnitude < 0.001f) right = Vector3.Cross(arrowDir, Vector3.right);
            right.Normalize();

            Vector3 arrowTip1 = endPoint - arrowDir * 0.1f + right * 0.05f;
            Vector3 arrowTip2 = endPoint - arrowDir * 0.1f - right * 0.05f;

            lr.positionCount = 4;
            lr.SetPosition(0, origin);
            lr.SetPosition(1, endPoint);
            lr.SetPosition(2, arrowTip1);
            lr.SetPosition(3, endPoint);
        }

        public void SetVisible(bool visible)
        {
            velocityArrow.SetActive(visible);
            accelerationArrow.SetActive(visible);
            displacementArrow.SetActive(visible);
        }

        public void ResetInitialPosition(Vector3 pos)
        {
            initialPosition = pos;
        }
    }
}