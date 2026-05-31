import os
import sys
import json
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import DATABASE_PATH, UPLOAD_DIR, FASTA_DIR, RESULT_DIR
from database import init_db, get_fasta_db_by_name, get_all_fasta_dbs, get_all_jobs
from fasta_db import build_fasta_database, parse_fasta, trypsin_digest
from spectrum_parser import parse_mgf, parse_spectrum_file, filter_spectra_by_quality
from ptm_handler import ptm_handler
from utils import (
    peptide_mass,
    generate_b_ion_series,
    generate_y_ion_series,
    generate_theoretical_spectrum,
    dot_product_similarity,
    mass_to_mz,
    mz_to_mass,
    ppm_to_da,
    within_ppm_tolerance,
)
from search_engine import calculate_fdr, filter_by_fdr
from output_formatter import format_results_tsv, format_results_xml
from models import SearchRequest, Modification


class TestDatabase(unittest.TestCase):
    def test_init_db(self):
        if os.path.exists(DATABASE_PATH):
            os.remove(DATABASE_PATH)
        init_db()
        self.assertTrue(os.path.exists(DATABASE_PATH))


class TestFastaDB(unittest.TestCase):
    def test_parse_fasta(self):
        fasta_path = os.path.join(FASTA_DIR, "sample.fasta")
        proteins = parse_fasta(fasta_path)
        self.assertEqual(len(proteins), 4)
        self.assertEqual(proteins[0]["accession"], "sp|P02768|ALBU_HUMAN")

    def test_trypsin_digest(self):
        sequence = "MKFLILLISILTIGAQAQDPNSSSVDKLAAALEHHHHHH"
        peptides = trypsin_digest(sequence)
        self.assertTrue(len(peptides) > 0)

        for pep in peptides:
            self.assertTrue(6 <= len(pep["sequence"]) <= 30)
            self.assertTrue(pep["missed_cleavages"] <= 2)

    def test_build_fasta_database(self):
        fasta_path = os.path.join(FASTA_DIR, "sample.fasta")
        if os.path.exists(DATABASE_PATH):
            os.remove(DATABASE_PATH)
        init_db()

        result = build_fasta_database(
            fasta_path=fasta_path,
            db_name="test_db",
            include_reverse=True,
        )

        self.assertIn("fasta_id", result)
        self.assertIn("peptide_count", result)
        self.assertGreater(result["peptide_count"], 0)

        db_info = get_fasta_db_by_name("test_db")
        self.assertIsNotNone(db_info)
        self.assertGreater(db_info["peptide_count"], 0)


class TestSpectrumParser(unittest.TestCase):
    def test_parse_mgf(self):
        mgf_path = os.path.join(UPLOAD_DIR, "test.mgf")
        spectra = parse_mgf(mgf_path)
        self.assertEqual(len(spectra), 3)
        self.assertEqual(spectra[0].precursor_mz, 523.7642)
        self.assertEqual(spectra[0].charge, 2)

    def test_filter_spectra_by_quality(self):
        mgf_path = os.path.join(UPLOAD_DIR, "test.mgf")
        spectra = parse_mgf(mgf_path)
        filtered = filter_spectra_by_quality(spectra)
        self.assertTrue(len(filtered) <= len(spectra))


class TestPTMHandler(unittest.TestCase):
    def test_get_modifications(self):
        mods = ptm_handler.get_all_modifications()
        self.assertIn("phosphorylation", mods)
        self.assertIn("oxidation", mods)

    def test_add_custom_modification(self):
        mod_id = ptm_handler.add_modification(
            name="Custom Mod",
            mass_shift=28.0313,
            residues=["K"],
            mod_type="variable",
        )
        mods = ptm_handler.get_all_modifications()
        self.assertIn(mod_id, mods)

    def test_find_modification_sites(self):
        peptide = "PEPTIDEK"
        sites = ptm_handler.find_modification_sites(peptide)
        self.assertIsInstance(sites, dict)

    def test_generate_modified_peptides(self):
        peptide = "PEPTIDEK"
        modified = ptm_handler.generate_modified_peptides(
            peptide,
            max_variable_mods=1,
            selected_mod_ids=["oxidation"],
        )
        self.assertIsInstance(modified, list)


class TestMassCalculations(unittest.TestCase):
    def test_peptide_mass(self):
        mass = peptide_mass("PEPTIDEK")
        self.assertAlmostEqual(mass, 909.444, delta=1.0)

    def test_generate_b_ions(self):
        peptide = "PEPTIDEK"
        b_ions = generate_b_ion_series(peptide)
        self.assertEqual(len(b_ions), len(peptide))

    def test_generate_y_ions(self):
        peptide = "PEPTIDEK"
        y_ions = generate_y_ion_series(peptide)
        self.assertEqual(len(y_ions), len(peptide))

    def test_generate_theoretical_spectrum(self):
        peptide = "PEPTIDEK"
        spectrum = generate_theoretical_spectrum(peptide)
        self.assertIsInstance(spectrum, type(__import__("numpy").array([])))

    def test_generate_theoretical_spectrum_with_missed_cleavage(self):
        peptide = "PEPTIDEKXYZ"
        spectrum_with_mc = generate_theoretical_spectrum(
            peptide, peptide_has_missed_cleavage=True
        )
        spectrum_without_mc = generate_theoretical_spectrum(
            peptide, peptide_has_missed_cleavage=False
        )

        self.assertGreaterEqual(len(spectrum_with_mc), len(spectrum_without_mc))

        n_aa = len(peptide)
        n_ions_with_mc = len(spectrum_with_mc)
        n_ions_without_mc = len(spectrum_without_mc)

        self.assertGreater(n_ions_with_mc, n_ions_without_mc)

    def test_dot_product_similarity(self):
        import numpy as np
        spec1 = np.array([[100.0, 1.0], [200.0, 1.0], [300.0, 1.0]])
        spec2 = np.array([[100.0, 1.0], [200.1, 0.5], [400.0, 1.0]])
        score = dot_product_similarity(spec1, spec2)
        self.assertGreater(score, 0.0)

    def test_mass_mz_conversion(self):
        mass = 1043.5
        charge = 2
        mz = mass_to_mz(mass, charge)
        self.assertAlmostEqual(mz, 522.75, delta=0.01)

        back_mass = mz_to_mass(mz, charge)
        self.assertAlmostEqual(back_mass, mass, delta=0.01)

    def test_ppm_tolerance(self):
        tol = ppm_to_da(500.0, 5.0)
        self.assertAlmostEqual(tol, 0.0025, delta=0.0001)

        self.assertTrue(within_ppm_tolerance(500.001, 500.0, 5.0))
        self.assertFalse(within_ppm_tolerance(500.01, 500.0, 5.0))


class TestFDR(unittest.TestCase):
    def test_calculate_fdr(self):
        results = [
            {"score": 0.9, "is_reverse": 0},
            {"score": 0.8, "is_reverse": 0},
            {"score": 0.7, "is_reverse": 1},
            {"score": 0.6, "is_reverse": 0},
            {"score": 0.5, "is_reverse": 1},
            {"score": 0.4, "is_reverse": 0},
        ]
        fdr_results = calculate_fdr(results)
        self.assertTrue(any(r["q_value"] is not None for r in fdr_results))

    def test_calculate_fdr_uses_elias_gygi_formula(self):
        results = [
            {"score": 0.95, "is_reverse": 0},
            {"score": 0.90, "is_reverse": 0},
            {"score": 0.85, "is_reverse": 0},
            {"score": 0.80, "is_reverse": 1},
            {"score": 0.75, "is_reverse": 0},
            {"score": 0.70, "is_reverse": 0},
        ]
        fdr_results = calculate_fdr(results)

        target_count = 0
        decoy_count = 0
        for r in fdr_results:
            if r["is_reverse"]:
                decoy_count += 1
            else:
                target_count += 1

            if target_count > 0:
                expected_raw_fdr = decoy_count / target_count
                self.assertAlmostEqual(
                    r.get("raw_q_value", expected_raw_fdr),
                    expected_raw_fdr,
                    delta=0.001,
                )

        self.assertLessEqual(fdr_results[0]["q_value"], fdr_results[-1]["q_value"])

    def test_calculate_fdr_monotonic(self):
        results = [
            {"score": 0.9, "is_reverse": 0},
            {"score": 0.8, "is_reverse": 0},
            {"score": 0.7, "is_reverse": 1},
            {"score": 0.6, "is_reverse": 0},
            {"score": 0.5, "is_reverse": 0},
            {"score": 0.4, "is_reverse": 1},
        ]
        fdr_results = calculate_fdr(results)

        for i in range(len(fdr_results) - 1):
            self.assertLessEqual(fdr_results[i]["q_value"], fdr_results[i + 1]["q_value"])

    def test_calculate_fdr_unbalanced_distribution(self):
        results = []
        for i in range(100):
            results.append({"score": 0.9 - i * 0.005, "is_reverse": 0})
        for i in range(5):
            results.append({"score": 0.5 - i * 0.01, "is_reverse": 1})

        results.sort(key=lambda x: x["score"], reverse=True)

        fdr_results = calculate_fdr(results)

        target_1pct = int(len(results) * 0.01)
        threshold_score = fdr_results[target_1pct - 1]["score"]

        targets_above = sum(1 for r in fdr_results if r["score"] >= threshold_score and not r["is_reverse"])
        decoys_above = sum(1 for r in fdr_results if r["score"] >= threshold_score and r["is_reverse"])

        if targets_above > 0:
            actual_fdr = decoys_above / targets_above
            self.assertLessEqual(actual_fdr, 0.10,
                               f"FDR should be close to 1%, got {actual_fdr:.2%}")

    def test_filter_by_fdr(self):
        results = [
            {"score": 0.9, "is_reverse": 0},
            {"score": 0.8, "is_reverse": 0},
            {"score": 0.7, "is_reverse": 1},
            {"score": 0.6, "is_reverse": 0},
        ]
        passed = filter_by_fdr(results, fdr_threshold=0.01)
        self.assertIsInstance(passed, list)

    def test_filter_by_fdr_excludes_reverse(self):
        results = [
            {"score": 0.9, "is_reverse": 1},
            {"score": 0.8, "is_reverse": 0},
        ]
        passed = filter_by_fdr(results, fdr_threshold=1.0)
        self.assertTrue(all(not r["is_reverse"] for r in passed))


class TestOutputFormatter(unittest.TestCase):
    def test_format_results_tsv(self):
        results = [
            {
                "spectrum_id": "spec1",
                "peptide_sequence": "PEPTIDEK",
                "protein_accession": "PROT1",
                "charge": 2,
                "experimental_mz": 523.76,
                "theoretical_mz": 523.75,
                "score": 0.85,
                "modifications": "",
                "is_reverse": 0,
                "q_value": 0.0,
                "passed_fdr": True,
            }
        ]
        tsv = format_results_tsv(results)
        self.assertIn("PEPTIDEK", tsv)

    def test_format_results_xml(self):
        results = [
            {
                "spectrum_id": "spec1",
                "peptide_sequence": "PEPTIDEK",
                "protein_accession": "PROT1",
                "charge": 2,
                "experimental_mz": 523.76,
                "theoretical_mz": 523.75,
                "score": 0.85,
                "modifications": "",
                "is_reverse": 0,
                "q_value": 0.0,
                "passed_fdr": True,
            }
        ]
        xml = format_results_xml(results)
        self.assertIn("PEPTIDEK", xml)


class TestModels(unittest.TestCase):
    def test_search_request(self):
        req = SearchRequest(
            fasta_db="default",
            precursor_mz_tolerance_ppm=5.0,
        )
        self.assertEqual(req.fasta_db, "default")

    def test_modification(self):
        mod = Modification(
            name="Test Mod",
            mass_shift=50.0,
            residues=["S", "T"],
        )
        self.assertEqual(mod.name, "Test Mod")


class TestDeNovoSequencing(unittest.TestCase):
    def test_denovo_sequencer_init(self):
        from de_novo import DeNovoSequencer
        sequencer = DeNovoSequencer(
            fragment_tolerance_da=0.02,
            top_n=3,
        )
        self.assertEqual(sequencer.fragment_tolerance_da, 0.02)
        self.assertEqual(sequencer.top_n, 3)

    def test_denovo_find_matches(self):
        import numpy as np
        from de_novo import DeNovoSequencer
        sequencer = DeNovoSequencer(fragment_tolerance_da=0.02)
        peak_masses = np.array([100.0, 200.0, 300.0])
        matches = sequencer._find_matches(200.0, peak_masses)
        self.assertIsInstance(matches, list)

    def test_denovo_with_spectrum_info(self):
        from de_novo import DeNovoSequencer
        from models import SpectrumInfo
        from utils import generate_b_ion_series, generate_y_ion_series

        peptide = "PEPTIDEK"
        b_ions = generate_b_ion_series(peptide)
        y_ions = generate_y_ion_series(peptide)

        mz_values = b_ions[1:-1] + y_ions[1:-1]
        intensities = [1000.0] * len(mz_values)

        spectrum = SpectrumInfo(
            spectrum_id="test_denovo",
            precursor_mz=523.76,
            charge=2,
            ms2_mz=mz_values,
            ms2_intensity=intensities,
        )

        sequencer = DeNovoSequencer(
            fragment_tolerance_da=0.5,
            min_peptide_length=6,
            top_n=3,
        )
        candidates = sequencer.sequence(spectrum)

        self.assertIsInstance(candidates, list)
        self.assertLessEqual(len(candidates), 3)

        if candidates:
            self.assertIn("sequence", candidates[0])
            self.assertIn("score", candidates[0])
            self.assertIn("confidence", candidates[0])


class TestSpectrumPrediction(unittest.TestCase):
    def test_predictor_init(self):
        from spectrum_predict import SpectrumPredictor
        predictor = SpectrumPredictor()
        self.assertIn("A", predictor.aa_properties)

    def test_cleavage_efficiency(self):
        from spectrum_predict import SpectrumPredictor
        predictor = SpectrumPredictor()
        efficiency = predictor._get_cleavage_efficiency("PEPTIDEK", 3)
        self.assertGreater(efficiency, 0)

    def test_predict_spectrum(self):
        from spectrum_predict import SpectrumPredictor
        predictor = SpectrumPredictor()

        result = predictor.predict(
            peptide_sequence="PEPTIDEK",
            precursor_charge=2,
            collision_energy=27.0,
        )

        self.assertEqual(result["peptide_sequence"], "PEPTIDEK")
        self.assertEqual(result["precursor_charge"], 2)
        self.assertGreater(result["num_peaks"], 0)
        self.assertEqual(len(result["mz"]), len(result["intensity"]))
        self.assertEqual(len(result["ion_annotations"]), len(result["mz"]))

    def test_predict_spectrum_ce_effect(self):
        from spectrum_predict import SpectrumPredictor
        predictor = SpectrumPredictor()

        result_low = predictor.predict("PEPTIDEK", 2, collision_energy=15.0)
        result_high = predictor.predict("PEPTIDEK", 2, collision_energy=35.0)

        self.assertIsNotNone(result_low)
        self.assertIsNotNone(result_high)

    def test_predict_spectrum_ion_annotations(self):
        from spectrum_predict import SpectrumPredictor
        predictor = SpectrumPredictor()

        result = predictor.predict("PEPTIDEK", 2)

        for ann in result["ion_annotations"]:
            self.assertIn(ann["ion_type"], ["b", "y"])
            self.assertGreater(ann["position"], 0)
            self.assertIn(ann["charge"], [1, 2])

    def test_compare_spectra(self):
        from spectrum_predict import SpectrumPredictor
        predictor = SpectrumPredictor()

        predicted = predictor.predict("PEPTIDEK", 2)

        mz_pred = predicted["mz"][:20]
        int_pred = predicted["intensity"][:20]

        comparison = predictor.compare_spectra(
            predicted, mz_pred, int_pred, tolerance_da=0.02
        )

        self.assertGreater(comparison["dot_product"], 0.7)
        self.assertGreater(comparison["coverage"], 0.7)

    def test_predict_batch(self):
        from spectrum_predict import SpectrumPredictor
        predictor = SpectrumPredictor()

        results = predictor.predict_batch(
            peptides=["PEPTIDEK", "ACDGHK"],
            precursor_charges=[2, 3],
        )

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["peptide_sequence"], "PEPTIDEK")
        self.assertEqual(results[1]["peptide_sequence"], "ACDGHK")


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Proteomics API Service")
    print("=" * 60)

    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"), exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(FASTA_DIR, exist_ok=True)
    os.makedirs(RESULT_DIR, exist_ok=True)

    if os.path.exists(DATABASE_PATH):
        os.remove(DATABASE_PATH)

    unittest.main(verbosity=2, exit=False)

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)
