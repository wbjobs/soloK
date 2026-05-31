#pragma once

#include <vector>
#include <array>
#include <string>
#include <chrono>
#include <cstdint>

constexpr size_t PRESSURE_CHANNELS = 128;
constexpr size_t BALANCE_CHANNELS = 6;
constexpr size_t MIC_CHANNELS = 32;
constexpr uint32_t SAMPLE_RATE = 2000;

enum class SystemState {
    IDLE = 0,
    STARTING = 1,
    STABILIZING = 2,
    ACQUIRING = 3,
    STOPPING = 4
};

#pragma pack(push, 1)
struct PressureData {
    uint64_t timestamp;
    std::array<float, PRESSURE_CHANNELS> values;
};

struct BalanceData {
    uint64_t timestamp;
    std::array<float, BALANCE_CHANNELS> values;
};

struct MicData {
    uint64_t timestamp;
    std::array<float, MIC_CHANNELS> values;
};
#pragma pack(pop)

struct AeroCoefficients {
    double Cl;
    double Cd;
    double Cm;
    double L_over_D;
};

struct QualityMetrics {
    std::vector<bool> channel_valid;
    std::vector<float> outliers;
    float signal_to_noise;
};
