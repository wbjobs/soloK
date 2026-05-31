#pragma once
#include "Vec3.h"
#include "Mat4.h"

struct Plane {
    Vec3 normal;
    float d;

    Plane() : normal(0.0f, 1.0f, 0.0f), d(0.0f) {}
    Plane(const Vec3& n, float dist) : normal(n.normalized()), d(dist) {}
    Plane(const Vec3& p0, const Vec3& p1, const Vec3& p2) {
        Vec3 v1 = p1 - p0;
        Vec3 v2 = p2 - p0;
        normal = Vec3::cross(v1, v2).normalized();
        d = -Vec3::dot(normal, p0);
    }

    float distance(const Vec3& p) const {
        return Vec3::dot(normal, p) + d;
    }
};

struct AABB {
    Vec3 min;
    Vec3 max;

    AABB() : min(0.0f), max(0.0f) {}
    AABB(const Vec3& mn, const Vec3& mx) : min(mn), max(mx) {}

    bool contains(const Vec3& p) const {
        return p.x >= min.x && p.x <= max.x &&
               p.y >= min.y && p.y <= max.y &&
               p.z >= min.z && p.z <= max.z;
    }

    bool intersects(const AABB& other) const {
        return min.x <= other.max.x && max.x >= other.min.x &&
               min.y <= other.max.y && max.y >= other.min.y &&
               min.z <= other.max.z && max.z >= other.min.z;
    }

    Vec3 center() const {
        return (min + max) * 0.5f;
    }

    Vec3 extents() const {
        return (max - min) * 0.5f;
    }
};

struct Frustum {
    enum Planes {
        NEAR = 0,
        FAR = 1,
        LEFT = 2,
        RIGHT = 3,
        TOP = 4,
        BOTTOM = 5,
        PLANE_COUNT = 6
    };

    Plane planes[PLANE_COUNT];

    static Frustum fromMatrix(const Mat4& vp) {
        Frustum f;

        f.planes[LEFT].normal.x = vp.m[0][3] + vp.m[0][0];
        f.planes[LEFT].normal.y = vp.m[1][3] + vp.m[1][0];
        f.planes[LEFT].normal.z = vp.m[2][3] + vp.m[2][0];
        f.planes[LEFT].d = vp.m[3][3] + vp.m[3][0];

        f.planes[RIGHT].normal.x = vp.m[0][3] - vp.m[0][0];
        f.planes[RIGHT].normal.y = vp.m[1][3] - vp.m[1][0];
        f.planes[RIGHT].normal.z = vp.m[2][3] - vp.m[2][0];
        f.planes[RIGHT].d = vp.m[3][3] - vp.m[3][0];

        f.planes[BOTTOM].normal.x = vp.m[0][3] + vp.m[0][1];
        f.planes[BOTTOM].normal.y = vp.m[1][3] + vp.m[1][1];
        f.planes[BOTTOM].normal.z = vp.m[2][3] + vp.m[2][1];
        f.planes[BOTTOM].d = vp.m[3][3] + vp.m[3][1];

        f.planes[TOP].normal.x = vp.m[0][3] - vp.m[0][1];
        f.planes[TOP].normal.y = vp.m[1][3] - vp.m[1][1];
        f.planes[TOP].normal.z = vp.m[2][3] - vp.m[2][1];
        f.planes[TOP].d = vp.m[3][3] - vp.m[3][1];

        f.planes[NEAR].normal.x = vp.m[0][3] + vp.m[0][2];
        f.planes[NEAR].normal.y = vp.m[1][3] + vp.m[1][2];
        f.planes[NEAR].normal.z = vp.m[2][3] + vp.m[2][2];
        f.planes[NEAR].d = vp.m[3][3] + vp.m[3][2];

        f.planes[FAR].normal.x = vp.m[0][3] - vp.m[0][2];
        f.planes[FAR].normal.y = vp.m[1][3] - vp.m[1][2];
        f.planes[FAR].normal.z = vp.m[2][3] - vp.m[2][2];
        f.planes[FAR].d = vp.m[3][3] - vp.m[3][2];

        for (int i = 0; i < PLANE_COUNT; i++) {
            float len = f.planes[i].normal.length();
            f.planes[i].normal /= len;
            f.planes[i].d /= len;
        }

        return f;
    }

    bool isAABBVisible(const AABB& aabb) const {
        Vec3 corners[8] = {
            Vec3(aabb.min.x, aabb.min.y, aabb.min.z),
            Vec3(aabb.max.x, aabb.min.y, aabb.min.z),
            Vec3(aabb.min.x, aabb.max.y, aabb.min.z),
            Vec3(aabb.max.x, aabb.max.y, aabb.min.z),
            Vec3(aabb.min.x, aabb.min.y, aabb.max.z),
            Vec3(aabb.max.x, aabb.min.y, aabb.max.z),
            Vec3(aabb.min.x, aabb.max.y, aabb.max.z),
            Vec3(aabb.max.x, aabb.max.y, aabb.max.z),
        };

        for (int i = 0; i < PLANE_COUNT; i++) {
            bool allOutside = true;
            for (int j = 0; j < 8; j++) {
                if (planes[i].distance(corners[j]) >= 0.0f) {
                    allOutside = false;
                    break;
                }
            }
            if (allOutside) return false;
        }
        return true;
    }

    bool isSphereVisible(const Vec3& center, float radius) const {
        for (int i = 0; i < PLANE_COUNT; i++) {
            if (planes[i].distance(center) < -radius) {
                return false;
            }
        }
        return true;
    }
};
