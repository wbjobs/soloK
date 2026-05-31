import numpy as np
from typing import List, Dict, Optional, Tuple

from config import (
    AMINO_ACID_MASSES,
    PROTON_MASS,
    WATER_MASS,
    FRAGMENT_MZ_TOLERANCE_DA,
)
from utils import peptide_mass, mass_to_mz


class SpectrumPredictor:
    def __init__(self):
        self.aa_properties = {
            "A": {"hydrophobicity": 1.8, "volume": 88.6, "cleavage_efficiency": 1.0},
            "R": {"hydrophobicity": -4.5, "volume": 173.4, "cleavage_efficiency": 0.8},
            "N": {"hydrophobicity": -3.5, "volume": 114.1, "cleavage_efficiency": 0.9},
            "D": {"hydrophobicity": -3.5, "volume": 111.1, "cleavage_efficiency": 0.85},
            "C": {"hydrophobicity": 2.5, "volume": 108.5, "cleavage_efficiency": 0.7},
            "Q": {"hydrophobicity": -3.5, "volume": 143.8, "cleavage_efficiency": 0.9},
            "E": {"hydrophobicity": -3.5, "volume": 138.4, "cleavage_efficiency": 0.85},
            "G": {"hydrophobicity": -0.4, "volume": 60.1, "cleavage_efficiency": 1.1},
            "H": {"hydrophobicity": -3.2, "volume": 153.2, "cleavage_efficiency": 0.75},
            "I": {"hydrophobicity": 4.5, "volume": 166.7, "cleavage_efficiency": 1.0},
            "L": {"hydrophobicity": 3.8, "volume": 166.7, "cleavage_efficiency": 1.0},
            "K": {"hydrophobicity": -3.9, "volume": 168.6, "cleavage_efficiency": 0.9},
            "M": {"hydrophobicity": 1.9, "volume": 162.9, "cleavage_efficiency": 0.95},
            "F": {"hydrophobicity": 2.8, "volume": 189.9, "cleavage_efficiency": 0.85},
            "P": {"hydrophobicity": -1.6, "volume": 112.7, "cleavage_efficiency": 0.4},
            "S": {"hydrophobicity": -0.8, "volume": 89.0, "cleavage_efficiency": 1.0},
            "T": {"hydrophobicity": -0.7, "volume": 116.1, "cleavage_efficiency": 1.0},
            "W": {"hydrophobicity": -0.9, "volume": 227.8, "cleavage_efficiency": 0.7},
            "Y": {"hydrophobicity": -1.3, "volume": 193.6, "cleavage_efficiency": 0.85},
            "V": {"hydrophobicity": 4.2, "volume": 140.0, "cleavage_efficiency": 1.0},
        }

        self.neighbor_effects = {
            ("R", "P"): 0.3, ("K", "P"): 0.3,
            ("P", "P"): 0.2,
            ("D", "P"): 1.5, ("E", "P"): 1.5,
        }

    def _get_cleavage_efficiency(self, peptide: str, position: int) -> float:
        if position <= 0 or position >= len(peptide):
            return 0.0

        if position == len(peptide) - 1:
            return 0.1

        n_term = peptide[position - 1] if position > 0 else "G"
        c_term = peptide[position]

        efficiency = 1.0

        if c_term == "P":
            efficiency *= 0.4
        if n_term == "P":
            efficiency *= 0.5

        pair = (n_term, c_term)
        if pair in self.neighbor_effects:
            efficiency *= self.neighbor_effects[pair]

        if n_term in self.aa_properties:
            efficiency *= self.aa_properties[n_term]["cleavage_efficiency"]

        n_pos = position / max(len(peptide), 1)
        if 0.2 < n_pos < 0.8:
            efficiency *= 1.2
        else:
            efficiency *= 0.8

        return efficiency

    def _predict_ion_intensity(
        self,
        peptide: str,
        position: int,
        ion_type: str,
        charge: int,
        collision_energy: float,
    ) -> float:
        if position <= 0 or position >= len(peptide):
            return 0.0

        base_intensity = self._get_cleavage_efficiency(peptide, position)

        if ion_type == "b":
            if position <= 2:
                base_intensity *= 0.7
            elif position >= len(peptide) - 2:
                base_intensity *= 0.5
        elif ion_type == "y":
            y_pos = len(peptide) - position
            if y_pos <= 2:
                base_intensity *= 0.7
            elif y_pos >= len(peptide) - 2:
                base_intensity *= 0.5

        aa1 = peptide[position - 1] if position > 0 else "G"
        aa2 = peptide[position] if position < len(peptide) else "G"

        if aa1 in ["R", "K", "H"] and ion_type == "b":
            base_intensity *= 1.3
        if aa2 in ["R", "K", "H"] and ion_type == "y":
            base_intensity *= 1.3

        if aa1 == "P" and ion_type == "y":
            base_intensity *= 2.0
        if aa2 == "P" and ion_type == "b":
            base_intensity *= 2.0

        ce_factor = 1.0
        if collision_energy < 20:
            ce_factor = 0.5 + (collision_energy / 40)
        elif collision_energy > 35:
            ce_factor = max(0.3, 1.0 - (collision_energy - 35) * 0.05)

        charge_factor = 1.0
        if charge >= 2:
            charge_factor = 0.6

        intensity = base_intensity * ce_factor * charge_factor

        return max(0.01, intensity)

    def _generate_ion_masses(self, peptide: str, modifications: Dict = None) -> Dict[str, List[float]]:
        from utils import generate_b_ion_series, generate_y_ion_series

        masses = {
            "b": generate_b_ion_series(peptide, modifications),
            "y": generate_y_ion_series(peptide, modifications),
        }
        return masses

    def predict(
        self,
        peptide_sequence: str,
        precursor_charge: int,
        collision_energy: float = 27.0,
        ion_types: List[str] = None,
        modifications: Dict[int, float] = None,
        normalize: bool = True,
    ) -> Dict:
        if ion_types is None:
            ion_types = ["b", "y"]

        ion_masses = self._generate_ion_masses(peptide_sequence, modifications)

        all_mz = []
        all_intensities = []
        ion_annotations = []

        max_charge = min(precursor_charge, 3)

        for ion_type in ion_types:
            masses = ion_masses[ion_type]
            for charge in range(1, max_charge + 1):
                for pos, mass in enumerate(masses):
                    if pos == 0 or pos == len(masses) - 1:
                        continue

                    mz = mass_to_mz(mass, charge)
                    intensity = self._predict_ion_intensity(
                        peptide_sequence, pos, ion_type, charge, collision_energy
                    )

                    if intensity > 0.01:
                        all_mz.append(mz)
                        all_intensities.append(intensity)
                        ion_annotations.append({
                            "ion_type": ion_type,
                            "position": pos + 1 if ion_type == "b" else len(peptide_sequence) - pos,
                            "charge": charge,
                        })

        all_mz = np.array(all_mz)
        all_intensities = np.array(all_intensities)

        if normalize and len(all_intensities) > 0:
            all_intensities = all_intensities / np.max(all_intensities)

        sorted_indices = np.argsort(all_mz)
        all_mz = all_mz[sorted_indices]
        all_intensities = all_intensities[sorted_indices]
        ion_annotations = [ion_annotations[i] for i in sorted_indices]

        precursor_mass = peptide_mass(peptide_sequence, modifications)
        precursor_mz = mass_to_mz(precursor_mass, precursor_charge)

        return {
            "peptide_sequence": peptide_sequence,
            "precursor_charge": precursor_charge,
            "precursor_mz": float(precursor_mz),
            "precursor_mass": float(precursor_mass),
            "collision_energy": collision_energy,
            "mz": all_mz.tolist(),
            "intensity": all_intensities.tolist(),
            "ion_annotations": ion_annotations,
            "num_peaks": len(all_mz),
        }

    def predict_batch(
        self,
        peptides: List[str],
        precursor_charges: List[int],
        collision_energies: List[float] = None,
    ) -> List[Dict]:
        if collision_energies is None:
            collision_energies = [27.0] * len(peptides)

        results = []
        for pep, charge, ce in zip(peptides, precursor_charges, collision_energies):
            results.append(self.predict(pep, charge, ce))
        return results

    def compare_spectra(
        self,
        predicted: Dict,
        experimental_mz: List[float],
        experimental_intensity: List[float],
        tolerance_da: float = 0.02,
    ) -> Dict:
        from utils import dot_product_similarity

        pred_spec = np.column_stack([predicted["mz"], predicted["intensity"]])
        exp_spec = np.column_stack([experimental_mz, experimental_intensity])

        dotp = dot_product_similarity(pred_spec, exp_spec, tolerance_da)

        pred_masses = np.array(predicted["mz"])
        exp_masses = np.array(experimental_mz)

        matched_peaks = 0
        for mz in pred_masses:
            if np.any(np.abs(exp_masses - mz) <= tolerance_da):
                matched_peaks += 1

        coverage = matched_peaks / len(pred_masses) if len(pred_masses) > 0 else 0.0

        return {
            "dot_product": float(dotp),
            "matched_peaks": matched_peaks,
            "predicted_peaks": len(pred_masses),
            "coverage": float(coverage),
        }


_singleton_predictor = None


def predict_spectrum(
    peptide_sequence: str,
    precursor_charge: int,
    collision_energy: float = 27.0,
) -> Dict:
    global _singleton_predictor
    if _singleton_predictor is None:
        _singleton_predictor = SpectrumPredictor()
    return _singleton_predictor.predict(peptide_sequence, precursor_charge, collision_energy)


def validate_identification(
    peptide_sequence: str,
    precursor_charge: int,
    experimental_mz: List[float],
    experimental_intensity: List[float],
    collision_energy: float = 27.0,
    threshold: float = 0.3,
) -> Dict:
    predictor = SpectrumPredictor()
    predicted = predictor.predict(peptide_sequence, precursor_charge, collision_energy)
    comparison = predictor.compare_spectra(
        predicted, experimental_mz, experimental_intensity
    )

    return {
        "predicted_spectrum": predicted,
        "comparison": comparison,
        "is_valid": comparison["dot_product"] >= threshold,
        "threshold": threshold,
    }
