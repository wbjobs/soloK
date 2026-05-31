"""
sLORETA source localization module.

Implements a simplified 3-concentric-sphere head model with the
standardized Low-Resolution Electromagnetic Tomography (sLORETA)
inverse solution.  All computations use only NumPy / SciPy so no
MATLAB engine is required.

References
----------
- Pascual-Marqui, R. D. (2002). Standardized low-resolution brain
  electromagnetic tomography (sLORETA): technical details.
- Baillet, S. et al. (2001). Electromagnetic brain mapping.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
from scipy.spatial.transform import Rotation

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def _sph_to_cart(r: float, theta: float, phi: float) -> np.ndarray:
    """theta = azimuth [0, 2pi), phi = polar angle from +z [0, pi]."""
    x = r * np.sin(phi) * np.cos(theta)
    y = r * np.sin(phi) * np.sin(theta)
    z = r * np.cos(phi)
    return np.array([x, y, z])


def _subdivide_icosahedron(subdivisions: int = 3, radius: float = 0.87) -> Tuple[np.ndarray, np.ndarray]:
    """Build a subdivided icosahedron projected onto a sphere.

    Returns (vertices, faces) where vertices is (V, 3) and faces is (F, 3).
    """
    t = (1.0 + np.sqrt(5.0)) / 2.0

    base = np.array(
        [
            [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
            [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
            [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
        ],
        dtype=float,
    )
    base /= np.linalg.norm(base, axis=1, keepdims=True)
    verts = base.tolist()

    faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ]

    for _ in range(subdivisions):
        mid_cache: dict = {}
        new_faces: List[List[int]] = []

        def _mid(a: int, b: int) -> int:
            key = (min(a, b), max(a, b))
            if key in mid_cache:
                return mid_cache[key]
            va = np.array(verts[a], dtype=float)
            vb = np.array(verts[b], dtype=float)
            mid = (va + vb) / 2.0
            mid /= np.linalg.norm(mid)
            verts.append(mid.tolist())
            idx = len(verts) - 1
            mid_cache[key] = idx
            return idx

        for tri in faces:
            a, b, c = tri
            ab = _mid(a, b)
            bc = _mid(b, c)
            ca = _mid(c, a)
            new_faces.extend([[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]])
        faces = new_faces

    verts_arr = np.array(verts, dtype=float)
    verts_arr *= radius / np.linalg.norm(verts_arr, axis=1, keepdims=True)
    return verts_arr, np.array(faces, dtype=int)


def _icosahedron(subdivisions: int = 3, radius: float = 0.87) -> np.ndarray:
    """Return vertex positions only."""
    verts, _ = _subdivide_icosahedron(subdivisions, radius)
    return verts


def _faces_of_icosahedron(subdivisions: int = 3) -> np.ndarray:
    """Return triangle face indices only."""
    _, faces = _subdivide_icosahedron(subdivisions, 1.0)
    return faces


# ---------------------------------------------------------------------------
# 3-shell spherical head model – forward model
# ---------------------------------------------------------------------------


def _lead_field_3sphere(
    elec_pos: np.ndarray,
    source_pos: np.ndarray,
    source_ori: np.ndarray,
    radii: Tuple[float, float, float] = (0.87, 0.92, 1.0),
    conductivities: Tuple[float, float, float] = (1.0, 0.0125, 1.0),
) -> np.ndarray:
    """Analytical lead field for a current dipole in a 3-concentric-sphere model.

    Uses the Sarvas (1987) single-sphere formula which is a very common
    approximation in practice.

    V(r) = (1/(4 pi sigma)) * (Q . a) / a^3 * [1 + (r^2 - r0^2) / a^2]^(-1)

    where a = r - r0 (vector from source to electrode), a = |a|.

    Parameters
    ----------
    elec_pos : (n_electrodes, 3) positions on the outer sphere.
    source_pos : (n_sources, 3) dipole locations inside the brain.
    source_ori : (n_sources, 3) unit-norm dipole orientations.
    radii : (brain, skull, scalp) radii.
    conductivities : (brain, skull, scalp) S/m (ratios matter).

    Returns
    -------
    L : (n_electrodes, n_sources) lead field matrix.
    """
    n_e = elec_pos.shape[0]
    n_s = source_pos.shape[0]
    sigma_brain = conductivities[0]
    factor = 1.0 / (4.0 * np.pi * sigma_brain)

    L = np.zeros((n_e, n_s))
    for i in range(n_e):
        r = elec_pos[i]  # electrode position (scalp sphere)
        r_norm2 = np.dot(r, r)
        for j in range(n_s):
            r0 = source_pos[j]
            ori = source_ori[j]
            r0_norm2 = np.dot(r0, r0)
            a_vec = r - r0
            a = np.linalg.norm(a_vec)
            if a < 1e-10:
                continue
            a2 = a * a
            dot = np.dot(ori, a_vec)
            # Sarvas formula
            F = 1.0 + (r_norm2 - r0_norm2) / a2
            L[i, j] = factor * dot / (a2 * a) / F
    return L


def _build_source_space(n_sources: int = 128, brain_radius: float = 0.87) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Place n_sources on a regular cortical mesh with normal (radial) orientation.

    Returns (positions, orientations, faces) where faces are triangle
    indices for visualization.
    """
    subdivisions = {128: 2, 256: 3, 512: 3, 1024: 4}.get(n_sources, 3)
    positions = _icosahedron(subdivisions=subdivisions, radius=brain_radius)
    faces = _faces_of_icosahedron(subdivisions=subdivisions)
    # Radial orientations (pointing outward from sphere centre)
    orientations = positions / np.linalg.norm(positions, axis=1, keepdims=True)
    return positions, orientations, faces


# ---------------------------------------------------------------------------
# sLORETA inverse solution
# ---------------------------------------------------------------------------


@dataclass
class SourceModel:
    """Pre-computed forward + inverse model for sLORETA."""

    n_electrodes: int
    n_sources: int
    L: np.ndarray               # (n_e, n_s)
    T: np.ndarray               # (n_s, n_e) imaging kernel
    R_diag: np.ndarray          # (n_s,) diagonal of resolution matrix (for normalisation)
    source_pos: np.ndarray      # (n_s, 3)
    source_ori: np.ndarray      # (n_s, 3)
    faces: np.ndarray           # (M, 3) triangle indices


def build_source_model(
    elec_pos: np.ndarray,
    n_sources: int = 128,
    lambda_reg: float = 0.05,
) -> SourceModel:
    """Build the forward + inverse model.

    Parameters
    ----------
    elec_pos : (n_e, 3) electrode positions on the scalp sphere.
    n_sources : approximate number of source dipoles (rounded to mesh size).
    lambda_reg : Tikhonov regularisation parameter.
    """
    source_pos, source_ori, faces = _build_source_space(n_sources)
    n_e = elec_pos.shape[0]
    n_s = source_pos.shape[0]

    # Lead field
    L = _lead_field_3sphere(elec_pos, source_pos, source_ori)

    # Regularised inverse: W = L' (L L' + lambda I)^-1
    LLt = L @ L.T
    reg = lambda_reg * np.trace(LLt) / n_e * np.eye(n_e)
    M_inv = np.linalg.inv(LLt + reg)
    T = L.T @ M_inv  # (n_s, n_e)

    # Resolution matrix R = T L, keep diagonal for sLORETA normalisation
    R = T @ L
    R_diag = np.abs(np.diag(R))
    # Avoid divide-by-zero
    R_diag[R_diag < 1e-10] = 1e-10

    return SourceModel(
        n_electrodes=n_e,
        n_sources=n_s,
        L=L,
        T=T,
        R_diag=R_diag,
        source_pos=source_pos,
        source_ori=source_ori,
        faces=faces,
    )


def apply_sloreta(model: SourceModel, eeg_data: np.ndarray) -> np.ndarray:
    """Apply sLORETA to EEG data.

    Parameters
    ----------
    model : SourceModel
    eeg_data : (n_e, n_times) or (n_e,) array.

    Returns
    -------
    J : (n_sources,) or (n_sources, n_times) – sLORETA current density estimate.
    """
    single = eeg_data.ndim == 1
    if single:
        eeg_data = eeg_data[:, None]
    # Minimum-norm estimate
    J_mne = model.T @ eeg_data  # (n_s, n_times)
    # sLORETA normalisation: divide by sqrt(diagonal of resolution matrix)
    J_sloreta = J_mne / np.sqrt(model.R_diag[:, None])
    # Current density magnitude (absolute value)
    J = np.abs(J_sloreta)
    if single:
        J = J[:, 0]
    return J


def band_limited_current_density(
    model: SourceModel,
    eeg_data: np.ndarray,
    srate: int,
    band: Tuple[float, float] = (8.0, 13.0),
) -> np.ndarray:
    """Compute sLORETA current density for a specific frequency band.

    First band-pass filters the data, then applies sLORETA to the
    mean power across the filtered time window, returning (n_sources,).
    """
    from scipy import signal as sp_signal

    nyq = srate / 2.0
    low = max(band[0] / nyq, 1e-3)
    high = min(band[1] / nyq, 1.0 - 1e-3)
    b, a = sp_signal.butter(4, [low, high], btype="band")
    filtered = sp_signal.filtfilt(b, a, eeg_data, axis=-1)
    # Instantaneous power (envelope^2)
    analytic = sp_signal.hilbert(filtered, axis=-1)
    power = np.abs(analytic) ** 2
    # Mean power over time
    mean_power = np.mean(power, axis=-1)  # (n_e,)
    return apply_sloreta(model, mean_power)
