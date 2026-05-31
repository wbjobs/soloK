import os
import json
import csv
from typing import List, Dict, Optional
from lxml import etree

from config import RESULT_DIR


def format_results_tsv(results: List[Dict]) -> str:
    if not results:
        return "No results found."

    headers = [
        "Spectrum_ID",
        "Peptide_Sequence",
        "Protein_Accession",
        "Charge",
        "Experimental_m/z",
        "Theoretical_m/z",
        "Delta_m/z(ppm)",
        "Score",
        "Modifications",
        "Is_Reverse",
        "Q_Value",
        "Passed_FDR",
    ]

    lines = ["\t".join(headers)]

    for r in results:
        exp_mz = r.get("experimental_mz", 0.0)
        theo_mz = r.get("theoretical_mz", 0.0)
        delta_ppm = abs(exp_mz - theo_mz) / theo_mz * 1e6 if theo_mz > 0 else 0.0

        line = [
            r.get("spectrum_id", ""),
            r.get("peptide_sequence", ""),
            r.get("protein_accession", ""),
            str(r.get("charge", 0)),
            f"{exp_mz:.6f}",
            f"{theo_mz:.6f}",
            f"{delta_ppm:.2f}",
            f"{r.get('score', 0.0):.6f}",
            r.get("modifications", ""),
            str(r.get("is_reverse", 0)),
            f"{r.get('q_value', 1.0):.6f}" if r.get("q_value") is not None else "",
            str(r.get("passed_fdr", False)),
        ]
        lines.append("\t".join(line))

    return "\n".join(lines)


def format_results_xml(results: List[Dict]) -> str:
    root = etree.Element("PeptideShakerExport")
    root.set("xmlns", "http://peptide-shaker.org/xmlns")
    root.set("version", "1.0.0")

    identification = etree.SubElement(root, "Identification")
    identification.set("type", "Peptide")

    for r in results:
        peptide_elem = etree.SubElement(identification, "Peptide")

        seq_elem = etree.SubElement(peptide_elem, "Sequence")
        seq_elem.text = r.get("peptide_sequence", "")

        protein_elem = etree.SubElement(peptide_elem, "Protein")
        protein_elem.set("accession", r.get("protein_accession", ""))

        spectrum_elem = etree.SubElement(peptide_elem, "Spectrum")
        spectrum_elem.set("id", r.get("spectrum_id", ""))
        spectrum_elem.set("charge", str(r.get("charge", 0)))
        spectrum_elem.set("exp_mz", f"{r.get('experimental_mz', 0.0):.6f}")
        spectrum_elem.set("theo_mz", f"{r.get('theoretical_mz', 0.0):.6f}")

        score_elem = etree.SubElement(peptide_elem, "Score")
        score_elem.set("type", "DotProduct")
        score_elem.text = f"{r.get('score', 0.0):.6f}"

        mods_str = r.get("modifications", "")
        if mods_str:
            mods_elem = etree.SubElement(peptide_elem, "Modifications")
            for part in mods_str.split(";"):
                if part.strip():
                    pos, mass = part.strip().split(":")
                    mod_elem = etree.SubElement(mods_elem, "Modification")
                    mod_elem.set("position", pos)
                    mod_elem.set("mass", mass)

        validation_elem = etree.SubElement(peptide_elem, "Validation")
        validation_elem.set("q_value", f"{r.get('q_value', 1.0):.6f}" if r.get("q_value") is not None else "1.0")
        validation_elem.set("passed", str(r.get("passed_fdr", False)))

    return etree.tostring(root, pretty_print=True, encoding="unicode")


def save_results_to_file(results: List[Dict], job_id: str, output_format: str = "tsv") -> str:
    os.makedirs(RESULT_DIR, exist_ok=True)

    if output_format.lower() == "xml":
        content = format_results_xml(results)
        filename = f"{job_id}_results.xml"
    else:
        content = format_results_tsv(results)
        filename = f"{job_id}_results.tsv"

    filepath = os.path.join(RESULT_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return filepath


def format_summary(results: List[Dict]) -> Dict:
    if not results:
        return {"total": 0, "forward": 0, "reverse": 0, "passed_fdr": 0}

    total = len(results)
    forward = len([r for r in results if not r.get("is_reverse")])
    reverse = len([r for r in results if r.get("is_reverse")])
    passed = len([r for r in results if r.get("passed_fdr")])

    return {
        "total": total,
        "forward": forward,
        "reverse": reverse,
        "passed_fdr": passed,
    }


def results_to_json(results: List[Dict]) -> str:
    return json.dumps(results, indent=2, default=str)


def results_to_csv(results: List[Dict]) -> str:
    if not results:
        return ""

    fieldnames = [
        "spectrum_id", "peptide_sequence", "protein_accession", "charge",
        "experimental_mz", "theoretical_mz", "score", "modifications",
        "is_reverse", "q_value", "passed_fdr",
    ]

    output = []
    for r in results:
        row = {}
        for key in fieldnames:
            row[key] = r.get(key, "")
        output.append(row)

    if not output:
        return ""

    import io
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, delimiter="\t")
    writer.writeheader()
    writer.writerows(output)
    return buf.getvalue()
