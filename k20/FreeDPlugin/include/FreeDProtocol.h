#pragma once
#include <cstdint>
#include <vector>

struct FreeDPacketData {
    uint16_t cameraId;
    double pan;
    double tilt;
    double roll;
    double x;
    double y;
    double z;
    double zoom;
    double focus;
    double aperture;
    bool isValid;
};

class FreeDProtocolParser {
public:
    FreeDProtocolParser();
    ~FreeDProtocolParser();

    bool parsePacket(const uint8_t* data, size_t length, FreeDPacketData& outData);

private:
    int32_t decode24BitInt(const uint8_t* data);
    uint16_t decode16BitUInt(const uint8_t* data);
    double convertToDegrees(int32_t value);
    double convertZoom(uint16_t value);
    double convertFocus(uint16_t value);
};
