import os
import time
import logging
import threading
from dataclasses import dataclass, asdict
import h5py
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class SimulationParams:
    n_particles: int = 1000
    box_size: float = 10.0
    temperature: float = 1.0
    epsilon: float = 1.0
    sigma: float = 1.0
    dt: float = 0.001
    r_cut: float = 2.5
    snapshot_interval: int = 100
    charge: float = 1.0
    E_x: float = 0.0
    E_y: float = 0.0
    E_z: float = 0.0


class HDF5Writer:
    def __init__(self, output_dir: str = "../data", params: SimulationParams = None):
        self.params = params or SimulationParams()
        self._lock = threading.Lock()
        self._n_snapshots = 0
        self._file = None

        self.output_dir = os.path.abspath(output_dir)
        for attempt in range(3):
            try:
                os.makedirs(self.output_dir, exist_ok=True)
                break
            except OSError as e:
                logger.warning(f"mkdir attempt {attempt+1} failed: {e}")
                if attempt == 2:
                    self.output_dir = os.path.join(
                        os.path.expanduser("~"), "lj_simulation_data"
                    )
                    os.makedirs(self.output_dir, exist_ok=True)

        self.filepath = os.path.join(self.output_dir, "trajectory.h5")
        self._init_file()

    def _open_file(self):
        for attempt in range(3):
            try:
                f = h5py.File(self.filepath, "a")
                return f
            except OSError as e:
                logger.warning(f"HDF5 open attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(0.1 * (attempt + 1))
                else:
                    backup = self.filepath + ".backup"
                    logger.error(f"Cannot open {self.filepath}, trying backup {backup}")
                    self.filepath = backup
                    try:
                        f = h5py.File(self.filepath, "a")
                        return f
                    except OSError:
                        return None
        return None

    def _init_file(self):
        try:
            with h5py.File(self.filepath, "w") as f:
                param_group = f.create_group("parameters")
                for key, value in asdict(self.params).items():
                    param_group.attrs[key] = value

                traj_group = f.create_group("trajectory")
                n = self.params.n_particles
                traj_group.create_dataset(
                    "step", (0,), maxshape=(None,), dtype=np.int64
                )
                traj_group.create_dataset(
                    "time", (0,), maxshape=(None,), dtype=np.float64
                )
                traj_group.create_dataset(
                    "kinetic_energy", (0,), maxshape=(None,), dtype=np.float64
                )
                traj_group.create_dataset(
                    "potential_energy", (0,), maxshape=(None,), dtype=np.float64
                )
                traj_group.create_dataset(
                    "positions", (0, n, 3), maxshape=(None, n, 3), dtype=np.float64
                )
        except OSError as e:
            logger.error(f"HDF5 init failed: {e}")

    def save_snapshot(
        self,
        step: int,
        time_val: float,
        kinetic_energy: float,
        potential_energy: float,
        positions: np.ndarray,
    ):
        with self._lock:
            f = self._open_file()
            if f is None:
                logger.error("HDF5Writer: could not open file, snapshot skipped")
                return

            try:
                traj_group = f["trajectory"]
                idx = self._n_snapshots
                self._n_snapshots += 1

                traj_group["step"].resize((idx + 1,))
                traj_group["step"][idx] = step

                traj_group["time"].resize((idx + 1,))
                traj_group["time"][idx] = time_val

                traj_group["kinetic_energy"].resize((idx + 1,))
                traj_group["kinetic_energy"][idx] = kinetic_energy

                traj_group["potential_energy"].resize((idx + 1,))
                traj_group["potential_energy"][idx] = potential_energy

                traj_group["positions"].resize(
                    (idx + 1, self.params.n_particles, 3)
                )
                traj_group["positions"][idx] = positions.astype(np.float64)
                f.flush()
            except Exception as e:
                logger.error(f"HDF5 write error: {e}")
            finally:
                try:
                    f.close()
                except Exception:
                    pass

    def close(self):
        if self._file is not None:
            try:
                self._file.close()
            except Exception:
                pass
            self._file = None
