import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import os


@dataclass
class Species:
    name: str
    charge: int
    concentration: float = 0.0
    log_k: float = 0.0


@dataclass
class IonExchangeSite:
    name: str
    capacity: float
    selectivity_coefficients: Dict[str, float] = field(default_factory=dict)


@dataclass
class SurfaceComplex:
    name: str
    site_name: str
    species: str
    log_k: float
    reaction_stoichiometry: Dict[str, float] = field(default_factory=dict)


@dataclass
class SurfaceSite:
    name: str
    site_density: float
    surface_area: float = 10.0
    solid_concentration: float = 1.0


class ReactionSystem:
    def __init__(self):
        self.species: Dict[str, Species] = {}
        self.ion_exchange_sites: Dict[str, IonExchangeSite] = {}
        self.surface_sites: Dict[str, SurfaceSite] = {}
        self.surface_complexes: List[SurfaceComplex] = []
        
        self.pH = 7.0
        self.Eh = 0.4
        self.temperature = 25.0
        
        self.total_concentrations = {}
        self.ionic_strength = 0.0
    
    def add_species(self, name: str, charge: int, log_k: float = 0.0):
        self.species[name] = Species(name=name, charge=charge, log_k=log_k)
    
    def add_ion_exchange_site(self, name: str, capacity: float):
        self.ion_exchange_sites[name] = IonExchangeSite(name=name, capacity=capacity)
    
    def set_selectivity_coefficient(self, site_name: str, species: str, log_k: float):
        if site_name in self.ion_exchange_sites:
            self.ion_exchange_sites[site_name].selectivity_coefficients[species] = log_k
    
    def add_surface_site(self, name: str, site_density: float, surface_area: float = 10.0):
        self.surface_sites[name] = SurfaceSite(
            name=name, site_density=site_density, surface_area=surface_area
        )
    
    def add_surface_complex(self, name: str, site_name: str, species: str, log_k: float,
                            stoichiometry: Dict[str, float]):
        complex_ = SurfaceComplex(
            name=name, site_name=site_name, species=species,
            log_k=log_k, reaction_stoichiometry=stoichiometry
        )
        self.surface_complexes.append(complex_)
    
    def calculate_ionic_strength(self, concentrations: Dict[str, float]) -> float:
        I = 0.0
        for name, conc in concentrations.items():
            if name in self.species:
                z = self.species[name].charge
                I += 0.5 * z**2 * conc
        return I
    
    def calculate_debye_length(self, I: float, T: float = 25.0) -> float:
        T_K = T + 273.15
        A = 1.82483e6 * (T_K / 298.15)**(-3/2)
        kappa = A * np.sqrt(I)
        return 1.0 / kappa if kappa > 0 else float('inf')
    
    def calculate_activity_coefficient(self, charge: int, I: float) -> float:
        if I <= 0:
            return 1.0
        
        a = 4.0
        A = 0.5092
        B = 0.3283
        
        log_gamma = -A * charge**2 * np.sqrt(I) / (1 + B * a * np.sqrt(I))
        return 10**log_gamma
    
    def ion_exchange_equilibrium(self, aqueous_conc: Dict[str, float],
                                  site_name: str) -> Dict[str, float]:
        if site_name not in self.ion_exchange_sites:
            return {}
        
        site = self.ion_exchange_sites[site_name]
        exchanged = {}
        
        cations = [s for s in aqueous_conc.keys() 
                   if s in self.species and self.species[s].charge > 0]
        
        if not cations:
            return exchanged
        
        total_sites = site.capacity
        denominator = 0.0
        
        for cation in cations:
            if cation in site.selectivity_coefficients:
                K = 10**site.selectivity_coefficients[cation]
                activity = aqueous_conc[cation] * self.calculate_activity_coefficient(
                    self.species[cation].charge, self.ionic_strength
                )
                denominator += K * activity
        
        if denominator > 0:
            for cation in cations:
                if cation in site.selectivity_coefficients:
                    K = 10**site.selectivity_coefficients[cation]
                    activity = aqueous_conc[cation] * self.calculate_activity_coefficient(
                        self.species[cation].charge, self.ionic_strength
                    )
                    exchanged[cation] = total_sites * K * activity / denominator
        
        return exchanged
    
    def surface_complexation_equilibrium(self, aqueous_conc: Dict[str, float],
                                          site_name: str, pH: float) -> Dict[str, float]:
        if site_name not in self.surface_sites:
            return {}
        
        site = self.surface_sites[site_name]
        complexed = {}
        
        H_conc = 10**(-pH)
        
        total_sites = site.site_density * site.surface_area * site.solid_concentration
        
        free_sites = total_sites
        
        for complex_ in self.surface_complexes:
            if complex_.site_name != site_name:
                continue
            
            K = 10**complex_.log_k
            activity_product = 1.0
            
            for species, coeff in complex_.reaction_stoichiometry.items():
                if species == 'H+':
                    activity_product *= H_conc**coeff
                elif species in aqueous_conc:
                    if species in self.species:
                        gamma = self.calculate_activity_coefficient(
                            self.species[species].charge, self.ionic_strength
                        )
                    else:
                        gamma = 1.0
                    activity_product *= (aqueous_conc[species] * gamma)**coeff
            
            conc = K * free_sites * activity_product
            complexed[complex_.name] = conc
        
        return complexed
    
    def calculate_nuclide_speciation(self, nuclide: str, total_conc: float,
                                      pH: float, Eh: float) -> Dict[str, float]:
        speciation = {}
        
        self.ionic_strength = 0.01
        
        if nuclide == 'U':
            speciation['UO2+2'] = total_conc * self._fraction_uranyl(pH)
            speciation['UO2(OH)+'] = total_conc * self._fraction_uranyl_OH(pH, 1)
            speciation['UO2(OH)2(aq)'] = total_conc * self._fraction_uranyl_OH(pH, 2)
            speciation['UO2(CO3)2-2'] = total_conc * 0.3 * max(0, (pH - 6) / 2) if pH > 6 else 0
            speciation['UO2(CO3)3-4'] = total_conc * 0.2 * max(0, (pH - 7) / 2) if pH > 7 else 0
            
            if Eh < 0.1:
                speciation['U+4'] = total_conc * 0.5 * (0.1 - Eh) / 0.1
        
        elif nuclide == 'Np':
            speciation['NpO2+'] = total_conc * max(0, 1 - abs(pH - 7) / 5)
            speciation['NpO2(OH)'] = total_conc * max(0, (pH - 6) / 4) if pH > 6 else 0
            
        elif nuclide == 'Pu':
            if Eh > 0.3:
                speciation['PuO2+2'] = total_conc * 0.6
                speciation['PuO2+'] = total_conc * 0.3
            else:
                speciation['Pu+4'] = total_conc * 0.7
        
        elif nuclide == 'Cs':
            speciation['Cs+'] = total_conc
        
        elif nuclide == 'Sr':
            speciation['Sr+2'] = total_conc * 0.8
            speciation['SrCO3(aq)'] = total_conc * 0.15 if pH > 7 else 0
            speciation['SrHCO3+'] = total_conc * 0.05 if pH > 6 else 0
        
        elif nuclide == 'Tc':
            if Eh > 0.2:
                speciation['TcO4-'] = total_conc
            else:
                speciation['TcO2·nH2O'] = total_conc
        
        else:
            speciation[nuclide] = total_conc
        
        return speciation
    
    def _fraction_uranyl(self, pH: float) -> float:
        if pH < 4:
            return 0.9
        elif pH < 6:
            return 0.9 - 0.4 * (pH - 4) / 2
        else:
            return 0.1 * max(0, 1 - (pH - 6) / 3)
    
    def _fraction_uranyl_OH(self, pH: float, n_oh: int) -> float:
        if n_oh == 1:
            peak_pH = 5.5
        else:
            peak_pH = 7.0
        
        width = 2.0
        return max(0, 0.4 * np.exp(-(pH - peak_pH)**2 / (2 * width**2)))
    
    def calculate_retardation_factor(self, nuclide: str, pH: float, 
                                      Eh: float, Kd: float = 1.0) -> float:
        speciation = self.calculate_nuclide_speciation(nuclide, 1.0, pH, Eh)
        
        mobility_factor = 0.0
        
        for species, fraction in speciation.items():
            if '+' in species or '-' in species:
                if any(c in species for c in ['CO3', 'OH', 'HCO3']):
                    mobility_factor += fraction * 0.3
                else:
                    mobility_factor += fraction * 0.1
            else:
                mobility_factor += fraction * 0.5
        
        R = 1.0 + (Kd / mobility_factor) if mobility_factor > 0 else 1e6
        
        return min(R, 100.0)
    
    def visualize_pH_eh_diagram(self, nuclide: str, output_path: str = 'ph_eh_diagram.png'):
        pH_range = np.linspace(3, 11, 50)
        Eh_range = np.linspace(-0.3, 0.8, 50)
        
        pH_grid, Eh_grid = np.meshgrid(pH_range, Eh_range)
        
        mobility = np.zeros_like(pH_grid)
        
        for i in range(len(Eh_range)):
            for j in range(len(pH_range)):
                R = self.calculate_retardation_factor(nuclide, pH_grid[i, j], Eh_grid[i, j])
                mobility[i, j] = 1.0 / R
        
        fig, ax = plt.subplots(figsize=(10, 8))
        
        contour = ax.contourf(pH_grid, Eh_grid, mobility, 20, cmap='RdYlBu_r')
        plt.colorbar(contour, ax=ax, label='Relative Mobility (1/R)')
        
        ax.set_xlabel('pH')
        ax.set_ylabel('Eh (V)')
        ax.set_title(f'{nuclide} Mobility - pH/Eh Diagram')
        
        water_lines = ['upper', 'lower']
        for line_type in water_lines:
            if line_type == 'upper':
                eh_water = 1.23 - 0.059 * pH_range
                ax.plot(pH_range, eh_water, 'r--', label='O2/H2O')
            else:
                eh_water = 0.0 - 0.059 * pH_range
                ax.plot(pH_range, eh_water, 'b--', label='H2/H2O')
        
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig(output_path, dpi=150)
        plt.close()
        
        return output_path


class ReactiveTransportSolver:
    def __init__(self, reaction_system: ReactionSystem):
        self.reaction_system = reaction_system
        self.history = []
    
    def step_operator_split(self, conc: np.ndarray, 
                              u: np.ndarray, v: np.ndarray,
                              D_xx: np.ndarray, D_yy: np.ndarray,
                              dx: float, dy: float, dt: float,
                              R: float = 1.0, pH: float = 7.0, Eh: float = 0.4) -> np.ndarray:
        nx, ny = conc.shape
        conc_new = conc.copy()
        
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                Pe_x = abs(u[i, j]) * dx / max(D_xx[i, j], 1e-15)
                Pe_y = abs(v[i, j]) * dy / max(D_yy[i, j], 1e-15)
                
                if Pe_x > 2.0:
                    if u[i, j] > 0:
                        adv_x = u[i, j] * (conc[i, j] - conc[i-1, j]) / dx
                    else:
                        adv_x = u[i, j] * (conc[i+1, j] - conc[i, j]) / dx
                else:
                    adv_x = u[i, j] * (conc[i+1, j] - conc[i-1, j]) / (2 * dx)
                
                if Pe_y > 2.0:
                    if v[i, j] > 0:
                        adv_y = v[i, j] * (conc[i, j] - conc[i, j-1]) / dy
                    else:
                        adv_y = v[i, j] * (conc[i, j+1] - conc[i, j]) / dy
                else:
                    adv_y = v[i, j] * (conc[i, j+1] - conc[i, j-1]) / (2 * dy)
                
                disp_x = D_xx[i, j] * (conc[i+1, j] - 2*conc[i, j] + conc[i-1, j]) / dx**2
                disp_y = D_yy[i, j] * (conc[i, j+1] - 2*conc[i, j] + conc[i, j-1]) / dy**2
                
                conc_new[i, j] = conc[i, j] + dt / R * (
                    -adv_x - adv_y + disp_x + disp_y
                )
        
        conc_new[0, :] = conc_new[1, :]
        conc_new[-1, :] = conc_new[-2, :]
        conc_new[:, 0] = conc_new[:, 1]
        conc_new[:, -1] = conc_new[:, -2]
        
        conc_new = np.maximum(conc_new, 0.0)
        
        R_reactive = self.reaction_system.calculate_retardation_factor(
            'U', pH, Eh
        )
        
        if R_reactive > R:
            sink = conc_new * (1 - R / R_reactive)
            conc_new = conc_new - sink
        
        return conc_new
    
    def simulate_reaction_evolution(self, initial_conc: Dict[str, float],
                                     pH: float, Eh: float, 
                                     duration: float, n_steps: int = 100) -> Dict:
        dt = duration / n_steps
        history = {
            'time': [],
            'pH': [],
            'Eh': [],
            'aqueous': {},
            'sorbed': {}
        }
        
        aqueous = initial_conc.copy()
        
        for step in range(n_steps):
            time = step * dt
            
            self.reaction_system.ionic_strength = 0.01
            
            sorbed = {}
            for site_name in self.reaction_system.ion_exchange_sites:
                ex = self.reaction_system.ion_exchange_equilibrium(aqueous, site_name)
                for species, conc in ex.items():
                    sorbed[species] = sorbed.get(species, 0) + conc
            
            for site_name in self.reaction_system.surface_sites:
                comp = self.reaction_system.surface_complexation_equilibrium(
                    aqueous, site_name, pH
                )
                for species, conc in comp.items():
                    sorbed[species] = sorbed.get(species, 0) + conc
            
            history['time'].append(time)
            history['pH'].append(pH)
            history['Eh'].append(Eh)
            
            for species, conc in aqueous.items():
                if species not in history['aqueous']:
                    history['aqueous'][species] = []
                history['aqueous'][species].append(conc)
            
            for species, conc in sorbed.items():
                if species not in history['sorbed']:
                    history['sorbed'][species] = []
                history['sorbed'][species].append(conc)
        
        return history
    
    def plot_speciation_evolution(self, history: Dict, output_path: str = 'speciation.png'):
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        
        ax1 = axes[0]
        for species, concs in history['aqueous'].items():
            ax1.plot(history['time'], concs, label=f'{species} (aq)')
        ax1.set_xlabel('Time')
        ax1.set_ylabel('Concentration')
        ax1.set_title('Aqueous Species')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        ax2 = axes[1]
        for species, concs in history['sorbed'].items():
            ax2.plot(history['time'], concs, label=f'{species} (sorbed)')
        ax2.set_xlabel('Time')
        ax2.set_ylabel('Concentration')
        ax2.set_title('Sorbed Species')
        ax2.legend()
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig(output_path, dpi=150)
        plt.close()
        
        return output_path


def setup_typical_system() -> ReactionSystem:
    system = ReactionSystem()
    
    system.add_species('Na+', 1)
    system.add_species('K+', 1)
    system.add_species('Ca+2', 2)
    system.add_species('Mg+2', 2)
    system.add_species('Cl-', -1)
    system.add_species('HCO3-', -1)
    system.add_species('SO4-2', -2)
    
    system.add_species('UO2+2', 2)
    system.add_species('NpO2+', 1)
    system.add_species('Cs+', 1)
    system.add_species('Sr+2', 2)
    system.add_species('TcO4-', -1)
    
    system.add_ion_exchange_site('X-', capacity=0.1)
    system.set_selectivity_coefficient('X-', 'Na+', 0.0)
    system.set_selectivity_coefficient('X-', 'K+', 0.5)
    system.set_selectivity_coefficient('X-', 'Ca+2', 1.5)
    system.set_selectivity_coefficient('X-', 'Cs+', 2.0)
    system.set_selectivity_coefficient('X-', 'Sr+2', 1.8)
    system.set_selectivity_coefficient('X-', 'UO2+2', 2.5)
    
    system.add_surface_site('>SOH', site_density=1e-5, surface_area=10.0)
    
    return system
