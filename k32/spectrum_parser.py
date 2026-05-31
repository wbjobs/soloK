import os
import re
import numpy as np
from typing import List, Dict, Optional, Tuple

from lxml import etree

from config import PRECURSOR_PURITY_THRESHOLD
from models import SpectrumInfo
from utils import calc_precursor_purity, get_current_time


def parse_mgf(file_path: str) -> List[SpectrumInfo]:
    spectra = []
    current_spectrum = None
    in_ions = False

    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()

            if line == "BEGIN IONS":
                current_spectrum = {
                    "spectrum_id": f"spectrum_{len(spectra)}",
                    "precursor_mz": 0.0,
                    "charge": 0,
                    "rt": None,
                    "precursor_intensity": None,
                    "ms2_mz": [],
                    "ms2_intensity": [],
                }
                in_ions = True

            elif line == "END IONS":
                if current_spectrum and current_spectrum["precursor_mz"] > 0:
                    current_spectrum["ms2_mz"] = np.array(current_spectrum["ms2_mz"], dtype=np.float64)
                    current_spectrum["ms2_intensity"] = np.array(current_spectrum["ms2_intensity"], dtype=np.float64)
                    spectra.append(SpectrumInfo(**current_spectrum))
                in_ions = False
                current_spectrum = None

            elif in_ions and "=" in line:
                key, value = line.split("=", 1)
                key = key.strip().upper()

                if key == "PEPMASS":
                    parts = value.split()
                    current_spectrum["precursor_mz"] = float(parts[0])
                    if len(parts) > 1:
                        current_spectrum["precursor_intensity"] = float(parts[1])

                elif key == "CHARGE":
                    charge_str = value.strip()
                    if charge_str.endswith("+") or charge_str.endswith("-"):
                        charge_str = charge_str[:-1]
                    try:
                        current_spectrum["charge"] = int(charge_str)
                    except ValueError:
                        pass

                elif key == "RTINSECONDS":
                    current_spectrum["rt"] = float(value)

                elif key == "TITLE":
                    current_spectrum["spectrum_id"] = value.strip()

            elif in_ions and line and not line.startswith("#"):
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        mz = float(parts[0])
                        intensity = float(parts[1])
                        current_spectrum["ms2_mz"].append(mz)
                        current_spectrum["ms2_intensity"].append(intensity)
                    except ValueError:
                        pass

    return spectra


def parse_mzxml(file_path: str) -> List[SpectrumInfo]:
    spectra = []

    try:
        tree = etree.parse(file_path)
        root = tree.getroot()

        ns = root.nsmap if root.nsmap else {}
        ns_uri = ns.get(None, "http://sashimi.sourceforge.net/schema_revision/mzXML_3.2")

        if not ns_uri.startswith("http"):
            ns_uri = "http://sashimi.sourceforge.net/schema_revision/mzXML_3.2"

        scan_elements = root.findall(f".//{{{ns_uri}}}scan")

        for i, scan in enumerate(scan_elements):
            ms_level = int(scan.get("msLevel", "1"))
            if ms_level != 2:
                continue

            scan_num = scan.get("num", str(i))
            spectrum_id = f"scan_{scan_num}"

            peaks_elem = scan.find(f"{{{ns_uri}}}peaks")
            if peaks_elem is None:
                continue

            precision = int(peaks_elem.get("precision", "32"))
            byte_order = peaks_elem.get("byteOrder", "network")

            if byte_order == "network":
                dtype = np.dtype(f">f{precision // 8}")
            else:
                dtype = np.dtype(f"<f{precision // 8}")

            peak_data = peaks_elem.text
            if not peak_data:
                continue

            import base64
            raw_data = base64.b64decode(peak_data.strip())
            values = np.frombuffer(raw_data, dtype=dtype)

            mz_values = values[0::2]
            intensity_values = values[1::2]

            precursor_elem = scan.find(f"{{{ns_uri}}}precursorMz")
            if precursor_elem is None:
                continue

            precursor_mz = float(precursor_elem.text)
            charge = int(precursor_elem.get("precursorCharge", "0"))

            rt = None
            rt_attr = scan.get("retentionTime")
            if rt_attr:
                try:
                    if rt_attr.endswith("S"):
                        rt = float(rt_attr[2:-1])
                    else:
                        rt = float(rt_attr[2:].rstrip("S"))
                except (ValueError, IndexError):
                    pass

            spectra.append(SpectrumInfo(
                spectrum_id=spectrum_id,
                precursor_mz=precursor_mz,
                charge=charge,
                rt=rt,
                precursor_intensity=float(precursor_elem.get("precursorIntensity", "0")) or None,
                ms2_mz=mz_values.tolist(),
                ms2_intensity=intensity_values.tolist(),
            ))

    except Exception as e:
        raise ValueError(f"Failed to parse mzXML file: {e}")

    return spectra


def parse_spectrum_file(file_path: str) -> List[SpectrumInfo]:
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".mgf":
        return parse_mgf(file_path)
    elif ext in (".mzxml", ".mzxml.gz"):
        return parse_mzxml(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}. Supported: .mgf, .mzxml")


def filter_spectra_by_quality(
    spectra: List[SpectrumInfo],
    precursor_purity_threshold: float = PRECURSOR_PURITY_THRESHOLD,
    ms1_mz_map: Dict[str, Tuple[np.ndarray, np.ndarray]] = None,
) -> List[SpectrumInfo]:
    filtered = []
    for spec in spectra:
        if spec.charge <= 0:
            continue

        if len(spec.ms2_mz) < 5:
            continue

        if ms1_mz_map and spec.spectrum_id in ms1_mz_map:
            ms1_mz, ms1_intensity = ms1_mz_map[spec.spectrum_id]
            purity = calc_precursor_purity(spec.precursor_mz, ms1_mz, ms1_intensity)
            spec.precursor_purity = purity

            if purity < precursor_purity_threshold:
                continue

        filtered.append(spec)

    return filtered


def create_sample_spectrum() -> SpectrumInfo:
    np.random.seed(42)
    mz_values = np.linspace(100, 2000, 50) + np.random.normal(0, 0.1, 50)
    intensity_values = np.random.exponential(100, 50)
    intensity_values = np.sort(intensity_values)[::-1]

    return SpectrumInfo(
        spectrum_id="sample_1",
        precursor_mz=523.76,
        charge=2,
        rt=1250.0,
        precursor_intensity=500000.0,
        ms2_mz=mz_values.tolist(),
        ms2_intensity=intensity_values.tolist(),
    )
