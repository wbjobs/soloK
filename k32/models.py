from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class Modification(BaseModel):
    name: str = Field(..., description="Modification name")
    mass_shift: float = Field(..., description="Mass shift in Da")
    residues: List[str] = Field(default=[], description="Affected amino acid residues")
    type: str = Field(default="variable", description="Modification type: fixed or variable")


class SearchRequest(BaseModel):
    fasta_db: str = Field(default="default", description="FASTA database name")
    precursor_mz_tolerance_ppm: float = Field(default=5.0, description="Precursor m/z tolerance in ppm")
    fragment_mz_tolerance_da: float = Field(default=0.5, description="Fragment m/z tolerance in Da")
    min_peptide_length: int = Field(default=6, description="Minimum peptide length")
    max_peptide_length: int = Field(default=30, description="Maximum peptide length")
    max_missed_cleavages: int = Field(default=2, description="Maximum missed cleavages")
    fdr_threshold: float = Field(default=0.01, description="FDR threshold")
    enzyme: str = Field(default="trypsin", description="Enzyme name")
    ion_types: List[str] = Field(default=["b", "y"], description="Ion types to search")
    max_charge: int = Field(default=2, description="Maximum fragment ion charge")
    modifications: List[Modification] = Field(default=[], description="PTMs to consider")
    output_format: str = Field(default="tsv", description="Output format: tsv or xml")


class PeptideResult(BaseModel):
    peptide_sequence: str
    protein_accession: str
    protein_description: Optional[str] = None
    charge: int
    experimental_mz: float
    theoretical_mz: float
    score: float
    modifications: Optional[str] = None
    mod_positions: Optional[Dict[int, float]] = None
    q_value: Optional[float] = None
    passed_fdr: bool = False
    spectrum_id: Optional[str] = None


class SearchResponse(BaseModel):
    job_id: str
    status: str
    message: Optional[str] = None


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: int
    message: Optional[str] = None
    created_at: Optional[float] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result_count: int = 0
    results: List[PeptideResult] = []
    result_summary: Optional[dict] = None


class SpectrumInfo(BaseModel):
    spectrum_id: str
    precursor_mz: float
    charge: int
    rt: Optional[float] = None
    precursor_intensity: Optional[float] = None
    ms2_mz: List[float] = []
    ms2_intensity: List[float] = []
    precursor_purity: Optional[float] = None


class FastaDatabaseInfo(BaseModel):
    id: int
    name: str
    file_path: str
    protein_count: int
    peptide_count: int
    created_at: float
    is_reverse: bool


class FastaUploadRequest(BaseModel):
    name: str
    file_path: Optional[str] = None


class JobListResponse(BaseModel):
    jobs: List[dict]


class DeNovoCandidate(BaseModel):
    sequence: str
    score: float
    confidence: float
    matched_b_ions: int = 0
    matched_y_ions: int = 0
    coverage: float = 0.0


class DeNovoResult(BaseModel):
    spectrum_id: str
    precursor_mz: float
    charge: int
    candidates: List[DeNovoCandidate] = []


class DeNovoRequest(BaseModel):
    fragment_tolerance_da: float = Field(default=0.02, description="Fragment mass tolerance in Da")
    min_peptide_length: int = Field(default=4, description="Minimum peptide length")
    max_peptide_length: int = Field(default=30, description="Maximum peptide length")
    top_n: int = Field(default=3, description="Number of top candidates to return")


class DeNovoResponse(BaseModel):
    results: Dict[str, DeNovoResult] = {}
    total_spectra: int = 0
    processed_spectra: int = 0


class SpectrumPredictionRequest(BaseModel):
    peptide_sequence: str = Field(..., description="Peptide amino acid sequence")
    precursor_charge: int = Field(..., description="Precursor charge state")
    collision_energy: float = Field(default=27.0, description="Collision energy in %")
    ion_types: List[str] = Field(default=["b", "y"], description="Ion types to predict")
    modifications: Optional[Dict[int, float]] = Field(default=None, description="Modifications: position -> mass shift")


class IonAnnotation(BaseModel):
    ion_type: str
    position: int
    charge: int


class SpectrumPredictionResponse(BaseModel):
    peptide_sequence: str
    precursor_charge: int
    precursor_mz: float
    precursor_mass: float
    collision_energy: float
    mz: List[float] = []
    intensity: List[float] = []
    ion_annotations: List[IonAnnotation] = []
    num_peaks: int = 0


class SpectrumValidationRequest(BaseModel):
    peptide_sequence: str
    precursor_charge: int
    experimental_mz: List[float]
    experimental_intensity: List[float]
    collision_energy: float = 27.0
    threshold: float = Field(default=0.3, description="Dot product threshold for validation")


class SpectrumValidationResponse(BaseModel):
    dot_product: float
    matched_peaks: int
    predicted_peaks: int
    coverage: float
    is_valid: bool
    threshold: float
    predicted_spectrum: SpectrumPredictionResponse
