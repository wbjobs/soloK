import re
import os
from typing import List, Dict, Tuple, Optional

from config import (
    AMINO_ACID_MASSES,
    MAX_MISSED_CLEAVAGES,
    MIN_PEPTIDE_LENGTH,
    MAX_PEPTIDE_LENGTH,
    TRYPSIN_CLEAVAGE_SITE,
    FASTA_DIR,
)
from database import (
    add_fasta_db,
    add_protein,
    add_peptide,
    update_fasta_db_stats,
    get_fasta_db_by_name,
)
from utils import peptide_mass


def parse_fasta(file_path: str) -> List[Dict[str, str]]:
    proteins = []
    current_accession = None
    current_description = ""
    current_sequence = []

    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line.startswith(">"):
                if current_accession is not None:
                    proteins.append({
                        "accession": current_accession,
                        "description": current_description,
                        "sequence": "".join(current_sequence),
                    })

                header = line[1:]
                parts = header.split(None, 1)
                current_accession = parts[0]
                current_description = parts[1] if len(parts) > 1 else ""
                current_sequence = []
            else:
                current_sequence.append(line)

        if current_accession is not None:
            proteins.append({
                "accession": current_accession,
                "description": current_description,
                "sequence": "".join(current_sequence),
            })

    return proteins


def trypsin_digest(sequence: str, max_missed_cleavages: int = MAX_MISSED_CLEAVAGES) -> List[Dict]:
    peptides = []
    pattern = re.compile(TRYPSIN_CLEAVAGE_SITE)

    cleavage_sites = [0] + [m.end() for m in pattern.finditer(sequence)] + [len(sequence)]

    for i in range(len(cleavage_sites) - 1):
        for missed in range(max_missed_cleavages + 1):
            if i + missed + 1 >= len(cleavage_sites):
                break

            start = cleavage_sites[i]
            end = cleavage_sites[i + missed + 1]
            peptide_seq = sequence[start:end]

            if len(peptide_seq) < MIN_PEPTIDE_LENGTH or len(peptide_seq) > MAX_PEPTIDE_LENGTH:
                continue

            if not re.match(r'^[ACDEFGHIKLMNPQRSTVWY]+$', peptide_seq):
                continue

            mass = peptide_mass(peptide_seq)

            peptides.append({
                "sequence": peptide_seq,
                "mass": mass,
                "missed_cleavages": missed,
                "start_pos": start,
                "end_pos": end,
            })

    return peptides


def create_reverse_sequence(sequence: str) -> str:
    return sequence[::-1]


def generate_reverse_fasta(proteins: List[Dict]) -> List[Dict]:
    reverse_proteins = []
    for prot in proteins:
        rev_prot = {
            "accession": "REV_" + prot["accession"],
            "description": prot["description"] + " (Reverse)",
            "sequence": create_reverse_sequence(prot["sequence"]),
        }
        reverse_proteins.append(rev_prot)
    return reverse_proteins


def build_fasta_database(
    fasta_path: str,
    db_name: str = "default",
    enzyme: str = "trypsin",
    include_reverse: bool = True,
) -> Dict:
    if not os.path.exists(fasta_path):
        raise FileNotFoundError(f"FASTA file not found: {fasta_path}")

    proteins = parse_fasta(fasta_path)
    if not proteins:
        raise ValueError(f"No proteins found in FASTA file: {fasta_path}")

    reverse_proteins = generate_reverse_fasta(proteins) if include_reverse else []

    fasta_id = add_fasta_db(db_name, fasta_path, is_reverse=False)
    if include_reverse:
        rev_fasta_id = add_fasta_db(db_name + "_reverse", fasta_path, is_reverse=True)

    total_peptides = 0
    total_proteins = 0

    for prot in proteins:
        protein_id = add_protein(fasta_id, prot["accession"], prot["description"], prot["sequence"], is_reverse=False)
        total_proteins += 1

        peptides = trypsin_digest(prot["sequence"])
        for pep in peptides:
            add_peptide(
                protein_id, pep["sequence"], pep["mass"],
                pep["missed_cleavages"], pep["start_pos"], pep["end_pos"],
                is_reverse=False,
            )
            total_peptides += 1

    if include_reverse:
        for prot in reverse_proteins:
            protein_id = add_protein(rev_fasta_id, prot["accession"], prot["description"], prot["sequence"], is_reverse=True)
            total_proteins += 1

            peptides = trypsin_digest(prot["sequence"])
            for pep in peptides:
                add_peptide(
                    protein_id, pep["sequence"], pep["mass"],
                    pep["missed_cleavages"], pep["start_pos"], pep["end_pos"],
                    is_reverse=True,
                )
                total_peptides += 1

    update_fasta_db_stats(fasta_id, len(proteins), total_peptides)
    if include_reverse:
        update_fasta_db_stats(rev_fasta_id, len(reverse_proteins), total_peptides)

    return {
        "fasta_id": fasta_id,
        "protein_count": len(proteins),
        "peptide_count": total_peptides,
        "reverse_fasta_id": rev_fasta_id if include_reverse else None,
    }


def load_fasta_from_path(file_path: str) -> List[Dict]:
    return parse_fasta(file_path)


def get_available_fasta_dbs():
    from database import get_all_fasta_dbs
    return get_all_fasta_dbs()


def save_fasta_file(name: str, content: bytes) -> str:
    safe_name = re.sub(r'[^\w\-_\. ]', '_', name)
    filepath = os.path.join(FASTA_DIR, safe_name)
    with open(filepath, "wb") as f:
        f.write(content)
    return filepath


def is_fasta_db_ready(db_name: str) -> bool:
    db_info = get_fasta_db_by_name(db_name)
    return db_info is not None and db_info["peptide_count"] > 0
