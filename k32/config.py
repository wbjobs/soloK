import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_PATH = os.path.join(BASE_DIR, "data", "proteomics.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")
RESULT_DIR = os.path.join(BASE_DIR, "data", "results")
FASTA_DIR = os.path.join(BASE_DIR, "data", "fastas")

os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)
os.makedirs(FASTA_DIR, exist_ok=True)

PRECURSOR_MZ_TOLERANCE_PPM = 5.0
FRAGMENT_MZ_TOLERANCE_DA = 0.5
MIN_PEPTIDE_LENGTH = 6
MAX_PEPTIDE_LENGTH = 30
MAX_MISSED_CLEAVAGES = 2
FDR_THRESHOLD = 0.01
PRECURSOR_PURITY_THRESHOLD = 0.5

TRYPSIN_CLEAVAGE_SITE = "(?<=[KR])(?!P)"

COMMON_MODIFICATIONS = {
    "phosphorylation": {
        "name": "Phosphorylation",
        "mass_shift": 79.9663,
        "residues": ["S", "T", "Y"],
        "type": "variable",
    },
    "acetylation": {
        "name": "Acetylation",
        "mass_shift": 42.0106,
        "residues": ["K", "N-term"],
        "type": "variable",
    },
    "oxidation": {
        "name": "Oxidation",
        "mass_shift": 15.9949,
        "residues": ["M"],
        "type": "variable",
    },
    "carbamidomethylation": {
        "name": "Carbamidomethylation",
        "mass_shift": 57.0215,
        "residues": ["C"],
        "type": "fixed",
    },
}

AMINO_ACID_MASSES = {
    "G": 57.021464, "A": 71.037114, "S": 87.032029, "P": 97.052764,
    "V": 99.068414, "T": 101.047679, "C": 103.009185, "L": 113.084064,
    "I": 113.084064, "N": 114.042927, "D": 115.026943, "Q": 128.058578,
    "K": 128.094963, "E": 129.042593, "M": 131.040485, "H": 137.058912,
    "F": 147.068414, "R": 156.101111, "Y": 163.063329, "W": 186.079313,
}

WATER_MASS = 18.010565
PROTON_MASS = 1.007276
NH3_MASS = 17.026549

ION_TYPES = {
    "b": {"prefix": True, "mass_offset": PROTON_MASS},
    "y": {"prefix": False, "mass_offset": WATER_MASS + PROTON_MASS},
}

NUM_WORKERS = os.cpu_count() or 4
JOB_EXPIRY_HOURS = 24
