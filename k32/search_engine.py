import os
import json
from typing import List, Dict, Tuple, Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

from config import (
    PRECURSOR_MZ_TOLERANCE_PPM,
    FRAGMENT_MZ_TOLERANCE_DA,
    MIN_PEPTIDE_LENGTH,
    MAX_PEPTIDE_LENGTH,
    MAX_MISSED_CLEAVAGES,
    FDR_THRESHOLD,
    NUM_WORKERS,
    PROTON_MASS,
    WATER_MASS,
    AMINO_ACID_MASSES,
)
from models import SpectrumInfo, SearchRequest
from database import (
    get_peptides_by_mass_range,
    add_search_result,
    get_search_results,
)
from utils import (
    mz_to_mass,
    mass_to_mz,
    ppm_to_da,
    within_ppm_tolerance,
    generate_theoretical_spectrum,
    dot_product_similarity,
    peptide_mass,
    format_mod_string,
    parse_mod_string,
)
from ptm_handler import ptm_handler


def _process_spectrum_batch(args: Tuple) -> List[Dict]:
    spectra_batch, fasta_id, params, mod_ids = args

    results = []

    precursor_tol_ppm = params.get("precursor_mz_tolerance_ppm", PRECURSOR_MZ_TOLERANCE_PPM)
    fragment_tol_da = params.get("fragment_mz_tolerance_da", FRAGMENT_MZ_TOLERANCE_DA)
    ion_types = params.get("ion_types", ["b", "y"])
    max_charge = params.get("max_charge", 2)
    max_mods = 2

    for spectrum in spectra_batch:
        spec_id = spectrum["spectrum_id"]
        precursor_mz = spectrum["precursor_mz"]
        charge = spectrum["charge"]

        if charge <= 0:
            continue

        precursor_mass = mz_to_mass(precursor_mz, charge)

        tol_da = ppm_to_da(precursor_mz, precursor_tol_ppm)
        mass_min = precursor_mass - tol_da * charge
        mass_max = precursor_mass + tol_da * charge

        peptides_forward = get_peptides_by_mass_range(mass_min, mass_max, fasta_id=fasta_id, is_reverse=False)
        peptides_reverse = get_peptides_by_mass_range(mass_min, mass_max, fasta_id=fasta_id, is_reverse=True)

        if not peptides_forward and not peptides_reverse:
            continue

        ms2_mz = np.array(spectrum["ms2_mz"], dtype=np.float64)
        ms2_intensity = np.array(spectrum["ms2_intensity"], dtype=np.float64)

        if len(ms2_mz) == 0:
            continue

        exp_spectrum = np.column_stack([ms2_mz, ms2_intensity])

        best_score = 0.0
        best_match = None
        best_is_reverse = False

        for pep_dict in peptides_forward:
            pep_seq = pep_dict["sequence"]
            protein_acc = pep_dict["protein_accession"]
            has_missed_cleavage = pep_dict.get("missed_cleavages", 0) > 0

            modified_peptides = ptm_handler.generate_modified_peptides(
                pep_seq, max_variable_mods=max_mods, selected_mod_ids=mod_ids
            )

            for mod_pep in modified_peptides:
                mods = mod_pep["modifications"]

                if mods:
                    total_peptide_mass = peptide_mass(pep_seq, mods)
                else:
                    total_peptide_mass = pep_dict["mass"]

                theo_mz = mass_to_mz(total_peptide_mass, charge)
                if not within_ppm_tolerance(theo_mz, precursor_mz, precursor_tol_ppm):
                    continue

                theo_spectrum = generate_theoretical_spectrum(
                    pep_seq, mods, ion_types, max_charge,
                    peptide_has_missed_cleavage=has_missed_cleavage
                )

                if len(theo_spectrum) == 0:
                    continue

                score = dot_product_similarity(theo_spectrum, exp_spectrum, fragment_tol_da)

                if score > best_score:
                    best_score = score
                    best_match = {
                        "spectrum_id": spec_id,
                        "peptide_sequence": pep_seq,
                        "protein_accession": protein_acc,
                        "charge": charge,
                        "experimental_mz": precursor_mz,
                        "theoretical_mz": theo_mz,
                        "score": score,
                        "modifications": format_mod_string(mods),
                    }
                    best_is_reverse = False

        for pep_dict in peptides_reverse:
            pep_seq = pep_dict["sequence"]
            protein_acc = pep_dict["protein_accession"]
            has_missed_cleavage = pep_dict.get("missed_cleavages", 0) > 0

            modified_peptides = ptm_handler.generate_modified_peptides(
                pep_seq, max_variable_mods=max_mods, selected_mod_ids=mod_ids
            )

            for mod_pep in modified_peptides:
                mods = mod_pep["modifications"]

                if mods:
                    total_peptide_mass = peptide_mass(pep_seq, mods)
                else:
                    total_peptide_mass = pep_dict["mass"]

                theo_mz = mass_to_mz(total_peptide_mass, charge)
                if not within_ppm_tolerance(theo_mz, precursor_mz, precursor_tol_ppm):
                    continue

                theo_spectrum = generate_theoretical_spectrum(
                    pep_seq, mods, ion_types, max_charge,
                    peptide_has_missed_cleavage=has_missed_cleavage
                )

                if len(theo_spectrum) == 0:
                    continue

                score = dot_product_similarity(theo_spectrum, exp_spectrum, fragment_tol_da)

                if score > best_score:
                    best_score = score
                    best_match = {
                        "spectrum_id": spec_id,
                        "peptide_sequence": pep_seq,
                        "protein_accession": protein_acc,
                        "charge": charge,
                        "experimental_mz": precursor_mz,
                        "theoretical_mz": theo_mz,
                        "score": score,
                        "modifications": format_mod_string(mods),
                    }
                    best_is_reverse = True

        if best_match:
            best_match["is_reverse"] = best_is_reverse
            results.append(best_match)

    return results


def calculate_fdr(results: List[Dict]) -> List[Dict]:
    if not results:
        return results

    sorted_results = sorted(results, key=lambda x: x["score"], reverse=True)

    target_count = 0
    decoy_count = 0

    for result in sorted_results:
        if result["is_reverse"]:
            decoy_count += 1
        else:
            target_count += 1

        if target_count > 0:
            result["raw_q_value"] = decoy_count / target_count
            result["q_value"] = decoy_count / target_count
        else:
            result["raw_q_value"] = 1.0
            result["q_value"] = 1.0

        result["raw_decoy_count"] = decoy_count
        result["raw_target_count"] = target_count

    for i in range(len(sorted_results) - 2, -1, -1):
        sorted_results[i]["q_value"] = min(
            sorted_results[i]["q_value"],
            sorted_results[i + 1]["q_value"]
        )

    return sorted_results


def filter_by_fdr(results: List[Dict], fdr_threshold: float = FDR_THRESHOLD) -> List[Dict]:
    results_with_fdr = calculate_fdr(results)

    passed = []
    for result in results_with_fdr:
        result["passed_fdr"] = result["q_value"] <= fdr_threshold and not result["is_reverse"]
        if result["passed_fdr"]:
            passed.append(result)

    return passed


def search_spectra(
    spectra: List[SpectrumInfo],
    fasta_id: int,
    params: dict,
    mod_ids: List[str] = None,
    progress_callback: Callable = None,
) -> List[Dict]:
    spectra_dicts = []
    for spec in spectra:
        if isinstance(spec, SpectrumInfo):
            spectra_dicts.append({
                "spectrum_id": spec.spectrum_id,
                "precursor_mz": spec.precursor_mz,
                "charge": spec.charge,
                "ms2_mz": spec.ms2_mz,
                "ms2_intensity": spec.ms2_intensity,
            })
        else:
            spectra_dicts.append(spec)

    batch_size = max(1, len(spectra_dicts) // NUM_WORKERS)
    batches = []
    for i in range(0, len(spectra_dicts), batch_size):
        batch = spectra_dicts[i:i + batch_size]
        batches.append((batch, fasta_id, params, mod_ids))

    all_results = []

    if len(batches) == 1:
        all_results = _process_spectrum_batch(batches[0])
        if progress_callback:
            progress_callback(len(spectra_dicts), len(spectra_dicts))
    else:
        completed = 0
        total_spectra = len(spectra_dicts)

        with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
            futures = {executor.submit(_process_spectrum_batch, batch): batch for batch in batches}

            for future in as_completed(futures):
                batch_results = future.result()
                all_results.extend(batch_results)
                completed += len(futures[future][0])

                if progress_callback:
                    progress_callback(completed, total_spectra)

    return all_results


def perform_search(
    spectra: List[SpectrumInfo],
    fasta_id: int,
    params: dict,
    mod_ids: List[str] = None,
    job_id: str = None,
    progress_callback: Callable = None,
) -> Dict:
    from database import update_job_status

    if progress_callback is None and job_id:
        def progress_callback(completed, total):
            progress = int(completed / total * 50) if total > 0 else 0
            update_job_status(job_id, "running", progress=50 + progress,
                              message=f"Searching: {completed}/{total}")

    all_results = search_spectra(spectra, fasta_id, params, mod_ids, progress_callback)

    fdr_threshold = params.get("fdr_threshold", FDR_THRESHOLD)
    filtered_results = filter_by_fdr(all_results, fdr_threshold)

    if job_id:
        update_job_status(job_id, "running", progress=95, message="Saving results...")

        for result in all_results:
            add_search_result(
                job_id=job_id,
                spectrum_id=result["spectrum_id"],
                peptide_sequence=result["peptide_sequence"],
                protein_accession=result["protein_accession"],
                charge=result["charge"],
                experimental_mz=result["experimental_mz"],
                theoretical_mz=result["theoretical_mz"],
                score=result["score"],
                modifications=result.get("modifications"),
                is_reverse=bool(result.get("is_reverse")),
                q_value=result.get("q_value"),
                passed_fdr=result.get("passed_fdr", False),
            )

        update_job_status(
            job_id, "completed",
            progress=100,
            result_count=len(filtered_results),
            result_summary=json.dumps({
                "total_matches": len(all_results),
                "forward_matches": len([r for r in all_results if not r.get("is_reverse")]),
                "reverse_matches": len([r for r in all_results if r.get("is_reverse")]),
                "passed_fdr": len(filtered_results),
                "fdr_threshold": fdr_threshold,
            }),
        )

    return {
        "all_results": all_results,
        "filtered_results": filtered_results,
        "total_count": len(all_results),
        "passed_count": len(filtered_results),
    }
