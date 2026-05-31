from __future__ import annotations

import asyncio
import random
from typing import AsyncGenerator, Dict

import numpy as np


class SimulatedEEGSource:
    """Generates synthetic EEG with oscillatory activity and occasional artifacts."""

    def __init__(self, n_chan: int = 32, srate: int = 500):
        self.n_chan = n_chan
        self.srate = srate
        self._t = 0.0
        # per-channel dominant alpha frequency
        self._alpha = 9.0 + np.random.uniform(-1.5, 1.5, n_chan)
        self._phase = np.random.uniform(0, 2 * np.pi, n_chan)

    def generate_chunk(self, duration: float = 0.1) -> np.ndarray:
        n = max(1, int(duration * self.srate))
        t = np.arange(self._t, self._t + n / self.srate, 1.0 / self.srate)[:n]
        self._t += n / self.srate
        # alpha oscillation
        alpha = np.sin(2 * np.pi * self._alpha[:, None] * t[None, :] + self._phase[:, None])
        # low-frequency noise
        slow = 0.3 * np.sin(2 * np.pi * 1.5 * t)
        # background pink-ish
        noise = np.random.randn(self.n_chan, n) * 0.4
        data = alpha * 0.6 + slow[None, :] + noise
        # occasional blink (large transient on first two frontal channels)
        if random.random() < 0.02:
            bl = int(0.2 * self.srate)
            onset = random.randint(0, max(0, n - bl))
            data[0, onset:onset + bl] += 20.0 * np.hanning(bl)
            data[1, onset:onset + bl] += 15.0 * np.hanning(bl)
        return data * 5.0  # microvolts-ish


async def simulated_stream(source: SimulatedEEGSource, chunk_sec: float = 0.1) -> AsyncGenerator[Dict, None]:
    while True:
        chunk = source.generate_chunk(chunk_sec)
        yield {
            "type": "eeg",
            "n_chan": int(chunk.shape[0]),
            "srate": source.srate,
            "samples": chunk.astype(np.float32).tolist(),
            "t0": float(source._t - chunk.shape[1] / source.srate),
        }
        await asyncio.sleep(chunk_sec)
