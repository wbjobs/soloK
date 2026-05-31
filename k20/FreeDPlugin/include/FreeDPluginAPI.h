#pragma once

#ifdef FREEDPLUGIN_EXPORTS
#define FREEDPLUGIN_API __declspec(dllexport)
#else
#define FREEDPLUGIN_API __declspec(dllimport)
#endif

extern "C" {
    FREEDPLUGIN_API bool FreeD_Initialize(int cameraId, int port, const char* ipAddress);
    FREEDPLUGIN_API bool FreeD_Update(int cameraId);
    FREEDPLUGIN_API void FreeD_GetCameraData(int cameraId,
        double* pan, double* tilt, double* roll,
        double* x, double* y, double* z,
        double* zoom, double* focus, double* aperture);
    FREEDPLUGIN_API void FreeD_Shutdown(int cameraId);
    FREEDPLUGIN_API void FreeD_ShutdownAll();
    FREEDPLUGIN_API bool FreeD_IsConnected(int cameraId);
    FREEDPLUGIN_API void FreeD_SetFilterEnabled(int cameraId, bool enabled);
    FREEDPLUGIN_API void FreeD_SetFilterSmoothing(int cameraId, double smoothing);
}
