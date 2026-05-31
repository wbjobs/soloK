import numpy as np
from .hdf5_writer import SimulationParams, HDF5Writer


class LJSimulator:
    def __init__(self, params: SimulationParams = None, output_dir: str = "../data"):
        self.params = params or SimulationParams()
        self.n = self.params.n_particles
        self.box = self.params.box_size
        self.epsilon = self.params.epsilon
        self.sigma = self.params.sigma
        self.dt = self.params.dt
        self.r_cut = self.params.r_cut
        self.r_cut_sq = self.r_cut ** 2

        self.step = 0
        self.time = 0.0

        self.positions = self._initialize_positions()
        self.velocities = self._initialize_velocities()
        self.forces = np.zeros((self.n, 3))

        self.hdf5_writer = HDF5Writer(output_dir=output_dir, params=self.params)

        self._compute_forces()

    def _initialize_positions(self) -> np.ndarray:
        n_per_dim = int(np.ceil(self.n ** (1.0 / 3.0)))
        spacing = self.box / n_per_dim
        positions = []

        for i in range(n_per_dim):
            for j in range(n_per_dim):
                for k in range(n_per_dim):
                    if len(positions) < self.n:
                        x = (i + 0.5) * spacing - self.box / 2
                        y = (j + 0.5) * spacing - self.box / 2
                        z = (k + 0.5) * spacing - self.box / 2
                        positions.append([x, y, z])

        return np.array(positions, dtype=np.float64)

    def _initialize_velocities(self) -> np.ndarray:
        velocities = np.random.randn(self.n, 3) * np.sqrt(self.params.temperature)
        velocities -= np.mean(velocities, axis=0)
        return velocities

    def _compute_forces(self) -> tuple[np.ndarray, float]:
        forces = np.zeros((self.n, 3))
        potential_energy = 0.0
        min_r_sq = (self.sigma * 0.5) ** 2
        max_force = 1e4

        for i in range(self.n - 1):
            dr = self.positions[i + 1:] - self.positions[i]
            dr -= self.box * np.round(dr / self.box)

            r_sq = np.sum(dr ** 2, axis=1)
            mask = r_sq < self.r_cut_sq

            if np.any(mask):
                r_sq_masked = r_sq[mask]
                r_sq_masked = np.maximum(r_sq_masked, min_r_sq)
                
                r_six = (self.sigma ** 2 / r_sq_masked) ** 3
                r_twelve = r_six ** 2

                f_mag = 48 * self.epsilon * (r_twelve - 0.5 * r_six) / r_sq_masked
                f_mag = np.clip(f_mag, -max_force, max_force)
                
                f_vec = dr[mask] * f_mag[:, np.newaxis]

                forces[i] += np.sum(f_vec, axis=0)
                forces[i + 1:][mask] -= f_vec

                potential_energy += np.sum(
                    4 * self.epsilon * (r_twelve - r_six)
                )

        if (abs(self.params.E_x) > 1e-12 or 
            abs(self.params.E_y) > 1e-12 or 
            abs(self.params.E_z) > 1e-12):
            e_field = np.array([
                self.params.E_x, 
                self.params.E_y, 
                self.params.E_z
            ], dtype=np.float64)
            electric_force = self.params.charge * e_field
            forces += electric_force

        return forces, potential_energy

    def set_electric_field(self, E_x: float, E_y: float, E_z: float):
        self.params.E_x = float(E_x)
        self.params.E_y = float(E_y)
        self.params.E_z = float(E_z)

    def get_electric_field(self) -> tuple:
        return (self.params.E_x, self.params.E_y, self.params.E_z)

    def _kinetic_energy(self) -> float:
        return 0.5 * np.sum(self.velocities ** 2)

    def _speed_magnitudes(self) -> np.ndarray:
        return np.sqrt(np.sum(self.velocities ** 2, axis=1))

    def step_forward(self) -> dict:
        self.velocities += 0.5 * self.forces * self.dt
        self.positions += self.velocities * self.dt
        self.positions -= self.box * np.round(self.positions / self.box)

        self.forces, potential_energy = self._compute_forces()
        self.velocities += 0.5 * self.forces * self.dt

        self.step += 1
        self.time += self.dt

        kinetic_energy = self._kinetic_energy()
        total_energy = kinetic_energy + potential_energy

        if self.step % 50 == 0:
            current_temp = (2.0 / 3.0) * (kinetic_energy / self.n)
            if current_temp > 1e-6:
                scale = np.sqrt(self.params.temperature / current_temp)
                scale = np.clip(scale, 0.9, 1.1)
                self.velocities *= scale

        snapshot_saved = False
        if self.step % self.params.snapshot_interval == 0:
            self.hdf5_writer.save_snapshot(
                self.step,
                self.time,
                kinetic_energy,
                potential_energy,
                self.positions.copy(),
            )
            snapshot_saved = True

        speeds = self._speed_magnitudes()
        E_x, E_y, E_z = self.get_electric_field()

        return {
            "step": self.step,
            "time": self.time,
            "kinetic_energy": float(kinetic_energy),
            "potential_energy": float(potential_energy),
            "total_energy": float(total_energy),
            "positions": self.positions.ravel().tolist(),
            "speeds": speeds.tolist(),
            "n_particles": self.n,
            "snapshot_saved": snapshot_saved,
            "E_x": E_x,
            "E_y": E_y,
            "E_z": E_z,
        }
