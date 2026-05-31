"""
Functional connectivity analysis module.

Provides real-time Phase Locking Value (PLV) computation and a
force-directed graph layout for visualisation of the connectivity
matrix.
"""
from __future__ import annotations

from typing import List, Tuple

import numpy as np
from scipy import signal as sp_signal


# ---------------------------------------------------------------------------
# Phase Locking Value (PLV)
# ---------------------------------------------------------------------------


def instantaneous_phase(x: np.ndarray, srate: int, band: Tuple[float, float]) -> np.ndarray:
    """Extract instantaneous phase of `x` within a frequency band.

    Parameters
    ----------
    x : (n_channels, n_samples) array.
    srate : sampling rate in Hz.
    band : (low, high) frequency range.

    Returns
    -------
    phase : (n_channels, n_samples) instantaneous phase in radians.
    """
    nyq = srate / 2.0
    low = max(band[0] / nyq, 1e-3)
    high = min(band[1] / nyq, 1.0 - 1e-3)
    b, a = sp_signal.butter(4, [low, high], btype="band")
    filtered = sp_signal.filtfilt(b, a, x, axis=-1)
    analytic = sp_signal.hilbert(filtered, axis=-1)
    return np.angle(analytic)


def plv_matrix(
    x: np.ndarray,
    srate: int,
    band: Tuple[float, float],
) -> np.ndarray:
    """Compute pairwise PLV matrix.

    Parameters
    ----------
    x : (n_channels, n_samples) data array.
    srate : sampling rate.
    band : frequency band for phase extraction.

    Returns
    -------
    plv : (n_channels, n_channels) symmetric matrix with PLV values in [0, 1].
    """
    phase = instantaneous_phase(x, srate, band)
    n_chan = phase.shape[0]
    plv = np.zeros((n_chan, n_chan))
    for i in range(n_chan):
        for j in range(i, n_chan):
            if i == j:
                plv[i, j] = 1.0
                continue
            dphi = phase[i] - phase[j]
            val = np.abs(np.mean(np.exp(1j * dphi)))
            plv[i, j] = val
            plv[j, i] = val
    return plv


def top_edges(plv: np.ndarray, k: int = 10, exclude_diag: bool = True) -> List[Tuple[int, int, float]]:
    """Return the top-k (i, j, plv) edges, excluding diagonal if requested.

    Each undirected edge is returned only once (i < j).
    """
    n = plv.shape[0]
    edges: List[Tuple[int, int, float]] = []
    for i in range(n):
        for j in range(i + 1, n):
            edges.append((i, j, float(plv[i, j])))
    edges.sort(key=lambda e: e[2], reverse=True)
    return edges[:k]


# ---------------------------------------------------------------------------
# Force-directed graph layout
# ---------------------------------------------------------------------------


def force_directed_layout(
    edges: List[Tuple[int, int, float]],
    n_nodes: int,
    iterations: int = 200,
    k: float | None = None,
    c: float = 0.05,
    seed: int = 42,
) -> np.ndarray:
    """Compute a 2D force-directed layout for a graph.

    Uses Fruchterman-Reingold spring-electric model.

    Parameters
    ----------
    edges : list of (i, j, weight) edges.
    n_nodes : total number of nodes.
    iterations : number of iterations.
    k : optimal distance (default: sqrt(1/n_nodes)).
    c : cooling rate (0 < c <= 1).
    seed : random seed for reproducibility.

    Returns
    -------
    pos : (n_nodes, 2) array of 2D positions.
    """
    rng = np.random.default_rng(seed)
    pos = rng.uniform(-0.5, 0.5, (n_nodes, 2))
    if k is None:
        k = np.sqrt(1.0 / n_nodes)

    # Build adjacency with weights
    adj = np.zeros((n_nodes, n_nodes))
    for i, j, w in edges:
        adj[i, j] = w
        adj[j, i] = w

    temp = 1.0
    for it in range(iterations):
        disp = np.zeros_like(pos)
        # Repulsive forces (all pairs)
        for i in range(n_nodes):
            for j in range(n_nodes):
                if i == j:
                    continue
                diff = pos[i] - pos[j]
                dist = np.linalg.norm(diff)
                if dist < 1e-10:
                    continue
                disp[i] += (k ** 2 / dist) * (diff / dist)
        # Attractive forces (edges)
        for i, j, w in edges:
            diff = pos[i] - pos[j]
            dist = np.linalg.norm(diff)
            if dist < 1e-10:
                continue
            # Weighted attraction: stronger edges pull harder
            f_spring = (dist ** 2 / k) * (0.5 + w)
            disp[i] -= f_spring * (diff / dist)
            disp[j] += f_spring * (diff / dist)
        # Apply displacement with cooling
        disp_norm = np.linalg.norm(disp, axis=1, keepdims=True)
        disp_norm[disp_norm < 1e-10] = 1.0
        pos += np.clip(disp / disp_norm, -temp, temp) * disp_norm * 0.1
        temp *= (1.0 - c)

    # Normalise to [0, 1] range
    pos -= pos.min(axis=0)
    pos_range = pos.max(axis=0) - pos.min(axis=0)
    pos_range[pos_range < 1e-10] = 1.0
    pos /= pos_range
    return pos
