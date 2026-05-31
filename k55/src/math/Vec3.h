#pragma once
#include <cmath>
#include <algorithm>

struct Vec3 {
    float x, y, z;

    constexpr Vec3() : x(0.0f), y(0.0f), z(0.0f) {}
    constexpr Vec3(float x, float y, float z) : x(x), y(y), z(z) {}
    explicit constexpr Vec3(float s) : x(s), y(s), z(s) {}

    Vec3 operator+(const Vec3& other) const { return Vec3(x + other.x, y + other.y, z + other.z); }
    Vec3 operator-(const Vec3& other) const { return Vec3(x - other.x, y - other.y, z - other.z); }
    Vec3 operator*(float s) const { return Vec3(x * s, y * s, z * s); }
    Vec3 operator/(float s) const { return Vec3(x / s, y / s, z / s); }
    Vec3 operator*(const Vec3& other) const { return Vec3(x * other.x, y * other.y, z * other.z); }
    Vec3 operator/(const Vec3& other) const { return Vec3(x / other.x, y / other.y, z / other.z); }

    Vec3& operator+=(const Vec3& other) { x += other.x; y += other.y; z += other.z; return *this; }
    Vec3& operator-=(const Vec3& other) { x -= other.x; y -= other.y; z -= other.z; return *this; }
    Vec3& operator*=(float s) { x *= s; y *= s; z *= s; return *this; }
    Vec3& operator/=(float s) { x /= s; y /= s; z /= s; return *this; }

    Vec3 operator-() const { return Vec3(-x, -y, -z); }

    float lengthSquared() const { return x * x + y * y + z * z; }
    float length() const { return std::sqrt(lengthSquared()); }

    Vec3 normalized() const {
        float len = length();
        return len > 0.0f ? *this / len : Vec3(0.0f);
    }

    void normalize() {
        float len = length();
        if (len > 0.0f) {
            x /= len; y /= len; z /= len;
        }
    }

    static float dot(const Vec3& a, const Vec3& b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    static Vec3 cross(const Vec3& a, const Vec3& b) {
        return Vec3(
            a.y * b.z - a.z * b.y,
            a.z * b.x - a.x * b.z,
            a.x * b.y - a.y * b.x
        );
    }

    static Vec3 min(const Vec3& a, const Vec3& b) {
        return Vec3(std::min(a.x, b.x), std::min(a.y, b.y), std::min(a.z, b.z));
    }

    static Vec3 max(const Vec3& a, const Vec3& b) {
        return Vec3(std::max(a.x, b.x), std::max(a.y, b.y), std::max(a.z, b.z));
    }

    static Vec3 lerp(const Vec3& a, const Vec3& b, float t) {
        return a + (b - a) * t;
    }
};

inline Vec3 operator*(float s, const Vec3& v) { return v * s; }

struct Vec2 {
    float x, y;

    constexpr Vec2() : x(0.0f), y(0.0f) {}
    constexpr Vec2(float x, float y) : x(x), y(y) {}
    explicit constexpr Vec2(float s) : x(s), y(s) {}

    Vec2 operator+(const Vec2& other) const { return Vec2(x + other.x, y + other.y); }
    Vec2 operator-(const Vec2& other) const { return Vec2(x - other.x, y - other.y); }
    Vec2 operator*(float s) const { return Vec2(x * s, y * s); }
    Vec2 operator/(float s) const { return Vec2(x / s, y / s); }
};

struct Vec4 {
    float x, y, z, w;

    constexpr Vec4() : x(0.0f), y(0.0f), z(0.0f), w(0.0f) {}
    constexpr Vec4(float x, float y, float z, float w) : x(x), y(y), z(z), w(w) {}
    explicit constexpr Vec4(float s) : x(s), y(s), z(s), w(s) {}
    constexpr Vec4(const Vec3& v, float w) : x(v.x), y(v.y), z(v.z), w(w) {}

    Vec3 xyz() const { return Vec3(x, y, z); }
};

struct IVec3 {
    int x, y, z;

    constexpr IVec3() : x(0), y(0), z(0) {}
    constexpr IVec3(int x, int y, int z) : x(x), y(y), z(z) {}
    explicit constexpr IVec3(int s) : x(s), y(s), z(s) {}

    IVec3 operator+(const IVec3& other) const { return IVec3(x + other.x, y + other.y, z + other.z); }
    IVec3 operator-(const IVec3& other) const { return IVec3(x - other.x, y - other.y, z - other.z); }
    IVec3 operator*(int s) const { return IVec3(x * s, y * s, z * s); }

    bool operator==(const IVec3& other) const {
        return x == other.x && y == other.y && z == other.z;
    }

    bool operator!=(const IVec3& other) const { return !(*this == other); }
};

namespace std {
    template<> struct hash<IVec3> {
        size_t operator()(const IVec3& v) const noexcept {
            size_t h1 = hash<int>{}(v.x);
            size_t h2 = hash<int>{}(v.y);
            size_t h3 = hash<int>{}(v.z);
            return h1 ^ (h2 << 1) ^ (h3 << 2);
        }
    };
}
