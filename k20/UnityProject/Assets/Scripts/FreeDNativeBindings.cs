using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace VirtualProduction
{
    public static class FreeDNativeBindings
    {
        private const string DLL_NAME = "FreeDPlugin";

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        public static extern bool FreeD_Initialize(int cameraId, int port, string ipAddress);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        public static extern bool FreeD_Update(int cameraId);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        public static extern void FreeD_GetCameraData(int cameraId,
            out double pan, out double tilt, out double roll,
            out double x, out double y, out double z,
            out double zoom, out double focus, out double aperture);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        public static extern void FreeD_Shutdown(int cameraId);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        public static extern void FreeD_ShutdownAll();

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        public static extern bool FreeD_IsConnected(int cameraId);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        public static extern void FreeD_SetFilterEnabled(int cameraId, bool enabled);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        public static extern void FreeD_SetFilterSmoothing(int cameraId, double smoothing);
    }

    [Serializable]
    public struct FreeDCameraData
    {
        public double Pan;
        public double Tilt;
        public double Roll;
        public double X;
        public double Y;
        public double Z;
        public double Zoom;
        public double Focus;
        public double Aperture;

        public Vector3 Position => new Vector3((float)X, (float)Y, (float)Z);
        public Vector3 RotationEuler => new Vector3((float)Tilt, (float)Pan, (float)Roll);
        public Quaternion Rotation => Quaternion.Euler(RotationEuler);
    }
}
