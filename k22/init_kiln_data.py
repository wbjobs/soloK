import numpy as np
from database import SessionLocal, KilnSample, init_db
from config import settings

np.random.seed(42)

KILN_BASE_COMPOSITION = {
    "jingdezhen": {
        "Na2O": 2.5, "MgO": 0.8, "Al2O3": 18.0, "SiO2": 72.0, "P2O5": 0.1,
        "K2O": 3.0, "CaO": 1.5, "TiO2": 0.5, "MnO": 0.05, "Fe2O3": 1.2,
        "ZrO2": 0.03, "SrO": 0.02, "year": 1700
    },
    "longquan": {
        "Na2O": 1.8, "MgO": 0.6, "Al2O3": 15.0, "SiO2": 75.0, "P2O5": 0.08,
        "K2O": 4.5, "CaO": 1.0, "TiO2": 0.4, "MnO": 0.03, "Fe2O3": 1.5,
        "ZrO2": 0.02, "SrO": 0.015, "year": 1200
    },
    "cizhou": {
        "Na2O": 1.5, "MgO": 1.2, "Al2O3": 22.0, "SiO2": 68.0, "P2O5": 0.15,
        "K2O": 2.5, "CaO": 3.0, "TiO2": 1.0, "MnO": 0.1, "Fe2O3": 2.5,
        "ZrO2": 0.04, "SrO": 0.025, "year": 1100
    },
    "yaozhou": {
        "Na2O": 2.0, "MgO": 1.5, "Al2O3": 20.0, "SiO2": 70.0, "P2O5": 0.12,
        "K2O": 2.8, "CaO": 2.5, "TiO2": 0.8, "MnO": 0.08, "Fe2O3": 2.0,
        "ZrO2": 0.035, "SrO": 0.022, "year": 1050
    },
    "junyao": {
        "Na2O": 1.2, "MgO": 2.0, "Al2O3": 16.0, "SiO2": 71.0, "P2O5": 0.2,
        "K2O": 3.5, "CaO": 4.0, "TiO2": 1.2, "MnO": 0.15, "Fe2O3": 3.0,
        "ZrO2": 0.05, "SrO": 0.03, "year": 1150
    },
    "ruyao": {
        "Na2O": 2.8, "MgO": 0.5, "Al2O3": 14.0, "SiO2": 76.0, "P2O5": 0.05,
        "K2O": 3.8, "CaO": 1.2, "TiO2": 0.3, "MnO": 0.02, "Fe2O3": 0.8,
        "ZrO2": 0.015, "SrO": 0.01, "year": 1100
    },
    "guanyao": {
        "Na2O": 2.2, "MgO": 0.7, "Al2O3": 17.0, "SiO2": 74.0, "P2O5": 0.07,
        "K2O": 3.2, "CaO": 1.8, "TiO2": 0.45, "MnO": 0.04, "Fe2O3": 1.0,
        "ZrO2": 0.025, "SrO": 0.018, "year": 1250
    },
    "geyao": {
        "Na2O": 2.0, "MgO": 0.9, "Al2O3": 17.5, "SiO2": 73.5, "P2O5": 0.09,
        "K2O": 3.0, "CaO": 2.0, "TiO2": 0.5, "MnO": 0.045, "Fe2O3": 1.1,
        "ZrO2": 0.028, "SrO": 0.02, "year": 1200
    },
    "dingyao": {
        "Na2O": 1.0, "MgO": 2.5, "Al2O3": 25.0, "SiO2": 65.0, "P2O5": 0.18,
        "K2O": 2.0, "CaO": 3.5, "TiO2": 1.1, "MnO": 0.12, "Fe2O3": 2.8,
        "ZrO2": 0.045, "SrO": 0.028, "year": 1000
    },
    "jizhou": {
        "Na2O": 1.6, "MgO": 1.0, "Al2O3": 19.0, "SiO2": 71.0, "P2O5": 0.11,
        "K2O": 3.3, "CaO": 2.2, "TiO2": 0.7, "MnO": 0.07, "Fe2O3": 1.8,
        "ZrO2": 0.032, "SrO": 0.021, "year": 1180
    },
    "jianyao": {
        "Na2O": 0.8, "MgO": 1.8, "Al2O3": 21.0, "SiO2": 69.0, "P2O5": 0.14,
        "K2O": 2.2, "CaO": 3.2, "TiO2": 1.5, "MnO": 0.2, "Fe2O3": 4.0,
        "ZrO2": 0.055, "SrO": 0.032, "year": 1120
    },
    "dehua": {
        "Na2O": 0.5, "MgO": 0.3, "Al2O3": 12.0, "SiO2": 80.0, "P2O5": 0.04,
        "K2O": 5.0, "CaO": 0.8, "TiO2": 0.2, "MnO": 0.01, "Fe2O3": 0.5,
        "ZrO2": 0.01, "SrO": 0.008, "year": 1600
    },
    "shufu": {
        "Na2O": 2.3, "MgO": 0.75, "Al2O3": 18.5, "SiO2": 72.5, "P2O5": 0.09,
        "K2O": 2.9, "CaO": 1.6, "TiO2": 0.55, "MnO": 0.055, "Fe2O3": 1.3,
        "ZrO2": 0.033, "SrO": 0.022, "year": 1350
    },
    "yixing": {
        "Na2O": 1.1, "MgO": 2.2, "Al2O3": 24.0, "SiO2": 66.0, "P2O5": 0.16,
        "K2O": 2.1, "CaO": 3.3, "TiO2": 1.3, "MnO": 0.13, "Fe2O3": 2.9,
        "ZrO2": 0.048, "SrO": 0.029, "year": 1500
    },
    "shiwan": {
        "Na2O": 1.4, "MgO": 1.6, "Al2O3": 20.5, "SiO2": 69.5, "P2O5": 0.13,
        "K2O": 2.6, "CaO": 2.8, "TiO2": 0.9, "MnO": 0.09, "Fe2O3": 2.2,
        "ZrO2": 0.038, "SrO": 0.024, "year": 1450
    },
    "cangzhou": {
        "Na2O": 1.7, "MgO": 1.3, "Al2O3": 21.5, "SiO2": 68.5, "P2O5": 0.145,
        "K2O": 2.4, "CaO": 3.1, "TiO2": 0.95, "MnO": 0.095, "Fe2O3": 2.4,
        "ZrO2": 0.042, "SrO": 0.026, "year": 1080
    },
    "henan": {
        "Na2O": 1.9, "MgO": 1.4, "Al2O3": 19.5, "SiO2": 70.5, "P2O5": 0.125,
        "K2O": 2.7, "CaO": 2.6, "TiO2": 0.85, "MnO": 0.085, "Fe2O3": 2.1,
        "ZrO2": 0.036, "SrO": 0.023, "year": 1130
    },
    "shanxi": {
        "Na2O": 1.3, "MgO": 1.9, "Al2O3": 23.0, "SiO2": 67.0, "P2O5": 0.155,
        "K2O": 2.2, "CaO": 3.4, "TiO2": 1.15, "MnO": 0.11, "Fe2O3": 2.7,
        "ZrO2": 0.046, "SrO": 0.027, "year": 1090
    },
    "hunan": {
        "Na2O": 2.1, "MgO": 0.85, "Al2O3": 16.5, "SiO2": 74.0, "P2O5": 0.085,
        "K2O": 4.0, "CaO": 1.4, "TiO2": 0.48, "MnO": 0.038, "Fe2O3": 1.35,
        "ZrO2": 0.026, "SrO": 0.017, "year": 1220
    },
    "jiangxi": {
        "Na2O": 2.4, "MgO": 0.78, "Al2O3": 17.8, "SiO2": 73.0, "P2O5": 0.088,
        "K2O": 3.5, "CaO": 1.55, "TiO2": 0.52, "MnO": 0.042, "Fe2O3": 1.25,
        "ZrO2": 0.029, "SrO": 0.019, "year": 1280
    }
}

RARE_EARTH_PATTERNS = {
    "jingdezhen": {"La": 45, "Ce": 85, "Nd": 38, "Sm": 7.2, "Eu": 1.2, "Gd": 6.0, "Tb": 0.85, "Yb": 3.2, "Lu": 0.45, "Y": 22},
    "longquan": {"La": 38, "Ce": 72, "Nd": 32, "Sm": 6.0, "Eu": 0.85, "Gd": 5.2, "Tb": 0.72, "Yb": 2.8, "Lu": 0.38, "Y": 18},
    "cizhou": {"La": 52, "Ce": 98, "Nd": 44, "Sm": 8.5, "Eu": 1.5, "Gd": 7.2, "Tb": 1.0, "Yb": 3.8, "Lu": 0.55, "Y": 28},
    "yaozhou": {"La": 48, "Ce": 90, "Nd": 41, "Sm": 7.8, "Eu": 1.35, "Gd": 6.6, "Tb": 0.92, "Yb": 3.5, "Lu": 0.5, "Y": 25},
    "junyao": {"La": 55, "Ce": 105, "Nd": 48, "Sm": 9.2, "Eu": 1.65, "Gd": 7.8, "Tb": 1.1, "Yb": 4.2, "Lu": 0.6, "Y": 32},
    "ruyao": {"La": 40, "Ce": 78, "Nd": 35, "Sm": 6.5, "Eu": 0.95, "Gd": 5.5, "Tb": 0.78, "Yb": 3.0, "Lu": 0.42, "Y": 20},
    "guanyao": {"La": 42, "Ce": 82, "Nd": 36, "Sm": 6.8, "Eu": 1.0, "Gd": 5.8, "Tb": 0.82, "Yb": 3.1, "Lu": 0.44, "Y": 21},
    "geyao": {"La": 43, "Ce": 84, "Nd": 37, "Sm": 7.0, "Eu": 1.05, "Gd": 5.9, "Tb": 0.84, "Yb": 3.15, "Lu": 0.45, "Y": 21.5},
    "dingyao": {"La": 50, "Ce": 95, "Nd": 43, "Sm": 8.2, "Eu": 1.45, "Gd": 7.0, "Tb": 0.98, "Yb": 3.7, "Lu": 0.53, "Y": 27},
    "jizhou": {"La": 46, "Ce": 88, "Nd": 40, "Sm": 7.5, "Eu": 1.25, "Gd": 6.3, "Tb": 0.88, "Yb": 3.4, "Lu": 0.48, "Y": 24},
    "jianyao": {"La": 58, "Ce": 110, "Nd": 52, "Sm": 10.0, "Eu": 1.8, "Gd": 8.5, "Tb": 1.2, "Yb": 4.5, "Lu": 0.65, "Y": 35},
    "dehua": {"La": 32, "Ce": 62, "Nd": 28, "Sm": 5.2, "Eu": 0.7, "Gd": 4.5, "Tb": 0.62, "Yb": 2.4, "Lu": 0.32, "Y": 15},
    "shufu": {"La": 44, "Ce": 86, "Nd": 39, "Sm": 7.4, "Eu": 1.22, "Gd": 6.2, "Tb": 0.87, "Yb": 3.35, "Lu": 0.47, "Y": 23.5},
    "yixing": {"La": 53, "Ce": 102, "Nd": 46, "Sm": 8.8, "Eu": 1.58, "Gd": 7.5, "Tb": 1.05, "Yb": 4.0, "Lu": 0.58, "Y": 30},
    "shiwan": {"La": 47, "Ce": 92, "Nd": 42, "Sm": 8.0, "Eu": 1.4, "Gd": 6.8, "Tb": 0.95, "Yb": 3.6, "Lu": 0.52, "Y": 26},
    "cangzhou": {"La": 49, "Ce": 94, "Nd": 43, "Sm": 8.3, "Eu": 1.42, "Gd": 7.0, "Tb": 0.97, "Yb": 3.75, "Lu": 0.54, "Y": 27.5},
    "henan": {"La": 51, "Ce": 96, "Nd": 45, "Sm": 8.6, "Eu": 1.52, "Gd": 7.3, "Tb": 1.02, "Yb": 3.9, "Lu": 0.56, "Y": 29},
    "shanxi": {"La": 54, "Ce": 100, "Nd": 47, "Sm": 9.0, "Eu": 1.6, "Gd": 7.6, "Tb": 1.08, "Yb": 4.1, "Lu": 0.59, "Y": 31},
    "hunan": {"La": 41, "Ce": 80, "Nd": 36, "Sm": 6.6, "Eu": 1.02, "Gd": 5.6, "Tb": 0.8, "Yb": 3.05, "Lu": 0.43, "Y": 20.5},
    "jiangxi": {"La": 44, "Ce": 83, "Nd": 38, "Sm": 7.1, "Eu": 1.15, "Gd": 6.0, "Tb": 0.86, "Yb": 3.25, "Lu": 0.46, "Y": 22.5}
}


def generate_kiln_samples():
    init_db()
    db = SessionLocal()

    existing_count = db.query(KilnSample).count()
    if existing_count > 0:
        print(f"Database already has {existing_count} samples. Skipping initialization.")
        db.close()
        return

    for kiln_id, base_comp in KILN_BASE_COMPOSITION.items():
        kiln_name = settings.KILN_NAMES.get(kiln_id, kiln_id)
        re_pattern = RARE_EARTH_PATTERNS.get(kiln_id, {})

        for i in range(30):
            sample = {
                "kiln_id": kiln_id,
                "kiln_name": kiln_name,
                "sample_id": f"{kiln_id}_{i+1:03d}",
                "year": int(np.random.normal(base_comp["year"], 80))
            }

            for element in settings.ELEMENTS:
                base_val = base_comp[element]
                std_dev = base_val * 0.15
                value = np.random.normal(base_val, std_dev)
                value = max(0.001, min(value, 100.0))
                sample[element] = value

            total = sum(sample[e] for e in settings.ELEMENTS)
            for element in settings.ELEMENTS:
                sample[element] = (sample[element] / total) * 100

            for re_elem in settings.RARE_EARTH_ELEMENTS:
                base_val = re_pattern.get(re_elem, 1.0)
                std_dev = base_val * 0.25
                value = np.random.normal(base_val, std_dev)
                value = max(0.001, value)
                sample[re_elem] = value

            db_sample = KilnSample(**sample)
            db.add(db_sample)

    db.commit()
    total_samples = db.query(KilnSample).count()
    print(f"Successfully initialized {total_samples} kiln samples with rare earth elements.")
    db.close()


if __name__ == "__main__":
    generate_kiln_samples()
