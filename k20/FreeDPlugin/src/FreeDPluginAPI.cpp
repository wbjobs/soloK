#define FREEDPLUGIN_EXPORTS
#include "FreeDPluginAPI.h"
#include "FreeDProtocol.h"
#include "UDPSocket.h"
#include <unordered_map>
#include <mutex>
#include <memory>
#include <chrono>
#include <cmath>

struct CameraData {
    std::unique_ptr<UDPSocket> socket;
    std::unique_ptr<FreeDProtocolParser> parser;
    FreeDPacketData currentData;
    FreeDPacketData filteredData;
    bool filterEnabled;
    double filterSmoothing;
    bool isConnected;
    std::chrono::steady_clock::time_point lastReceiveTime;
    std::mutex dataMutex;
};

static std::unordered_map<int, std::unique_ptr<CameraData>> s_cameras;
static std::mutex s_camerasMutex;
const int MAX_CAMERAS = 4;
const int CONNECTION_TIMEOUT_MS = 1000;

static double lerp(double a, double b, double t) {
    return a + (b - a) * t;
}

FREEDPLUGIN_API bool FreeD_Initialize(int cameraId, int port, const char* ipAddress) {
    std::lock_guard<std::mutex> lock(s_camerasMutex);

    if (cameraId < 0 || cameraId >= MAX_CAMERAS) {
        return false;
    }

    if (s_cameras.find(cameraId) != s_cameras.end()) {
        FreeD_Shutdown(cameraId);
    }

    auto camera = std::make_unique<CameraData>();
    camera->socket = std::make_unique<UDPSocket>();
    camera->parser = std::make_unique<FreeDProtocolParser>();
    camera->filterEnabled = false;
    camera->filterSmoothing = 0.1;
    camera->isConnected = false;

    std::string ip = ipAddress ? ipAddress : "0.0.0.0";
    if (!camera->socket->bind(port, ip)) {
        return false;
    }

    s_cameras[cameraId] = std::move(camera);
    return true;
}

FREEDPLUGIN_API bool FreeD_Update(int cameraId) {
    std::lock_guard<std::mutex> camLock(s_camerasMutex);

    auto it = s_cameras.find(cameraId);
    if (it == s_cameras.end()) {
        return false;
    }

    CameraData& camera = *it->second;
    std::lock_guard<std::mutex> dataLock(camera.dataMutex);

    const size_t BUFFER_SIZE = 1024;
    uint8_t buffer[BUFFER_SIZE];
    int bytesReceived;
    std::string senderIp;
    int senderPort;

    bool received = camera.socket->receive(buffer, BUFFER_SIZE, bytesReceived, senderIp, senderPort, 0);

    if (received) {
        FreeDPacketData packetData;
        if (camera.parser->parsePacket(buffer, bytesReceived, packetData)) {
            camera.currentData = packetData;
            camera.lastReceiveTime = std::chrono::steady_clock::now();
            camera.isConnected = true;

            if (camera.filterEnabled) {
                double t = camera.filterSmoothing;
                camera.filteredData.pan = lerp(camera.filteredData.pan, camera.currentData.pan, t);
                camera.filteredData.tilt = lerp(camera.filteredData.tilt, camera.currentData.tilt, t);
                camera.filteredData.roll = lerp(camera.filteredData.roll, camera.currentData.roll, t);
                camera.filteredData.x = lerp(camera.filteredData.x, camera.currentData.x, t);
                camera.filteredData.y = lerp(camera.filteredData.y, camera.currentData.y, t);
                camera.filteredData.z = lerp(camera.filteredData.z, camera.currentData.z, t);
                camera.filteredData.zoom = lerp(camera.filteredData.zoom, camera.currentData.zoom, t);
                camera.filteredData.focus = lerp(camera.filteredData.focus, camera.currentData.focus, t);
                camera.filteredData.aperture = lerp(camera.filteredData.aperture, camera.currentData.aperture, t);
                camera.filteredData.isValid = true;
            } else {
                camera.filteredData = camera.currentData;
            }
        }
    }

    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - camera.lastReceiveTime).count();
    if (elapsed > CONNECTION_TIMEOUT_MS) {
        camera.isConnected = false;
    }

    return received;
}

FREEDPLUGIN_API void FreeD_GetCameraData(int cameraId,
    double* pan, double* tilt, double* roll,
    double* x, double* y, double* z,
    double* zoom, double* focus, double* aperture) {

    std::lock_guard<std::mutex> camLock(s_camerasMutex);

    auto it = s_cameras.find(cameraId);
    if (it == s_cameras.end()) {
        if (pan) *pan = 0.0;
        if (tilt) *tilt = 0.0;
        if (roll) *roll = 0.0;
        if (x) *x = 0.0;
        if (y) *y = 0.0;
        if (z) *z = 0.0;
        if (zoom) *zoom = 0.0;
        if (focus) *focus = 0.0;
        if (aperture) *aperture = 0.0;
        return;
    }

    CameraData& camera = *it->second;
    std::lock_guard<std::mutex> dataLock(camera.dataMutex);

    FreeDPacketData& data = camera.filteredData.isValid ? camera.filteredData : camera.currentData;

    if (pan) *pan = data.pan;
    if (tilt) *tilt = data.tilt;
    if (roll) *roll = data.roll;
    if (x) *x = data.x;
    if (y) *y = data.y;
    if (z) *z = data.z;
    if (zoom) *zoom = data.zoom;
    if (focus) *focus = data.focus;
    if (aperture) *aperture = data.aperture;
}

FREEDPLUGIN_API void FreeD_Shutdown(int cameraId) {
    std::lock_guard<std::mutex> lock(s_camerasMutex);

    auto it = s_cameras.find(cameraId);
    if (it != s_cameras.end()) {
        it->second->socket->close();
        s_cameras.erase(it);
    }
}

FREEDPLUGIN_API void FreeD_ShutdownAll() {
    std::lock_guard<std::mutex> lock(s_camerasMutex);

    for (auto& pair : s_cameras) {
        pair.second->socket->close();
    }
    s_cameras.clear();
}

FREEDPLUGIN_API bool FreeD_IsConnected(int cameraId) {
    std::lock_guard<std::mutex> camLock(s_camerasMutex);

    auto it = s_cameras.find(cameraId);
    if (it == s_cameras.end()) {
        return false;
    }

    std::lock_guard<std::mutex> dataLock(it->second->dataMutex);
    return it->second->isConnected;
}

FREEDPLUGIN_API void FreeD_SetFilterEnabled(int cameraId, bool enabled) {
    std::lock_guard<std::mutex> camLock(s_camerasMutex);

    auto it = s_cameras.find(cameraId);
    if (it != s_cameras.end()) {
        std::lock_guard<std::mutex> dataLock(it->second->dataMutex);
        it->second->filterEnabled = enabled;
    }
}

FREEDPLUGIN_API void FreeD_SetFilterSmoothing(int cameraId, double smoothing) {
    std::lock_guard<std::mutex> camLock(s_camerasMutex);

    auto it = s_cameras.find(cameraId);
    if (it != s_cameras.end()) {
        std::lock_guard<std::mutex> dataLock(it->second->dataMutex);
        it->second->filterSmoothing = smoothing;
    }
}
