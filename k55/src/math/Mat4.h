#pragma once
#include "Vec3.h"

struct Mat4 {
    float m[4][4];

    Mat4() {
        for (int i = 0; i < 4; i++)
            for (int j = 0; j < 4; j++)
                m[i][j] = 0.0f;
    }

    static Mat4 identity() {
        Mat4 result;
        for (int i = 0; i < 4; i++)
            result.m[i][i] = 1.0f;
        return result;
    }

    Mat4 operator*(const Mat4& other) const {
        Mat4 result;
        for (int i = 0; i < 4; i++) {
            for (int j = 0; j < 4; j++) {
                for (int k = 0; k < 4; k++) {
                    result.m[i][j] += m[i][k] * other.m[k][j];
                }
            }
        }
        return result;
    }

    Vec3 transformPoint(const Vec3& p) const {
        float w = m[3][0] * p.x + m[3][1] * p.y + m[3][2] * p.z + m[3][3];
        return Vec3(
            (m[0][0] * p.x + m[0][1] * p.y + m[0][2] * p.z + m[0][3]) / w,
            (m[1][0] * p.x + m[1][1] * p.y + m[1][2] * p.z + m[1][3]) / w,
            (m[2][0] * p.x + m[2][1] * p.y + m[2][2] * p.z + m[2][3]) / w
        );
    }

    Vec3 transformVector(const Vec3& v) const {
        return Vec3(
            m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
            m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
            m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
        );
    }

    static Mat4 translate(const Vec3& t) {
        Mat4 result = identity();
        result.m[0][3] = t.x;
        result.m[1][3] = t.y;
        result.m[2][3] = t.z;
        return result;
    }

    static Mat4 scale(const Vec3& s) {
        Mat4 result = identity();
        result.m[0][0] = s.x;
        result.m[1][1] = s.y;
        result.m[2][2] = s.z;
        return result;
    }

    static Mat4 rotateX(float angle) {
        Mat4 result = identity();
        float c = std::cos(angle);
        float s = std::sin(angle);
        result.m[1][1] = c;
        result.m[1][2] = -s;
        result.m[2][1] = s;
        result.m[2][2] = c;
        return result;
    }

    static Mat4 rotateY(float angle) {
        Mat4 result = identity();
        float c = std::cos(angle);
        float s = std::sin(angle);
        result.m[0][0] = c;
        result.m[0][2] = s;
        result.m[2][0] = -s;
        result.m[2][2] = c;
        return result;
    }

    static Mat4 rotateZ(float angle) {
        Mat4 result = identity();
        float c = std::cos(angle);
        float s = std::sin(angle);
        result.m[0][0] = c;
        result.m[0][1] = -s;
        result.m[1][0] = s;
        result.m[1][1] = c;
        return result;
    }

    static Mat4 perspective(float fovY, float aspect, float near, float far) {
        Mat4 result;
        float f = 1.0f / std::tan(fovY / 2.0f);
        result.m[0][0] = f / aspect;
        result.m[1][1] = f;
        result.m[2][2] = (far + near) / (near - far);
        result.m[2][3] = (2.0f * far * near) / (near - far);
        result.m[3][2] = -1.0f;
        return result;
    }

    static Mat4 ortho(float left, float right, float bottom, float top, float near, float far) {
        Mat4 result = identity();
        result.m[0][0] = 2.0f / (right - left);
        result.m[1][1] = 2.0f / (top - bottom);
        result.m[2][2] = 2.0f / (near - far);
        result.m[0][3] = -(right + left) / (right - left);
        result.m[1][3] = -(top + bottom) / (top - bottom);
        result.m[2][3] = -(far + near) / (far - near);
        return result;
    }

    static Mat4 lookAt(const Vec3& eye, const Vec3& target, const Vec3& up) {
        Vec3 f = (target - eye).normalized();
        Vec3 s = Vec3::cross(f, up).normalized();
        Vec3 u = Vec3::cross(s, f);

        Mat4 result;
        result.m[0][0] = s.x;
        result.m[0][1] = s.y;
        result.m[0][2] = s.z;
        result.m[0][3] = -Vec3::dot(s, eye);
        result.m[1][0] = u.x;
        result.m[1][1] = u.y;
        result.m[1][2] = u.z;
        result.m[1][3] = -Vec3::dot(u, eye);
        result.m[2][0] = -f.x;
        result.m[2][1] = -f.y;
        result.m[2][2] = -f.z;
        result.m[2][3] = Vec3::dot(f, eye);
        result.m[3][3] = 1.0f;
        return result;
    }

    Mat4 transpose() const {
        Mat4 result;
        for (int i = 0; i < 4; i++)
            for (int j = 0; j < 4; j++)
                result.m[i][j] = m[j][i];
        return result;
    }

    float* data() { return &m[0][0]; }
    const float* data() const { return &m[0][0]; }
};

struct Quat {
    float x, y, z, w;

    Quat() : x(0.0f), y(0.0f), z(0.0f), w(1.0f) {}
    Quat(float x, float y, float z, float w) : x(x), y(y), z(z), w(w) {}

    static Quat fromEuler(float pitch, float yaw, float roll) {
        float cy = std::cos(yaw * 0.5f);
        float sy = std::sin(yaw * 0.5f);
        float cp = std::cos(pitch * 0.5f);
        float sp = std::sin(pitch * 0.5f);
        float cr = std::cos(roll * 0.5f);
        float sr = std::sin(roll * 0.5f);

        return Quat(
            sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy,
            cr * cp * sy - sr * sp * cy,
            cr * cp * cy + sr * sp * sy
        );
    }

    Vec3 rotate(const Vec3& v) const {
        Quat qv(v.x, v.y, v.z, 0.0f);
        Quat result = (*this) * qv * conjugate();
        return Vec3(result.x, result.y, result.z);
    }

    Quat operator*(const Quat& other) const {
        return Quat(
            w * other.x + x * other.w + y * other.z - z * other.y,
            w * other.y - x * other.z + y * other.w + z * other.x,
            w * other.z + x * other.y - y * other.x + z * other.w,
            w * other.w - x * other.x - y * other.y - z * other.z
        );
    }

    Quat conjugate() const {
        return Quat(-x, -y, -z, w);
    }

    Mat4 toMat4() const {
        Mat4 result = Mat4::identity();
        float xx = x * x, yy = y * y, zz = z * z;
        float xy = x * y, xz = x * z, yz = y * z;
        float wx = w * x, wy = w * y, wz = w * z;

        result.m[0][0] = 1.0f - 2.0f * (yy + zz);
        result.m[0][1] = 2.0f * (xy - wz);
        result.m[0][2] = 2.0f * (xz + wy);
        result.m[1][0] = 2.0f * (xy + wz);
        result.m[1][1] = 1.0f - 2.0f * (xx + zz);
        result.m[1][2] = 2.0f * (yz - wx);
        result.m[2][0] = 2.0f * (xz - wy);
        result.m[2][1] = 2.0f * (yz + wx);
        result.m[2][2] = 1.0f - 2.0f * (xx + yy);
        return result;
    }
};
