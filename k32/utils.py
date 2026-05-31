import hashlib
import time
import uuid
from typing import List, Tuple

import numpy as np

from config import (
    AMINO_ACID_MASSES,
    FRAGMENT_MZ_TOLERANCE_DA,
    PRECURSOR_MZ_TOLERANCE_PPM,
    PROTON_MASS,
    WATER_MASS,
)


def generate_job_id() -> str:
    return str(uuid.uuid4())


def get_current_time() -> float:
    return time.time()


def mass_to_mz(mass: float, charge: int) -> float:
    return (mass + charge * PROTON_MASS) / charge


def mz_to_mass(mz: float, charge: int) -> float:
    return mz * charge - charge * PROTON_MASS


def ppm_to_da(mz: float, ppm: float) -> float:
    return mz * ppm / 1e6


def within_ppm_tolerance(mz_theoretical: float, mz_measured: float, ppm: float = PRECURSOR_MZ_TOLERANCE_PPM) -> bool:
    return abs(mz_theoretical - mz_measured) <= ppm_to_da(mz_measured, ppm)


def within_da_tolerance(mass1: float, mass2: float, tolerance: float = FRAGMENT_MZ_TOLERANCE_DA) -> bool:
    return abs(mass1 - mass2) <= tolerance


def peptide_mass(peptide: str, modifications: dict = None) -> float:
    mass = sum(AMINO_ACID_MASSES.get(aa, 0.0) for aa in peptide)
    if modifications:
        for pos, mod_mass in modifications.items():
            mass += mod_mass
    return mass


def generate_b_ion_series(peptide: str, modifications: dict = None) -> List[float]:
    masses = []
    cum_mass = 0.0
    for i, aa in enumerate(peptide):
        cum_mass += AMINO_ACID_MASSES.get(aa, 0.0)
        if modifications and i in modifications:
            cum_mass += modifications[i]
        masses.append(cum_mass + PROTON_MASS)
    return masses


def generate_y_ion_series(peptide: str, modifications: dict = None) -> List[float]:
    masses = []
    cum_mass = 0.0
    n = len(peptide)
    for i in range(n - 1, -1, -1):
        cum_mass += AMINO_ACID_MASSES.get(peptide[i], 0.0)
        if modifications and i in modifications:
            cum_mass += modifications[i]
        masses.append(cum_mass + WATER_MASS + PROTON_MASS)
    return masses


def generate_theoretical_spectrum(
    peptide: str,
    modifications: dict = None,
    ion_types: List[str] = None,
    max_charge: int = 2,
    peptide_has_missed_cleavage: bool = False,
) -> np.ndarray:
    if ion_types is None:
        ion_types = ["b", "y"]

    all_masses = []
    all_intensities = []

    if "b" in ion_types:
        b_ions = generate_b_ion_series(peptide, modifications)
        n_b = len(b_ions)
        for charge in range(1, max_charge + 1):
            for i, mass in enumerate(b_ions):
                if charge == 1 and i == n_b - 1 and not peptide_has_missed_cleavage:
                    continue
                if charge > 1 and i == n_b - 1:
                    continue
                mz = mass_to_mz(mass, charge)
                all_masses.append(mz)
                all_intensities.append(1.0 / charge)

    if "y" in ion_types:
        y_ions = generate_y_ion_series(peptide, modifications)
        n_y = len(y_ions)
        for charge in range(1, max_charge + 1):
            for i, mass in enumerate(y_ions):
                if charge == 1 and i == n_y - 1 and not peptide_has_missed_cleavage:
                    continue
                if charge > 1 and i == n_y - 1:
                    continue
                mz = mass_to_mz(mass, charge)
                all_masses.append(mz)
                all_intensities.append(1.0 / charge)

    if not all_masses:
        return np.array([])

    return np.column_stack([np.array(all_masses), np.array(all_intensities)])


def dot_product_similarity(spectrum1: np.ndarray, spectrum2: np.ndarray, tolerance: float = 0.5) -> float:
    if len(spectrum1) == 0 or len(spectrum2) == 0:
        return 0.0

    mz1, int1 = spectrum1[:, 0], spectrum1[:, 1]
    mz2, int2 = spectrum2[:, 0], spectrum2[:, 1]

    int1_norm = int1 / (np.linalg.norm(int1) + 1e-12)
    int2_norm = int2 / (np.linalg.norm(int2) + 1e-12)

    score = 0.0
    for i in range(len(mz1)):
        diffs = np.abs(mz2 - mz1[i])
        matches = np.where(diffs <= tolerance)[0]
        if len(matches) > 0:
            best = matches[np.argmin(diffs[matches])]
            score += int1_norm[i] * int2_norm[best]

    return score


def calc_precursor_purity(
    precursor_mz: float,
    ms1_mz: np.ndarray,
    ms1_intensity: np.ndarray,
    isolation_window: float = 1.5,
) -> float:
    if len(ms1_mz) == 0:
        return 0.0

    mask = np.abs(ms1_mz - precursor_mz) <= isolation_window
    selected_int = ms1_intensity[mask]
    total_int = np.sum(ms1_intensity)

    if total_int == 0:
        return 0.0

    return np.sum(selected_int) / total_int


def file_hash(filepath: str) -> str:
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            data = f.read(65536)
            if not data:
                break
            sha256.update(data)
    return sha256.hexdigest()


def parse_mod_string(mod_str: str) -> dict:
    mods = {}
    if not mod_str:
        return mods
    parts = mod_str.split(";")
    for part in parts:
        if part.strip():
            pos, mass = part.strip().split(":")
            mods[int(pos)] = float(mass)
    return mods


def format_mod_string(mods: dict) -> str:
    if not mods:
        return ""
    return ";".join(f"{pos}:{mass:.4f}" for pos, mass in sorted(mods.items()))
