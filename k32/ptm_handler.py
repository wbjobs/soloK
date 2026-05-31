import itertools
from typing import List, Dict, Optional, Set

from config import COMMON_MODIFICATIONS
from models import Modification


class PTMHandler:
    def __init__(self):
        self.modifications: Dict[str, Dict] = {}
        self._init_default_mods()

    def _init_default_mods(self):
        for key, mod in COMMON_MODIFICATIONS.items():
            self.modifications[key] = mod.copy()

    def add_modification(self, name: str, mass_shift: float, residues: List[str],
                         mod_type: str = "variable") -> str:
        mod_id = name.lower().replace(" ", "_")
        self.modifications[mod_id] = {
            "name": name,
            "mass_shift": mass_shift,
            "residues": residues,
            "type": mod_type,
        }
        return mod_id

    def remove_modification(self, mod_id: str) -> bool:
        if mod_id in self.modifications:
            del self.modifications[mod_id]
            return True
        return False

    def get_modification(self, mod_id: str) -> Optional[Dict]:
        return self.modifications.get(mod_id)

    def get_all_modifications(self) -> Dict[str, Dict]:
        return self.modifications

    def get_variable_modifications(self) -> Dict[str, Dict]:
        return {k: v for k, v in self.modifications.items() if v["type"] == "variable"}

    def get_fixed_modifications(self) -> Dict[str, Dict]:
        return {k: v for k, v in self.modifications.items() if v["type"] == "fixed"}

    def find_modification_sites(self, peptide: str) -> Dict[int, List[Dict]]:
        sites: Dict[int, List[Dict]] = {}

        for mod_id, mod in self.modifications.items():
            for i, aa in enumerate(peptide):
                if aa in mod["residues"] or "N-term" in mod["residues"] and i == 0:
                    if i not in sites:
                        sites[i] = []
                    sites[i].append({
                        "mod_id": mod_id,
                        "name": mod["name"],
                        "mass_shift": mod["mass_shift"],
                    })

        return sites

    def generate_modified_peptides(
        self,
        peptide: str,
        max_variable_mods: int = 2,
        selected_mod_ids: List[str] = None,
    ) -> List[Dict]:
        variable_mods = {}
        if selected_mod_ids:
            for mod_id in selected_mod_ids:
                if mod_id in self.modifications and self.modifications[mod_id]["type"] == "variable":
                    variable_mods[mod_id] = self.modifications[mod_id]
        else:
            variable_mods = self.get_variable_modifications()

        if not variable_mods:
            return [{"sequence": peptide, "modifications": {}}]

        sites = {}
        for mod_id, mod in variable_mods.items():
            for i, aa in enumerate(peptide):
                if aa in mod["residues"]:
                    if i not in sites:
                        sites[i] = []
                    sites[i].append({"mod_id": mod_id, "mass_shift": mod["mass_shift"]})

        fixed_mods = {}
        for mod_id, mod in self.get_fixed_modifications().items():
            for i, aa in enumerate(peptide):
                if aa in mod["residues"] or (i == 0 and "N-term" in mod["residues"]):
                    fixed_mods[i] = mod["mass_shift"]

        results = []
        results.append({
            "sequence": peptide,
            "modifications": dict(fixed_mods),
            "mod_names": {k: "fixed" for k in fixed_mods},
        })

        num_sites = len(sites)
        if num_sites == 0:
            return results

        site_keys = list(sites.keys())
        site_mods = list(sites.values())

        for num_mods in range(1, min(max_variable_mods, num_sites) + 1):
            for site_combo in itertools.combinations(range(num_sites), num_mods):
                mod_options = [site_mods[i] for i in site_combo]
                for mod_combo in itertools.product(*[range(len(mo)) for mo in mod_options]):
                    mods = dict(fixed_mods)
                    mod_names = {k: "fixed" for k in fixed_mods}
                    for i, option_idx in enumerate(mod_combo):
                        site_idx = site_combo[i]
                        pos = site_keys[site_idx]
                        mod = mod_options[i][option_idx]
                        mods[pos] = mod["mass_shift"]
                        mod_names[pos] = mod["mod_id"]

                    results.append({
                        "sequence": peptide,
                        "modifications": mods,
                        "mod_names": mod_names,
                    })

        return results

    def apply_modifications_to_mass(self, peptide: str, modifications: Dict[int, float]) -> float:
        from utils import peptide_mass
        return peptide_mass(peptide, modifications)

    def to_list(self) -> List[Dict]:
        return [{"id": k, **v} for k, v in self.modifications.items()]

    def from_models(self, mod_list: List[Modification]):
        for mod in mod_list:
            self.modifications[mod.name.lower().replace(" ", "_")] = {
                "name": mod.name,
                "mass_shift": mod.mass_shift,
                "residues": mod.residues,
                "type": mod.type,
            }


ptm_handler = PTMHandler()
