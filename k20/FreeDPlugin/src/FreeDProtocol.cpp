#include "FreeDProtocol.h"
#include <cstring>
#include <cmath>

FreeDProtocolParser::FreeDProtocolParser() {
}

FreeDProtocolParser::~FreeDProtocolParser() {
}

int32_t FreeDProtocolParser::decode24BitInt(const uint8_t* data) {
    int32_t value = (data[0] << 16) | (data[1] << 8) | data[2];
    if (value & 0x800000) {
        value |= 0xFF000000;
    }
    return value;
}

uint16_t FreeDProtocolParser::decode16BitUInt(const uint8_t* data) {
    return (data[0] << 8) | data[1];
}

double FreeDProtocolParser::convertToDegrees(int32_t value) {
    return static_cast<double>(value) / 32768.0 * 180.0;
}

double FreeDProtocolParser::convertZoom(uint16_t value) {
    return static_cast<double>(value) / 65535.0 * 100.0;
}

double FreeDProtocolParser::convertFocus(uint16_t value) {
    return static_cast<double>(value) / 65535.0 * 100.0;
}

bool FreeDProtocolParser::parsePacket(const uint8_t* data, size_t length, FreeDPacketData& outData) {
    memset(&outData, 0, sizeof(FreeDPacketData));
    outData.isValid = false;

    if (length < 29) {
        return false;
    }

    uint8_t messageType = data[0];

    if (messageType == 0xD1) {
        outData.cameraId = data[1];
        outData.pan = convertToDegrees(decode24BitInt(&data[2]));
        outData.tilt = convertToDegrees(decode24BitInt(&data[5]));
        outData.roll = convertToDegrees(decode24BitInt(&data[8]));
        outData.x = static_cast<double>(decode24BitInt(&data[11])) / 65536.0;
        outData.y = static_cast<double>(decode24BitInt(&data[14])) / 65536.0;
        outData.z = static_cast<double>(decode24BitInt(&data[17])) / 65536.0;
        outData.zoom = convertZoom(decode16BitUInt(&data[20]));
        outData.focus = convertFocus(decode16BitUInt(&data[22]));
        outData.aperture = decode16BitUInt(&data[24]) / 100.0;
        outData.isValid = true;
        return true;
    }

    return false;
}
