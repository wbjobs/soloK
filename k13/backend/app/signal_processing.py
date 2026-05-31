from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy import signal as sp_signal
from scipy.interpolate import RBFInterpolator


BANDS: Dict[str, Tuple[float, float]] = {
    "Delta": (0.5, 4.0),
    "Theta": (4.0, 8.0),
    "Alpha": (8.0, 13.0),
    "Beta": (13.0, 30.0),
    "Gamma": (30.0, 45.0),
}


@dataclass
class FilterParams:
    notch_freq: float = 50.0
    notch_quality: float = 30.0
    band_low: float = 1.0
    band_high: float = 45.0
    band_order: int = 4
    enabled: bool = True


@dataclass
class ChannelConfig:
    label: str
    x: float  # spherical theta in radians
    y: float  # spherical phi in radians
    kind: str = "EEG"  # EEG | EOG | EMG | REF


@dataclass
class ExperimentConfig:
    name: str
    srate: int = 500
    channels: List[ChannelConfig] = field(default_factory=list)
    filter_params: FilterParams = field(default_factory=FilterParams)

    def chan_labels(self) -> List[str]:
        return [c.label for c in self.channels]

    def kind_mask(self, kind: str) -> np.ndarray:
        return np.array([c.kind == kind for c in self.channels], dtype=bool)


def standard_1020_layout(n: int = 32) -> List[ChannelConfig]:
    """Build a canonical 10-20 extended layout for n in {19,32,64}."""
    base = [
        ("Fp1", -0.9, 0.3), ("Fp2", 0.9, 0.3),
        ("F7", -1.1, 0.8), ("F3", -0.5, 0.9), ("Fz", 0.0, 1.0), ("F4", 0.5, 0.9), ("F8", 1.1, 0.8),
        ("FT9", -1.3, 0.4), ("FT10", 1.3, 0.4),
        ("T7", -1.4, 0.0), ("T8", 1.4, 0.0),
        ("C3", -0.6, 0.0), ("Cz", 0.0, 0.0), ("C4", 0.6, 0.0),
        ("TP9", -1.3, -0.4), ("TP10", 1.3, -0.4),
        ("P7", -1.1, -0.8), ("P3", -0.5, -0.9), ("Pz", 0.0, -1.0),
        ("P4", 0.5, -0.9), ("P8", 1.1, -0.8),
        ("O1", -0.4, -1.3), ("Oz", 0.0, -1.4), ("O2", 0.4, -1.3),
        ("AF3", -0.4, 0.6), ("AF4", 0.4, 0.6),
        ("FC5", -0.9, 0.4), ("FC6", 0.9, 0.4),
        ("CP5", -0.9, -0.4), ("CP6", 0.9, -0.4),
        ("PO3", -0.4, -1.1), ("PO4", 0.4, -1.1),
    ]
    if n <= 19:
        picks = ["Fp1","Fp2","F7","F3","Fz","F4","F8","T7","C3","Cz","C4","T8","P3","Pz","P4","O1","Oz","O2"]
        base = [b for b in base if b[0] in picks]
    out: List[ChannelConfig] = []
    for label, x, y in base[:n]:
        out.append(ChannelConfig(label=label, x=x, y=y, kind="EEG"))
    # two EOG + one EMG reference
    out.append(ChannelConfig(label="HEOG", x=-1.5, y=0.0, kind="EOG"))
    out.append(ChannelConfig(label="VEOG", x=0.0, y=1.5, kind="EOG"))
    out.append(ChannelConfig(label="EMG", x=1.5, y=-1.5, kind="EMG"))
    return out


class OnlineFilter:
    """Zero-phase forward-backward-style online filtering using overlap-add with saved state."""

    def __init__(self, srate: int, params: FilterParams):
        self.srate = srate
        self.params = params
        self._build()
        self._zi_notch: Optional[np.ndarray] = None
        self._zi_band: Optional[np.ndarray] = None

    def _build(self) -> None:
        p = self.params
        nyq = self.srate / 2.0
        # notch
        f0 = p.notch_freq
        Q = p.notch_quality
        self.b_notch, self.a_notch = sp_signal.iirnotch(f0 / nyq, Q)
        # bandpass
        low = max(p.band_low / nyq, 1e-3)
        high = min(p.band_high / nyq, 1.0 - 1e-3)
        self.b_band, self.a_band = sp_signal.butter(p.band_order, [low, high], btype="band")

    def apply(self, x: np.ndarray) -> np.ndarray:
        """x shape: (n_chan, n_samples). Returns filtered of same shape."""
        if not self.params.enabled:
            return x
        if self._zi_notch is None:
            self._zi_notch = np.zeros((x.shape[0], max(len(self.b_notch), len(self.a_notch)) - 1))
        if self._zi_band is None:
            self._zi_band = np.zeros((x.shape[0], max(len(self.b_band), len(self.a_band)) - 1))
        y, self._zi_notch = sp_signal.lfilter(self.b_notch, self.a_notch, x, axis=-1, zi=self._zi_notch)
        y, self._zi_band = sp_signal.lfilter(self.b_band, self.a_band, y, axis=-1, zi=self._zi_band)
        return y


def welch_psd(x: np.ndarray, srate: int, nperseg: Optional[int] = None) -> Tuple[np.ndarray, np.ndarray]:
    """Welch PSD. x shape (n_chan, n_samples). Returns (freqs, psd) with psd shape (n_chan, n_freqs)."""
    if nperseg is None:
        nperseg = min(x.shape[-1], max(64, srate // 2))
    freqs, psd = sp_signal.welch(x, fs=srate, nperseg=nperseg, axis=-1)
    return freqs, psd


def band_power(psd: np.ndarray, freqs: np.ndarray, band: Tuple[float, float]) -> np.ndarray:
    """Integrate PSD within band. psd: (n_chan, n_freqs). returns: (n_chan,)."""
    idx = (freqs >= band[0]) & (freqs <= band[1])
    if not np.any(idx):
        return np.zeros(psd.shape[0])
    return np.trapz(psd[:, idx], freqs[idx], axis=-1)


def detect_artifacts(
    raw: np.ndarray,
    srate: int,
    eog_mask: np.ndarray,
    emg_mask: np.ndarray,
    z_thresh: float = 6.0,
    emg_freq: Tuple[float, float] = (35.0, 100.0),
) -> List[Dict]:
    """Return list of {channel, start, end, kind, severity} artifacts."""
    findings: List[Dict] = []
    n_chan, n = raw.shape
    if n == 0:
        return findings
    # 1. z-score based on robust statistics
    med = np.median(raw, axis=-1, keepdims=True)
    mad = np.median(np.abs(raw - med), axis=-1, keepdims=True) + 1e-8
    z = 0.6745 * (raw - med) / mad
    # 2. EMG high-frequency band power per channel
    nyq = srate / 2.0
    b, a = sp_signal.butter(4, [max(emg_freq[0] / nyq, 1e-3), min(emg_freq[1] / nyq, 1.0 - 1e-3)], btype="band")
    hi = sp_signal.filtfilt(b, a, raw, axis=-1)
    emg_energy = np.sqrt(np.mean(hi ** 2, axis=-1))
    emg_threshold = np.median(emg_energy) + 4.0 * (np.std(emg_energy) + 1e-8)
    # 3. find contiguous suprathreshold runs
    for ch in range(n_chan):
        supr = np.abs(z[ch]) > z_thresh
        # add EMG-triggered detection if EMG channel or high energy
        if emg_mask[ch] or emg_energy[ch] > emg_threshold:
            supr = supr | (np.abs(hi[ch]) > (3.0 * np.std(hi[ch]) + 1e-8))
        if not np.any(supr):
            continue
        padded = np.concatenate(([False], supr, [False]))
        diffs = np.diff(padded.astype(int))
        starts = np.where(diffs == 1)[0]
        ends = np.where(diffs == -1)[0] - 1
        for s, e in zip(starts, ends):
            if (e - s + 1) < max(1, int(0.01 * srate)):
                continue
            kind = "EMG" if emg_mask[ch] or emg_energy[ch] > emg_threshold else "EOG" if eog_mask[ch] else "Amplitude"
            severity = float(np.max(np.abs(z[ch, s:e + 1])))
            findings.append({
                "channel": int(ch),
                "start": float(s / srate),
                "end": float((e + 1) / srate),
                "kind": kind,
                "severity": severity,
            })
    return findings


def erp_segments(
    raw: np.ndarray,
    srate: int,
    events: List[Dict],
    tmin: float = -0.2,
    tmax: float = 0.8,
) -> Dict[str, np.ndarray]:
    """Extract ERP epochs grouped by event type. Returns {type: (n_epochs, n_chan, n_times)}."""
    n_chan, n = raw.shape
    pre = int(-tmin * srate)
    post = int(tmax * srate)
    total = pre + post
    buckets: Dict[str, List[np.ndarray]] = {}
    for ev in events:
        sample = int(ev.get("sample", 0))
        if sample - pre < 0 or sample + post > n:
            continue
        label = ev.get("type", "unknown")
        epoch = raw[:, sample - pre:sample + post]
        if epoch.shape[-1] != total:
            continue
        buckets.setdefault(label, []).append(epoch)
    return {k: np.stack(v, axis=0) for k, v in buckets.items() if v}


def time_locked_average(epochs: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
    return {k: np.mean(v, axis=0) for k, v in epochs.items()}


def spherical_to_cart(theta: np.ndarray, phi: np.ndarray, r: float = 1.0) -> np.ndarray:
    """theta: azimuth (around z), phi: elevation from equator."""
    x = r * np.cos(phi) * np.cos(theta)
    y = r * np.cos(phi) * np.sin(theta)
    z = r * np.sin(phi)
    return np.stack([x, y, z], axis=-1)


def _azimuthal_equidistant(thetas: np.ndarray, phis: np.ndarray, r: float = 1.0) -> np.ndarray:
    """Project spherical (theta, phi) to 2D using azimuthal equidistant (projection on tangent plane at Cz)."""
    # Cz is at (theta=0, phi=0). Great-circle distance from Cz is r * (pi/2 - phi).
    rho = r * (np.pi / 2.0 - phis)  # distance from vertex (Cz)
    x = rho * np.cos(thetas)
    y = rho * np.sin(thetas)
    return np.stack([x, y], axis=-1)


def _add_boundary_virtual_electrodes(
    flat_pts: np.ndarray,
    values: np.ndarray,
    n_rings: int = 3,
    n_angular: int = 12,
    head_radius: float = 1.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """Add virtual electrodes around the head boundary to stabilize RBF extrapolation.
    Virtual values are extrapolated from nearest real electrode with smooth decay to zero."""
    from scipy.spatial import cKDTree

    tree = cKDTree(flat_pts)
    virtual_pts: List[np.ndarray] = []
    virtual_vals: List[float] = []
    # rings slightly beyond the farthest real electrode
    max_rho = np.max(np.linalg.norm(flat_pts, axis=-1))
    for ring in range(1, n_rings + 1):
        rho = max_rho + ring * 0.15
        if rho > head_radius * 1.3:
            break
        for k in range(n_angular):
            theta = 2 * np.pi * k / n_angular
            pt = np.array([rho * np.cos(theta), rho * np.sin(theta)])
            dist, idx = tree.query(pt, k=3)
            # inverse distance weighting
            w = 1.0 / (dist + 1e-6)
            w /= w.sum()
            val = float(np.sum(values[idx] * w))
            # decay toward zero as we move outward
            decay = np.clip(1.0 - (rho - max_rho) / (head_radius * 0.5), 0.0, 1.0)
            virtual_pts.append(pt)
            virtual_vals.append(val * decay)
    if not virtual_pts:
        return flat_pts, values
    all_pts = np.concatenate([flat_pts, np.stack(virtual_pts, axis=0)], axis=0)
    all_vals = np.concatenate([values, np.array(virtual_vals, dtype=values.dtype)], axis=0)
    return all_pts, all_vals


def scalp_topography(
    values: np.ndarray,
    channels: List[ChannelConfig],
    grid_res: int = 64,
    head_radius: float = 1.0,
):
    """Return 2D contour grid (xs, ys, z) and 3D vertices for head.
    Fixes:
    - Uses azimuthal equidistant projection (not raw cartesian x/y)
    - Adds boundary virtual electrodes to prevent Gibbs ringing
    - Operates on log-transformed values (power >= 0), then clips to eliminate spurious negatives
    - Uses multiquadric kernel for smoother extrapolation
    """
    thetas = np.array([c.x for c in channels], dtype=float)
    phis = np.array([c.y for c in channels], dtype=float)
    flat = _azimuthal_equidistant(thetas, phis, r=head_radius)  # (N, 2)
    # Ensure values are strictly positive (power/voltage magnitude), log-transform
    safe_vals = np.clip(values, a_min=1e-8, a_max=None)
    log_vals = np.log10(safe_vals)
    # Add virtual electrodes at boundary
    all_pts, all_log_vals = _add_boundary_virtual_electrodes(
        flat, log_vals, head_radius=head_radius
    )
    # RBF interpolator on log scale
    interp = RBFInterpolator(
        all_pts,
        all_log_vals,
        kernel="multiquadric",
        epsilon=0.5,
        smoothing=0.01,
    )
    # Build 2D grid within head disk
    xs = np.linspace(-head_radius * 1.1, head_radius * 1.1, grid_res)
    ys = np.linspace(-head_radius * 1.1, head_radius * 1.1, grid_res)
    X, Y = np.meshgrid(xs, ys)
    rho = np.sqrt(X ** 2 + Y ** 2)
    mask = rho <= (head_radius * 1.05)
    grid_pts = np.stack([X[mask], Y[mask]], axis=-1)
    z_log = np.full_like(X, np.nan)
    z_log[mask] = interp(grid_pts)
    # Inverse log transform and clip to physical range
    z = 10.0 ** z_log
    # Ensure no negatives (numerical safety) and clip to plausible range
    vmin = float(np.percentile(values, 1)) if len(values) else 0.0
    vmax = float(np.percentile(values, 99)) if len(values) else 1.0
    z = np.clip(z, a_min=max(0.0, vmin * 0.5), a_max=vmax * 1.5)
    # 3D sphere vertices (for Surface plot)
    u = np.linspace(-np.pi, np.pi, 48)
    v = np.linspace(-np.pi / 2, np.pi / 2, 24)
    U, V = np.meshgrid(u, v)
    verts = spherical_to_cart(U.ravel(), V.ravel(), r=head_radius)
    verts_flat = _azimuthal_equidistant(U.ravel(), V.ravel(), r=head_radius)
    v3d_log = interp(verts_flat)
    v3d = 10.0 ** v3d_log
    v3d = np.clip(v3d, a_min=max(0.0, vmin * 0.5), a_max=vmax * 1.5)
    return xs, ys, z, verts, v3d.reshape(U.shape)


def config_to_dict(cfg: ExperimentConfig) -> Dict:
    return {
        "name": cfg.name,
        "srate": cfg.srate,
        "channels": [c.__dict__ for c in cfg.channels],
        "filter_params": cfg.filter_params.__dict__,
    }


def dict_to_config(d: Dict) -> ExperimentConfig:
    ch = [ChannelConfig(**c) for c in d.get("channels", [])]
    fp = FilterParams(**d.get("filter_params", {}))
    return ExperimentConfig(name=d["name"], srate=d.get("srate", 500), channels=ch, filter_params=fp)
