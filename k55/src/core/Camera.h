#pragma once
#include "../math/Vec3.h"
#include "../math/Mat4.h"
#include "../math/Frustum.h"
#include <QKeyEvent>
#include <QMouseEvent>

class Camera {
public:
    Camera() : position(0.0f, 30.0f, 0.0f), yaw(0.0f), pitch(0.0f),
               fov(70.0f), nearPlane(0.1f), farPlane(1000.0f),
               moveSpeed(30.0f), mouseSensitivity(0.002f),
               aspectRatio(16.0f / 9.0f) {}

    void update(float deltaTime, const bool* keys);

    void handleMouseMove(int dx, int dy);
    void handleMouseWheel(float delta);

    Mat4 getViewMatrix() const;
    Mat4 getProjectionMatrix() const;
    Mat4 getViewProjectionMatrix() const;

    Vec3 getForward() const;
    Vec3 getRight() const;
    Vec3 getUp() const;

    Frustum getFrustum() const;

    void setPosition(const Vec3& pos) { position = pos; }
    Vec3 getPosition() const { return position; }

    void setRotation(float y, float p) { yaw = y; pitch = p; }
    float getYaw() const { return yaw; }
    float getPitch() const { return pitch; }

    void setFov(float f) { fov = f; }
    float getFov() const { return fov; }

    void setAspectRatio(float ar) { aspectRatio = ar; }
    float getAspectRatio() const { return aspectRatio; }

    void setMoveSpeed(float speed) { moveSpeed = speed; }
    float getMoveSpeed() const { return moveSpeed; }

    void setMouseSensitivity(float sensitivity) { mouseSensitivity = sensitivity; }
    float getMouseSensitivity() const { return mouseSensitivity; }

    void raycast(const Vec3& start, const Vec3& dir, float maxDist,
                 bool (*hitTest)(int, int, int, void*), void* userData,
                 Vec3& hitPoint, IVec3& hitVoxel, Vec3& hitNormal, bool& hit);

private:
    Vec3 position;
    float yaw;
    float pitch;
    float fov;
    float nearPlane;
    float farPlane;
    float moveSpeed;
    float mouseSensitivity;
    float aspectRatio;
};
