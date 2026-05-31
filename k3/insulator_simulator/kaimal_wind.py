"""
随机脉动风模型 - Kaimal谱

参考标准: IEC 61400-1, DNV-RP-C102
实现内容:
  - Kaimal 风速谱生成
  - 顺风向脉动风速时程
  - 湍流强度参数化
"""

import numpy as np
from scipy import signal

DEFAULT_DT = 0.25
DEFAULT_DURATION = 600.0
KAIMAL_U_STAR = 2.5


def kaimal_spectrum(freq: np.ndarray, mean_speed: float,
                     turbulence_intensity: float,
                     height: float = 20.0) -> np.ndarray:
    """
    Kaimal 顺风向风速谱

    S_u(f) = (σ_u² * 6.868 * f * L / U) / (1 + 10.32 * f * L / U)^(5/3)

    其中:
      L = 100 * (z / 10)^0.3  - 湍流积分尺度
      σ_u = TI * U_mean      - 脉动风速标准差
    """
    L = 100.0 * (height / 10.0) ** 0.3
    sigma_u = turbulence_intensity * mean_speed

    fL_U = freq * L / max(mean_speed, 1e-3)
    fL_U = np.maximum(fL_U, 1e-8)

    numerator = sigma_u ** 2 * 6.868 * fL_U
    denominator = (1.0 + 10.32 * fL_U) ** (5.0 / 3.0)

    S = numerator / denominator
    return S


def generate_wind_speed_series(mean_speed: float,
                                 turbulence_intensity: float = 0.12,
                                 duration: float = DEFAULT_DURATION,
                                 dt: float = DEFAULT_DT,
                                 height: float = 20.0,
                                 seed: int | None = None) -> dict:
    """
    基于 Kaimal 谱生成脉动风速时程

    方法:
      1. 生成目标功率谱
      2. 频域采样 + 随机相位
      3. IFFT 转换到时域
      4. 均值和方差校正

    参数:
        mean_speed: 平均风速 (m/s)
        turbulence_intensity: 湍流强度 (0.05-0.30)
        duration: 模拟时长 (s), 默认 600s = 10min
        dt: 时间步长 (s), 默认 0.25s
        height: 离地高度 (m)
        seed: 随机数种子

    返回:
        dict: 包含时间、风速、脉动风速、频谱等
    """
    if seed is not None:
        np.random.seed(seed)

    n = int(duration / dt)
    n = 2 ** int(np.ceil(np.log2(n)))
    t = np.arange(n) * dt

    freq = np.fft.fftfreq(n, d=dt)
    pos_freq = np.abs(freq[:n // 2 + 1])

    S = kaimal_spectrum(pos_freq, mean_speed, turbulence_intensity, height)
    S[0] = 0.0

    amp = np.sqrt(S * n / (2.0 * dt))
    phase = np.random.rand(n // 2 + 1) * 2.0 * np.pi

    u_fft_pos = amp * (np.cos(phase) + 1j * np.sin(phase))
    u_fft = np.zeros(n, dtype=np.complex128)
    u_fft[:n // 2 + 1] = u_fft_pos
    u_fft[n // 2 + 1:] = np.conj(u_fft_pos[1:-1][::-1])

    u_fluc = np.fft.ifft(u_fft).real

    target_std = turbulence_intensity * mean_speed
    current_std = np.std(u_fluc)
    if current_std > 1e-6:
        u_fluc = u_fluc * (target_std / current_std)

    u_total = mean_speed + u_fluc
    u_total = np.maximum(u_total, 0.0)

    actual_mean = np.mean(u_total)
    actual_std = np.std(u_total)
    actual_ti = actual_std / max(actual_mean, 1e-3)

    max_speed = np.max(u_total)
    min_speed = np.min(u_total)
    gust_factor = max_speed / max(mean_speed, 1e-3)

    psd, f = signal.welch(u_fluc, fs=1.0 / dt, nperseg=min(n // 4, 1024))

    return {
        "time_s": t.tolist(),
        "speed_m_s": u_total.tolist(),
        "fluctuation_m_s": u_fluc.tolist(),
        "mean_speed_m_s": float(actual_mean),
        "std_speed_m_s": float(actual_std),
        "turbulence_intensity": float(actual_ti),
        "max_speed_m_s": float(max_speed),
        "min_speed_m_s": float(min_speed),
        "gust_factor": float(gust_factor),
        "duration_s": float(duration),
        "dt_s": float(dt),
        "n_points": int(n),
        "psd_freq_hz": f.tolist(),
        "psd_power_m2_s": psd.tolist(),
        "target_spectrum_freq_hz": pos_freq.tolist(),
        "target_spectrum_power": S.tolist(),
    }


def generate_wind_angle_series(mean_angle: float,
                                 duration: float = DEFAULT_DURATION,
                                 dt: float = DEFAULT_DT,
                                 angle_std: float = 5.0,
                                 seed: int | None = None) -> dict:
    """
    简化风向角脉动时程 (Von Karman 型)
    """
    if seed is not None:
        np.random.seed(seed)

    n = int(duration / dt)
    n = 2 ** int(np.ceil(np.log2(n)))
    t = np.arange(n) * dt

    freq = np.fft.fftfreq(n, d=dt)
    pos_freq = np.abs(freq[:n // 2 + 1])

    L = 50.0
    U = 10.0
    fL_U = pos_freq * L / U
    fL_U = np.maximum(fL_U, 1e-8)
    S = (angle_std ** 2 * 2.0 * fL_U) / (1.0 + fL_U) ** 2
    S[0] = 0.0

    amp = np.sqrt(S * n / (2.0 * dt))
    phase = np.random.rand(n // 2 + 1) * 2.0 * np.pi

    a_fft_pos = amp * (np.cos(phase) + 1j * np.sin(phase))
    a_fft = np.zeros(n, dtype=np.complex128)
    a_fft[:n // 2 + 1] = a_fft_pos
    a_fft[n // 2 + 1:] = np.conj(a_fft_pos[1:-1][::-1])

    angle_fluc = np.fft.ifft(a_fft).real

    current_std = np.std(angle_fluc)
    if current_std > 1e-6:
        angle_fluc = angle_fluc * (angle_std / current_std)

    angle_total = mean_angle + angle_fluc
    angle_total = (angle_total + 360.0) % 360.0

    return {
        "time_s": t.tolist(),
        "angle_deg": angle_total.tolist(),
        "fluctuation_deg": angle_fluc.tolist(),
        "mean_angle_deg": float(np.mean(angle_total)),
        "std_angle_deg": float(np.std(angle_fluc)),
    }
