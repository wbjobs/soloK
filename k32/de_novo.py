import numpy as np
from typing import List, Dict, Tuple, Optional

from config import (
    AMINO_ACID_MASSES,
    PROTON_MASS,
    WATER_MASS,
    FRAGMENT_MZ_TOLERANCE_DA,
)
from models import SpectrumInfo


class DeNovoSequencer:
    def __init__(
        self,
        fragment_tolerance_da: float = 0.02,
        ion_types: List[str] = None,
        min_peptide_length: int = 4,
        max_peptide_length: int = 30,
        top_n: int = 3,
    ):
        self.fragment_tolerance_da = fragment_tolerance_da
        self.ion_types = ion_types or ["b", "y"]
        self.min_peptide_length = min_peptide_length
        self.max_peptide_length = max_peptide_length
        self.top_n = top_n

        self.aa_masses = {k: v for k, v in AMINO_ACID_MASSES.items() if k != "X"}
        self.aa_list = sorted(self.aa_masses.keys(), key=lambda x: self.aa_masses[x])
        self.mass_list = np.array([self.aa_masses[aa] for aa in self.aa_list])

    def _find_matches(self, target_mass: float, peak_masses: np.ndarray) -> List[int]:
        diffs = np.abs(peak_masses - target_mass)
        matches = np.where(diffs <= self.fragment_tolerance_da)[0]
        return matches.tolist()

    def _extract_b_ion_masses(self, mz_values: np.ndarray, charge: int = 1) -> np.ndarray:
        if charge == 1:
            return mz_values
        else:
            return mz_values * charge - (charge - 1) * PROTON_MASS

    def _extract_y_ion_masses(self, mz_values: np.ndarray, charge: int = 1) -> np.ndarray:
        if charge == 1:
            return mz_values - WATER_MASS
        else:
            return (mz_values * charge - (charge - 1) * PROTON_MASS) - WATER_MASS

    def _preprocess_spectrum(
        self,
        mz_values: np.ndarray,
        intensities: np.ndarray,
        max_peaks: int = 200,
    ) -> Tuple[np.ndarray, np.ndarray]:
        if len(mz_values) == 0:
            return np.array([]), np.array([])

        top_indices = np.argsort(intensities)[-max_peaks:][::-1]
        return mz_values[top_indices], intensities[top_indices]

    def _build_prefix_graph(
        self,
        b_ion_candidates: np.ndarray,
        b_intensities: np.ndarray,
        precursor_mass: float,
    ) -> Dict[float, List[Tuple[str, float, float]]]:
        graph = {0.0: [("", 0.0, 1.0)]}
        sorted_masses = np.sort(b_ion_candidates)

        for current_mass in sorted_masses:
            if current_mass <= 0:
                continue

            best_paths = []
            seen = set()

            for prev_mass, paths in graph.items():
                mass_diff = current_mass - prev_mass
                if mass_diff <= 0:
                    continue
                if mass_diff > max(self.mass_list) + self.fragment_tolerance_da:
                    continue
                if mass_diff < min(self.mass_list) - self.fragment_tolerance_da:
                    continue

                matches = np.where(np.abs(self.mass_list - mass_diff) <= self.fragment_tolerance_da)[0]

                for match_idx in matches:
                    aa = self.aa_list[match_idx]
                    aa_mass = self.mass_list[match_idx]

                    for prev_seq, prev_score, prev_int in paths:
                        new_seq = prev_seq + aa
                        new_score = prev_score + 1
                        key = (new_seq, round(current_mass, 3))
                        if key not in seen:
                            seen.add(key)
                            best_paths.append((new_seq, new_score, current_mass))

            if best_paths:
                if current_mass not in graph:
                    graph[current_mass] = []
                graph[current_mass].extend(best_paths)
                graph[current_mass] = sorted(
                    graph[current_mass], key=lambda x: -x[1]
                )[:10]

        return graph

    def _score_candidate(
        self,
        sequence: str,
        mz_values: np.ndarray,
        intensities: np.ndarray,
        precursor_charge: int,
    ) -> Dict:
        from utils import (
            generate_b_ion_series,
            generate_y_ion_series,
            dot_product_similarity,
            generate_theoretical_spectrum,
        )

        theo_spec = generate_theoretical_spectrum(
            sequence,
            max_charge=min(precursor_charge, 2),
        )

        if len(theo_spec) == 0:
            return {"sequence": sequence, "score": 0.0, "matched_peaks": 0}

        exp_spec = np.column_stack([mz_values, intensities])
        score = dot_product_similarity(theo_spec, exp_spec, self.fragment_tolerance_da)

        b_theo = generate_b_ion_series(sequence)
        y_theo = generate_y_ion_series(sequence)

        matched_b = 0
        for m in b_theo[:-1]:
            if len(self._find_matches(m, mz_values)) > 0:
                matched_b += 1

        matched_y = 0
        for m in y_theo[:-1]:
            if len(self._find_matches(m, mz_values)) > 0:
                matched_y += 1

        seq_len = len(sequence)
        coverage = (matched_b + matched_y) / max(1, 2 * (seq_len - 1)) if seq_len > 1 else 0

        return {
            "sequence": sequence,
            "score": float(score),
            "matched_b_ions": matched_b,
            "matched_y_ions": matched_y,
            "coverage": float(coverage),
        }

    def sequence(
        self,
        spectrum: SpectrumInfo,
        precursor_mass: Optional[float] = None,
    ) -> List[Dict]:
        mz_values = np.array(spectrum.ms2_mz, dtype=np.float64)
        intensities = np.array(spectrum.ms2_intensity, dtype=np.float64)

        if len(mz_values) == 0:
            return []

        mz_values, intensities = self._preprocess_spectrum(mz_values, intensities)

        if precursor_mass is None:
            from utils import mz_to_mass
            precursor_mass = mz_to_mass(spectrum.precursor_mz, spectrum.charge)

        charge = spectrum.charge

        all_candidates = set()

        for charge_state in range(1, min(charge, 2) + 1):
            if "b" in self.ion_types:
                b_masses = self._extract_b_ion_masses(mz_values, charge_state)
                b_graph = self._build_prefix_graph(b_masses, intensities, precursor_mass)

                for mass, paths in b_graph.items():
                    for seq, score, _ in paths:
                        if self.min_peptide_length <= len(seq) <= self.max_peptide_length:
                            all_candidates.add(seq)

        candidates = list(all_candidates)

        if not candidates:
            candidates = self._generate_tag_candidates(mz_values, intensities, precursor_mass)

        if not candidates:
            return []

        scored_candidates = []
        for seq in candidates:
            result = self._score_candidate(seq, mz_values, intensities, charge)
            scored_candidates.append(result)

        scored_candidates.sort(key=lambda x: -x["score"])

        seen = set()
        unique_candidates = []
        for cand in scored_candidates:
            if cand["sequence"] not in seen:
                seen.add(cand["sequence"])
                unique_candidates.append(cand)
                if len(unique_candidates) >= self.top_n:
                    break

        max_score = max([c["score"] for c in unique_candidates]) if unique_candidates else 1.0
        for cand in unique_candidates:
            cand["confidence"] = cand["score"] / max_score if max_score > 0 else 0.0

        return unique_candidates

    def _generate_tag_candidates(
        self,
        mz_values: np.ndarray,
        intensities: np.ndarray,
        precursor_mass: float,
    ) -> List[str]:
        candidates = []
        sorted_idx = np.argsort(intensities)[::-1]

        for start_idx in sorted_idx[:50]:
            start_mass = mz_values[start_idx]

            for end_idx in sorted_idx[:100]:
                if start_idx == end_idx:
                    continue

                end_mass = mz_values[end_idx]
                mass_diff = abs(end_mass - start_mass)

                if mass_diff < 57.0 or mass_diff > 187.0:
                    continue

                matches = np.where(np.abs(self.mass_list - mass_diff) <= 0.05)[0]
                if len(matches) > 0:
                    aa = self.aa_list[matches[0]]
                    if len(aa) >= self.min_peptide_length - 2:
                        candidates.append(aa)

        return candidates[:20]


def de_novo_sequence(
    spectrum: SpectrumInfo,
    fragment_tolerance_da: float = 0.02,
    top_n: int = 3,
) -> List[Dict]:
    sequencer = DeNovoSequencer(
        fragment_tolerance_da=fragment_tolerance_da,
        top_n=top_n,
    )
    return sequencer.sequence(spectrum)


def de_novo_batch(
    spectra: List[SpectrumInfo],
    fragment_tolerance_da: float = 0.02,
    top_n: int = 3,
    num_workers: int = None,
) -> Dict[str, List[Dict]]:
    from config import NUM_WORKERS
    from concurrent.futures import ThreadPoolExecutor, as_completed

    num_workers = num_workers or NUM_WORKERS
    sequencer = DeNovoSequencer(
        fragment_tolerance_da=fragment_tolerance_da,
        top_n=top_n,
    )

    results = {}

    if len(spectra) <= 5:
        for spec in spectra:
            results[spec.spectrum_id] = sequencer.sequence(spec)
    else:
        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            future_to_spec = {
                executor.submit(sequencer.sequence, spec): spec.spectrum_id
                for spec in spectra
            }
            for future in as_completed(future_to_spec):
                spec_id = future_to_spec[future]
                try:
                    results[spec_id] = future.result()
                except Exception:
                    results[spec_id] = []

    return results
