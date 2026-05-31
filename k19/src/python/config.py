import yaml
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Dict


@dataclass
class AquiferParams:
    porosity: float = 0.3
    permeability: float = 1e-10
    alpha_l: float = 10.0
    alpha_t: float = 1.0
    retardation: float = 1.0


@dataclass
class Nuclide:
    name: str
    half_life: float
    distribution_coeff: float
    initial_concentration: float = 0.0
    parent: Optional[str] = None


@dataclass
class SourceConfig:
    mode: str = 'instant'
    strength: float = 1e6
    x: float = 100.0
    y: float = 100.0
    radius: float = 5.0
    duration: float = 86400 * 365


@dataclass
class GridConfig:
    nx: int = 100
    ny: int = 50
    dx: float = 2.0
    dy: float = 2.0
    nz: Optional[int] = None
    dz: Optional[float] = None


@dataclass
class SimulationConfig:
    aquifer: AquiferParams = field(default_factory=AquiferParams)
    nuclides: List[Nuclide] = field(default_factory=list)
    source: SourceConfig = field(default_factory=SourceConfig)
    grid: GridConfig = field(default_factory=GridConfig)
    max_time: float = 86400 * 365 * 100
    output_times: List[float] = field(default_factory=list)
    cfl_max: float = 0.5
    max_time_steps: int = 10000
    monitoring_points: Dict[str, List[float]] = field(default_factory=dict)
    threshold: float = 100.0
    dimensions: int = 2

    @classmethod
    def from_yaml(cls, filepath: str) -> 'SimulationConfig':
        with open(filepath, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        
        aquifer = AquiferParams(**data.get('aquifer', {}))
        nuclides = [Nuclide(**n) for n in data.get('nuclides', [])]
        source = SourceConfig(**data.get('source', {}))
        grid = GridConfig(**data.get('grid', {}))
        
        config = cls(
            aquifer=aquifer,
            nuclides=nuclides,
            source=source,
            grid=grid,
            max_time=data.get('max_time', 86400 * 365 * 100),
            output_times=data.get('output_times', []),
            cfl_max=data.get('cfl_max', 0.5),
            max_time_steps=data.get('max_time_steps', 10000),
            monitoring_points=data.get('monitoring_points', {}),
            threshold=data.get('threshold', 100.0),
            dimensions=data.get('dimensions', 2)
        )
        
        if not config.output_times:
            config.output_times = np.logspace(
                np.log10(86400),
                np.log10(config.max_time),
                10
            ).tolist()
        
        return config

    def get_decay_chain_matrix(self) -> np.ndarray:
        n = len(self.nuclides)
        chain_matrix = np.zeros((n, n), dtype=np.int32)
        
        name_to_idx = {n.name: i for i, n in enumerate(self.nuclides)}
        
        for i, nuclide in enumerate(self.nuclides):
            if nuclide.parent and nuclide.parent in name_to_idx:
                parent_idx = name_to_idx[nuclide.parent]
                chain_matrix[parent_idx, i] = 1
        
        return chain_matrix
