#pragma once
#include "../math/Vec3.h"
#include <vector>
#include <random>
#include <algorithm>

class PerlinNoise {
public:
    PerlinNoise(unsigned int seed = 0) {
        permutation.resize(512);
        std::vector<int> p(256);
        for (int i = 0; i < 256; i++) p[i] = i;

        std::mt19937 rng(seed);
        std::shuffle(p.begin(), p.end(), rng);

        for (int i = 0; i < 512; i++) permutation[i] = p[i & 255];
    }

    float noise(float x, float y, float z) const {
        int X = static_cast<int>(std::floor(x)) & 255;
        int Y = static_cast<int>(std::floor(y)) & 255;
        int Z = static_cast<int>(std::floor(z)) & 255;

        x -= std::floor(x);
        y -= std::floor(y);
        z -= std::floor(z);

        float u = fade(x);
        float v = fade(y);
        float w = fade(z);

        int A = permutation[X] + Y;
        int AA = permutation[A] + Z;
        int AB = permutation[A + 1] + Z;
        int B = permutation[X + 1] + Y;
        int BA = permutation[B] + Z;
        int BB = permutation[B + 1] + Z;

        return lerp(w,
            lerp(v,
                lerp(u, grad(permutation[AA], x, y, z), grad(permutation[BA], x - 1, y, z)),
                lerp(u, grad(permutation[AB], x, y - 1, z), grad(permutation[BB], x - 1, y - 1, z))),
            lerp(v,
                lerp(u, grad(permutation[AA + 1], x, y, z - 1), grad(permutation[BA + 1], x - 1, y, z - 1)),
                lerp(u, grad(permutation[AB + 1], x, y - 1, z - 1), grad(permutation[BB + 1], x - 1, y - 1, z - 1)))
        );
    }

    float noise2D(float x, float y) const {
        return noise(x, y, 0.0f);
    }

    float fbm(float x, float y, int octaves = 6, float persistence = 0.5f, float lacunarity = 2.0f) const {
        float value = 0.0f;
        float amplitude = 1.0f;
        float frequency = 1.0f;
        float maxValue = 0.0f;

        for (int i = 0; i < octaves; i++) {
            value += amplitude * noise2D(x * frequency, y * frequency);
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / maxValue;
    }

    float ridgedMulti(float x, float y, int octaves = 6, float persistence = 0.5f, float lacunarity = 2.0f) const {
        float value = 0.0f;
        float amplitude = 1.0f;
        float frequency = 1.0f;
        float maxValue = 0.0f;

        for (int i = 0; i < octaves; i++) {
            float n = noise2D(x * frequency, y * frequency);
            n = 1.0f - std::abs(n);
            n *= n;
            value += n * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / maxValue;
    }

private:
    std::vector<int> permutation;

    static float fade(float t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    static float lerp(float t, float a, float b) {
        return a + t * (b - a);
    }

    static float grad(int hash, float x, float y, float z) {
        int h = hash & 15;
        float u = h < 8 ? x : y;
        float v = h < 4 ? y : (h == 12 || h == 14) ? x : z;
        return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
    }
};
