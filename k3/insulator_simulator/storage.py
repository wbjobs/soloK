"""
SQLite 历史存储模块

功能:
  - 保存仿真结果
  - 查询历史记录
  - 历史对比
"""

import sqlite3
import json
import time
from pathlib import Path


DB_PATH = Path(__file__).resolve().parent.parent / "data" / "simulations.db"


class HistoryStorage:
    """SQLite 历史存储"""

    def __init__(self, db_path: str | None = None):
        self.db_path = Path(db_path) if db_path else DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self):
        return sqlite3.connect(str(self.db_path))

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("""
            CREATE TABLE IF NOT EXISTS simulations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                string_type TEXT NOT NULL,
                wind_speed REAL NOT NULL,
                wind_angle REAL NOT NULL,
                string_length REAL NOT NULL,
                v_angle REAL NOT NULL,
                conductor_tension REAL NOT NULL,
                deflection_angle REAL NOT NULL,
                arm_stress_pa REAL NOT NULL,
                wind_force_n REAL NOT NULL,
                safe INTEGER NOT NULL,
                params_json TEXT NOT NULL,
                result_json TEXT NOT NULL
            )
        """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS scans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    string_type TEXT NOT NULL,
                    param_json TEXT NOT NULL,
                    results_json TEXT NOT NULL
                )
            """)
            conn.commit()

    def save_simulation(self, params: dict, result: dict) -> int:
        with self._get_conn() as conn:
            cursor = conn.execute(
                """INSERT INTO simulations
                   (timestamp, string_type, wind_speed, wind_angle,
                    string_length, v_angle, conductor_tension,
                    deflection_angle, arm_stress_pa, wind_force_n,
                    safe, params_json, result_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    time.time(),
                    params.get("string_type", "I"),
                    params.get("wind_speed", 0),
                    params.get("wind_angle", 0),
                    params.get("string_length", 3.0),
                    params.get("v_angle", 45.0),
                    params.get("conductor_tension", 30000.0),
                    result["deflection_angle_deg"],
                    result["arm_stress_pa"],
                    result["wind_force_n"],
                    1 if result["safe"] else 0,
                    json.dumps(params, ensure_ascii=False),
                    json.dumps(result, ensure_ascii=False),
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def save_scan(self, param: dict, results: list) -> int:
        with self._get_conn() as conn:
            cursor = conn.execute(
                """INSERT INTO scans
                   (timestamp, string_type, param_json, results_json)
                   VALUES (?, ?, ?, ?)""",
                (
                    time.time(),
                    param.get("string_type", "I"),
                    json.dumps(param, ensure_ascii=False),
                    json.dumps(results, ensure_ascii=False),
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def get_history(self, limit: int = 50) -> list[dict]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM simulations ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "timestamp": row["timestamp"],
                    "string_type": row["string_type"],
                    "wind_speed": row["wind_speed"],
                    "wind_angle": row["wind_angle"],
                    "string_length": row["string_length"],
                    "v_angle": row["v_angle"],
                    "conductor_tension": row["conductor_tension"],
                    "deflection_angle": row["deflection_angle"],
                    "arm_stress_pa": row["arm_stress_pa"],
                    "wind_force_n": row["wind_force_n"],
                    "safe": bool(row["safe"]),
                    "params": json.loads(row["params_json"]),
                    "result": json.loads(row["result_json"]),
                }
                for row in rows
            ]

    def get_by_id(self, sim_id: int) -> dict | None:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM simulations WHERE id = ?", (sim_id,)
            ).fetchone()
            if row is None:
                return None
            return {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "deflection_angle": row["deflection_angle"],
                "arm_stress_pa": row["arm_stress_pa"],
                "safe": bool(row["safe"]),
                "params": json.loads(row["params_json"]),
                "result": json.loads(row["result_json"]),
            }

    def compare_with_history(self, current_result: dict,
                            historical_id: int) -> dict:
        hist = self.get_by_id(historical_id)
        if hist is None:
            return {"error": "历史记录不存在"}
        current = current_result
        return {
            "current_deflection_deg": current["deflection_angle_deg"],
            "historical_deflection_deg": hist["deflection_angle"],
            "deflection_diff_deg": (
                current["deflection_angle_deg"] - hist["deflection_angle"]
            ),
            "current_stress_pa": current["arm_stress_pa"],
            "historical_stress_pa": hist["arm_stress_pa"],
            "stress_diff_pa": (
                current["arm_stress_pa"] - hist["arm_stress_pa"]
            ),
            "current_safe": current["safe"],
            "historical_safe": hist["safe"],
            "historical_params": hist["params"],
        }

    def delete(self, sim_id: int) -> bool:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM simulations WHERE id = ?", (sim_id,))
            conn.commit()
            return True

    def clear_all(self):
        with self._get_conn() as conn:
            conn.execute("DELETE FROM simulations")
            conn.execute("DELETE FROM scans")
            conn.commit()
