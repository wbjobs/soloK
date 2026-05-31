#include "Camera.h"
#include <algorithm>
#include <cmath>

void Camera::update(float deltaTime, const bool* keys) {
    Vec3 forward = getForward();
    Vec3 right = getRight();
    Vec3 up(0.0f, 1.0f, 0.0f);

    float speed = moveSpeed * deltaTime;
    if (keys[Qt::Key_Shift]) speed *= 2.5f;

    if (keys[Qt::Key_W]) position += forward * speed;
    if (keys[Qt::Key_S]) position -= forward * speed;
    if (keys[Qt::Key_A]) position -= right * speed;
    if (keys[Qt::Key_D]) position += right * speed;
    if (keys[Qt::Key_Q]) position -= up * speed;
    if (keys[Qt::Key_E]) position += up * speed;
    if (keys[Qt::Key_Space]) position += up * speed;
    if (keys[Qt::Key_Control]) position -= up * speed;
}

void Camera::handleMouseMove(int dx, int dy) {
    yaw -= dx * mouseSensitivity;
    pitch -= dy * mouseSensitivity;

    const float maxPitch = 1.55f;
    pitch = std::clamp(pitch, -maxPitch, maxPitch);

    while (yaw > 3.14159265359f * 2.0f) yaw -= 3.14159265359f * 2.0f;
    while (yaw < 0.0f) yaw += 3.14159265359f * 2.0f;
}

void Camera::handleMouseWheel(float delta) {
    fov -= delta * 0.01f;
    fov = std::clamp(fov, 30.0f, 110.0f);
}

Vec3 Camera::getForward() const {
    return Vec3(
        std::sin(yaw) * std::cos(pitch),
        std::sin(pitch),
        -std::cos(yaw) * std::cos(pitch)
    ).normalized();
}

Vec3 Camera::getRight() const {
    Vec3 forward = getForward();
    Vec3 worldUp(0.0f, 1.0f, 0.0f);
    return Vec3::cross(forward, worldUp).normalized();
}

Vec3 Camera::getUp() const {
    Vec3 forward = getForward();
    Vec3 right = getRight();
    return Vec3::cross(right, forward).normalized();
}

Mat4 Camera::getViewMatrix() const {
    Vec3 target = position + getForward();
    Vec3 worldUp(0.0f, 1.0f, 0.0f);
    return Mat4::lookAt(position, target, worldUp);
}

Mat4 Camera::getProjectionMatrix() const {
    return Mat4::perspective(fov * 3.14159265359f / 180.0f, aspectRatio, nearPlane, farPlane);
}

Mat4 Camera::getViewProjectionMatrix() const {
    return getProjectionMatrix() * getViewMatrix();
}

Frustum Camera::getFrustum() const {
    return Frustum::fromMatrix(getViewProjectionMatrix());
}

void Camera::raycast(const Vec3& start, const Vec3& dir, float maxDist,
                     bool (*hitTest)(int, int, int, void*), void* userData,
                     Vec3& hitPoint, IVec3& hitVoxel, Vec3& hitNormal, bool& hit) {
    hit = false;

    Vec3 current = start;
    Vec3 stepDir(
        dir.x > 0.0f ? 1.0f : -1.0f,
        dir.y > 0.0f ? 1.0f : -1.0f,
        dir.z > 0.0f ? 1.0f : -1.0f
    );

    Vec3 tMax(
        std::numeric_limits<float>::max(),
        std::numeric_limits<float>::max(),
        std::numeric_limits<float>::max()
    );
    Vec3 tDelta(
        std::abs(dir.x) > 1e-8f ? 1.0f / std::abs(dir.x) : std::numeric_limits<float>::max(),
        std::abs(dir.y) > 1e-8f ? 1.0f / std::abs(dir.y) : std::numeric_limits<float>::max(),
        std::abs(dir.z) > 1e-8f ? 1.0f / std::abs(dir.z) : std::numeric_limits<float>::max()
    );

    IVec3 voxel(
        static_cast<int>(std::floor(start.x)),
        static_cast<int>(std::floor(start.y)),
        static_cast<int>(std::floor(start.z))
    );

    for (int i = 0; i < 3; i++) {
        float voxelBoundary = (&voxel.x)[i] + (stepDir.x > 0.0f ? 1.0f : 0.0f);
        float d = voxelBoundary - (&start.x)[i];
        if (std::abs((&dir.x)[i]) > 1e-8f) {
            (&tMax.x)[i] = d / (&dir.x)[i];
        }
    }

    float t = 0.0f;
    int steps = 0;
    const int maxSteps = static_cast<int>(maxDist * 3.0f);

    while (t < maxDist && steps < maxSteps) {
        if (hitTest(voxel.x, voxel.y, voxel.z, userData)) {
            hit = true;
            hitVoxel = voxel;
            hitPoint = start + dir * t;
            if (tMax.x < tMax.y && tMax.x < tMax.z) {
                hitNormal = Vec3(-stepDir.x, 0.0f, 0.0f);
            } else if (tMax.y < tMax.z) {
                hitNormal = Vec3(0.0f, -stepDir.y, 0.0f);
            } else {
                hitNormal = Vec3(0.0f, 0.0f, -stepDir.z);
            }
            return;
        }

        if (tMax.x < tMax.y && tMax.x < tMax.z) {
            voxel.x += static_cast<int>(stepDir.x);
            t = tMax.x;
            tMax.x += tDelta.x;
        } else if (tMax.y < tMax.z) {
            voxel.y += static_cast<int>(stepDir.y);
            t = tMax.y;
            tMax.y += tDelta.y;
        } else {
            voxel.z += static_cast<int>(stepDir.z);
            t = tMax.z;
            tMax.z += tDelta.z;
        }

        steps++;
    }
}
