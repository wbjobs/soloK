"""
数据解析模块
读取LA-ICP-MS或SIMS测试数据（CSV格式）
支持同位素比值、标准偏差、误差相关性的解析
"""

import numpy as np
import pandas as pd
from pathlib import Path


class ZirconData:
    """锆石U-Pb定年数据容器"""

    REQUIRED_COLUMNS = {
        "r68": "206Pb/238U比值",
        "r75": "207Pb/235U比值",
        "r76": "207Pb/206Pb比值",
        "r86": "238U/206Pb比值",
        "s68": "206Pb/238U 1σ标准偏差",
        "s75": "207Pb/235U 1σ标准偏差",
        "s76": "207Pb/206Pb 1σ标准偏差",
        "s86": "238U/206Pb 1σ标准偏差",
        "rho68_75": "r68与r75误差相关系数",
    }

    OPTIONAL_COLUMNS = {
        "r208_232": "208Pb/232Th比值",
        "s208_232": "208Pb/232Th 1σ标准偏差",
        "r204_206": "204Pb/206Pb比值",
        "s204_206": "204Pb/206Pb 1σ标准偏差",
        "sample_name": "样品名称",
        "grain_id": "颗粒编号",
        "spot_id": "分析点编号",
        "U_ppm": "U含量 (ppm)",
        "Yb_ppm": "Yb含量 (ppm)",
        "Th_ppm": "Th含量 (ppm)",
        "Ce_ppm": "Ce含量 (ppm)",
        "La_ppm": "La含量 (ppm)",
        "Pr_ppm": "Pr含量 (ppm)",
        "Nd_ppm": "Nd含量 (ppm)",
        "Sm_ppm": "Sm含量 (ppm)",
        "Gd_ppm": "Gd含量 (ppm)",
        "Lu_ppm": "Lu含量 (ppm)",
        "Y_ppm": "Y含量 (ppm)",
        "Hf_ppm": "Hf含量 (ppm)",
        "Ti_ppm": "Ti含量 (ppm)",
        "Nb_ppm": "Nb含量 (ppm)",
        "Ta_ppm": "Ta含量 (ppm)",
    }

    def __init__(self, df: pd.DataFrame, metadata: dict = None):
        self.raw_df = df.copy()
        self.df = df.copy()
        self.metadata = metadata or {}
        self._validate()
        self._compute_derived()

    def _validate(self):
        """验证数据完整性"""
        missing = []
        for col in self.REQUIRED_COLUMNS:
            if col not in self.df.columns:
                missing.append(col)
        if missing:
            raise ValueError(
                f"缺少必要列: {', '.join(f'{c} ({self.REQUIRED_COLUMNS[c]})' for c in missing)}"
            )
        for col in ["r68", "r75", "r76", "r86"]:
            if (self.df[col] <= 0).any():
                raise ValueError(f"{col} 包含非正值")
        for col in ["s68", "s75", "s76", "s86"]:
            if (self.df[col] < 0).any():
                raise ValueError(f"{col} 包含负值")
        if (self.df["rho68_75"].abs() > 1).any():
            raise ValueError("rho68_75 必须在 [-1, 1] 范围内")

    def _compute_derived(self):
        """计算派生列"""
        if "r86" not in self.df.columns or self.df["r86"].isna().any():
            self.df["r86"] = 1.0 / self.df["r68"]
            self.df["s86"] = self.df["s68"] / (self.df["r68"] ** 2)
        if "r208_232" in self.df.columns and "r86" in self.df.columns:
            self.df["Th_U"] = (
                self.df["r208_232"] * self.df["r86"]
            )

    @classmethod
    def from_csv(cls, filepath: str, encoding: str = "utf-8-sig"):
        """从CSV文件加载数据"""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"文件不存在: {filepath}")

        df = pd.read_csv(path, encoding=encoding)
        df.columns = df.columns.str.strip()

        column_mapping = {
            "206Pb/238U": "r68",
            "207Pb/235U": "r75",
            "207Pb/206Pb": "r76",
            "238U/206Pb": "r86",
            "206Pb/238U_1σ": "s68",
            "207Pb/235U_1σ": "s75",
            "207Pb/206Pb_1σ": "s76",
            "238U/206Pb_1σ": "s86",
            "206Pb/238U_sigma": "s68",
            "207Pb/235U_sigma": "s75",
            "207Pb/206Pb_sigma": "s76",
            "238U/206Pb_sigma": "s86",
            "s_206Pb/238U": "s68",
            "s_207Pb/235U": "s75",
            "s_207Pb/206Pb": "s76",
            "s_238U/206Pb": "s86",
            "r68": "r68",
            "r75": "r75",
            "r76": "r76",
            "r86": "r86",
            "s68": "s68",
            "s75": "s75",
            "s76": "s76",
            "s86": "s86",
            "rho": "rho68_75",
            "rho68_75": "rho68_75",
            "correlation": "rho68_75",
            "208Pb/232Th": "r208_232",
            "208Pb/232Th_1σ": "s208_232",
            "204Pb/206Pb": "r204_206",
            "204Pb/206Pb_1σ": "s204_206",
            "sample": "sample_name",
            "sample_name": "sample_name",
            "grain": "grain_id",
            "grain_id": "grain_id",
            "spot": "spot_id",
            "spot_id": "spot_id",
        }

        df = df.rename(columns=column_mapping)

        for col in cls.REQUIRED_COLUMNS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        trace_mapping = {
            "U": "U_ppm", "U(ppm)": "U_ppm", "U_ppm": "U_ppm",
            "Yb": "Yb_ppm", "Yb(ppm)": "Yb_ppm", "Yb_ppm": "Yb_ppm",
            "Th": "Th_ppm", "Th(ppm)": "Th_ppm", "Th_ppm": "Th_ppm",
            "Ce": "Ce_ppm", "Ce(ppm)": "Ce_ppm", "Ce_ppm": "Ce_ppm",
            "La": "La_ppm", "La(ppm)": "La_ppm", "La_ppm": "La_ppm",
            "Pr": "Pr_ppm", "Pr(ppm)": "Pr_ppm", "Pr_ppm": "Pr_ppm",
            "Nd": "Nd_ppm", "Nd(ppm)": "Nd_ppm", "Nd_ppm": "Nd_ppm",
            "Sm": "Sm_ppm", "Sm(ppm)": "Sm_ppm", "Sm_ppm": "Sm_ppm",
            "Gd": "Gd_ppm", "Gd(ppm)": "Gd_ppm", "Gd_ppm": "Gd_ppm",
            "Lu": "Lu_ppm", "Lu(ppm)": "Lu_ppm", "Lu_ppm": "Lu_ppm",
            "Y": "Y_ppm", "Y(ppm)": "Y_ppm", "Y_ppm": "Y_ppm",
            "Hf": "Hf_ppm", "Hf(ppm)": "Hf_ppm", "Hf_ppm": "Hf_ppm",
            "Ti": "Ti_ppm", "Ti(ppm)": "Ti_ppm", "Ti_ppm": "Ti_ppm",
            "Nb": "Nb_ppm", "Nb(ppm)": "Nb_ppm", "Nb_ppm": "Nb_ppm",
            "Ta": "Ta_ppm", "Ta(ppm)": "Ta_ppm", "Ta_ppm": "Ta_ppm",
        }
        df = df.rename(columns=trace_mapping)

        metadata = {"source_file": str(path)}
        return cls(df, metadata=metadata)

    def __len__(self):
        return len(self.df)

    def __repr__(self):
        return f"ZirconData(n={len(self)}, samples={self.df.get('sample_name', 'N/A').nunique() if 'sample_name' in self.df.columns else 'N/A'})"

    @property
    def r68(self):
        return self.df["r68"].values

    @property
    def r75(self):
        return self.df["r75"].values

    @property
    def r76(self):
        return self.df["r76"].values

    @property
    def r86(self):
        return self.df["r86"].values

    @property
    def s68(self):
        return self.df["s68"].values

    @property
    def s75(self):
        return self.df["s75"].values

    @property
    def s76(self):
        return self.df["s76"].values

    @property
    def s86(self):
        return self.df["s86"].values

    @property
    def rho68_75(self):
        return self.df["rho68_75"].values

    @property
    def r208_232(self):
        if "r208_232" in self.df.columns:
            return self.df["r208_232"].values
        return None

    @property
    def r204_206(self):
        if "r204_206" in self.df.columns:
            return self.df["r204_206"].values
        return None

    @property
    def trace_elements(self):
        from .trace_elements import TraceElementData
        return TraceElementData(
            U_ppm=self._get_col("U_ppm"),
            Yb_ppm=self._get_col("Yb_ppm"),
            Th_ppm=self._get_col("Th_ppm"),
            Ce_ppm=self._get_col("Ce_ppm"),
            La_ppm=self._get_col("La_ppm"),
            Pr_ppm=self._get_col("Pr_ppm"),
            Nd_ppm=self._get_col("Nd_ppm"),
            Sm_ppm=self._get_col("Sm_ppm"),
            Gd_ppm=self._get_col("Gd_ppm"),
            Lu_ppm=self._get_col("Lu_ppm"),
            Y_ppm=self._get_col("Y_ppm"),
            Hf_ppm=self._get_col("Hf_ppm"),
            Ti_ppm=self._get_col("Ti_ppm"),
            Nb_ppm=self._get_col("Nb_ppm"),
            Ta_ppm=self._get_col("Ta_ppm"),
        )

    def _get_col(self, col_name):
        if col_name in self.df.columns:
            return pd.to_numeric(self.df[col_name], errors="coerce").values
        return None

    @property
    def has_trace_elements(self) -> bool:
        te_cols = ["U_ppm", "Yb_ppm", "Th_ppm"]
        return any(col in self.df.columns for col in te_cols)
