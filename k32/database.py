import sqlite3
import json
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

from config import DATABASE_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    created_at REAL NOT NULL,
    started_at REAL,
    completed_at REAL,
    parameters TEXT,
    input_file TEXT,
    fasta_db TEXT DEFAULT 'default',
    result_count INTEGER DEFAULT 0,
    result_summary TEXT
);

CREATE TABLE IF NOT EXISTS fasta_databases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    protein_count INTEGER DEFAULT 0,
    peptide_count INTEGER DEFAULT 0,
    created_at REAL NOT NULL,
    is_reverse INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proteins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fasta_id INTEGER NOT NULL,
    accession TEXT NOT NULL,
    description TEXT,
    sequence TEXT NOT NULL,
    is_reverse INTEGER DEFAULT 0,
    FOREIGN KEY (fasta_id) REFERENCES fasta_databases(id)
);

CREATE TABLE IF NOT EXISTS peptides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id INTEGER NOT NULL,
    sequence TEXT NOT NULL,
    mass REAL NOT NULL,
    missed_cleavages INTEGER DEFAULT 0,
    start_pos INTEGER DEFAULT 0,
    end_pos INTEGER DEFAULT 0,
    is_reverse INTEGER DEFAULT 0,
    FOREIGN KEY (protein_id) REFERENCES proteins(id)
);

CREATE TABLE IF NOT EXISTS search_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    spectrum_id TEXT NOT NULL,
    peptide_sequence TEXT NOT NULL,
    protein_accession TEXT NOT NULL,
    charge INTEGER NOT NULL,
    experimental_mz REAL NOT NULL,
    theoretical_mz REAL NOT NULL,
    score REAL NOT NULL,
    modifications TEXT,
    mod_positions TEXT,
    is_reverse INTEGER DEFAULT 0,
    q_value REAL,
    passed_fdr INTEGER DEFAULT 0,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_peptides_mass ON peptides(mass);
CREATE INDEX IF NOT EXISTS idx_peptides_sequence ON peptides(sequence);
CREATE INDEX IF NOT EXISTS idx_results_job ON search_results(job_id);
CREATE INDEX IF NOT EXISTS idx_results_score ON search_results(score);
CREATE INDEX IF NOT EXISTS idx_proteins_fasta ON proteins(fasta_id);
CREATE INDEX IF NOT EXISTS idx_proteins_accession ON proteins(accession);
"""


@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA)


def create_job(job_id: str, parameters: str, input_file: str, fasta_db: str = "default"):
    from utils import get_current_time
    with get_db() as conn:
        conn.execute(
            "INSERT INTO jobs (job_id, status, progress, created_at, parameters, input_file, fasta_db) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (job_id, "pending", 0, get_current_time(), parameters, input_file, fasta_db),
        )


def update_job_status(job_id: str, status: str, progress: int = None, message: str = None,
                       started_at: float = None, completed_at: float = None,
                       result_count: int = None, result_summary: str = None):
    updates = ["status = ?"]
    params = [status]

    if progress is not None:
        updates.append("progress = ?")
        params.append(progress)
    if message is not None:
        updates.append("message = ?")
        params.append(message)
    if started_at is not None:
        updates.append("started_at = ?")
        params.append(started_at)
    if completed_at is not None:
        updates.append("completed_at = ?")
        params.append(completed_at)
    if result_count is not None:
        updates.append("result_count = ?")
        params.append(result_count)
    if result_summary is not None:
        updates.append("result_summary = ?")
        params.append(result_summary)

    params.append(job_id)
    query = f"UPDATE jobs SET {', '.join(updates)} WHERE job_id = ?"

    with get_db() as conn:
        conn.execute(query, params)


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row:
            return dict(row)
    return None


def get_all_jobs() -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]


def add_fasta_db(name: str, file_path: str, is_reverse: bool = False) -> int:
    from utils import get_current_time
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO fasta_databases (name, file_path, created_at, is_reverse) VALUES (?, ?, ?, ?)",
            (name, file_path, get_current_time(), 1 if is_reverse else 0),
        )
        if cursor.lastrowid:
            return cursor.lastrowid
        row = conn.execute("SELECT id FROM fasta_databases WHERE name = ?", (name,)).fetchone()
        return row["id"]


def add_protein(fasta_id: int, accession: str, description: str, sequence: str, is_reverse: bool = False) -> int:
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO proteins (fasta_id, accession, description, sequence, is_reverse) VALUES (?, ?, ?, ?, ?)",
            (fasta_id, accession, description, sequence, 1 if is_reverse else 0),
        )
        if cursor.lastrowid:
            return cursor.lastrowid
        row = conn.execute(
            "SELECT id FROM proteins WHERE fasta_id = ? AND accession = ?",
            (fasta_id, accession),
        ).fetchone()
        return row["id"]


def add_peptide(protein_id: int, sequence: str, mass: float, missed_cleavages: int,
                start_pos: int, end_pos: int, is_reverse: bool = False):
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO peptides (protein_id, sequence, mass, missed_cleavages, start_pos, end_pos, is_reverse) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (protein_id, sequence, mass, missed_cleavages, start_pos, end_pos, 1 if is_reverse else 0),
        )


def add_search_result(job_id: str, spectrum_id: str, peptide_sequence: str,
                      protein_accession: str, charge: int, experimental_mz: float,
                      theoretical_mz: float, score: float, modifications: str = None,
                      mod_positions: str = None, is_reverse: bool = False,
                      q_value: float = None, passed_fdr: bool = False):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO search_results
               (job_id, spectrum_id, peptide_sequence, protein_accession, charge,
                experimental_mz, theoretical_mz, score, modifications, mod_positions,
                is_reverse, q_value, passed_fdr)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (job_id, spectrum_id, peptide_sequence, protein_accession, charge,
             experimental_mz, theoretical_mz, score, modifications, mod_positions,
             1 if is_reverse else 0, q_value, 1 if passed_fdr else 0),
        )


def get_search_results(job_id: str, passed_fdr_only: bool = True) -> List[Dict[str, Any]]:
    with get_db() as conn:
        if passed_fdr_only:
            rows = conn.execute(
                "SELECT * FROM search_results WHERE job_id = ? AND passed_fdr = 1 ORDER BY score DESC",
                (job_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM search_results WHERE job_id = ? ORDER BY score DESC",
                (job_id,),
            ).fetchall()
        return [dict(row) for row in rows]


def get_peptides_by_mass_range(mass_min: float, mass_max: float, fasta_id: int = None,
                               is_reverse: bool = False) -> List[Dict[str, Any]]:
    with get_db() as conn:
        query = """
            SELECT p.sequence, p.mass, p.missed_cleavages, p.start_pos, p.end_pos,
                   pr.accession as protein_accession, pr.description as protein_description
            FROM peptides p
            JOIN proteins pr ON p.protein_id = pr.id
            WHERE p.mass BETWEEN ? AND ? AND p.is_reverse = ?
        """
        params = [mass_min, mass_max, 1 if is_reverse else 0]

        if fasta_id is not None:
            query += " AND pr.fasta_id = ?"
            params.append(fasta_id)

        query += " ORDER BY p.mass"
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]


def get_fasta_db_by_name(name: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM fasta_databases WHERE name = ?", (name,)).fetchone()
        if row:
            return dict(row)
    return None


def get_all_fasta_dbs() -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM fasta_databases ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]


def update_fasta_db_stats(fasta_id: int, protein_count: int, peptide_count: int):
    with get_db() as conn:
        conn.execute(
            "UPDATE fasta_databases SET protein_count = ?, peptide_count = ? WHERE id = ?",
            (protein_count, peptide_count, fasta_id),
        )


def delete_job(job_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM search_results WHERE job_id = ?", (job_id,))
        conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
