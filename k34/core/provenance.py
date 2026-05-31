"""
全球岩浆事件数据库
用于碎屑锆石年龄的物源区匹配
基于已发表的全球主要岩浆事件记录
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Optional


@dataclass
class MagmaticEvent:
    """岩浆事件记录"""
    name: str
    age_min: float
    age_max: float
    age_peak: float
    location: str
    tectonic_setting: str
    confidence: float = 0.8
    references: List[str] = field(default_factory=list)


@dataclass
class ProvenanceRegion:
    """物源区定义"""
    name: str
    description: str
    events: List[MagmaticEvent]
    color: str = "#1f77b4"

    @property
    def age_ranges(self) -> List[Tuple[float, float]]:
        return [(e.age_min, e.age_max) for e in self.events]

    @property
    def age_peaks(self) -> List[float]:
        return [e.age_peak for e in self.events]


GLOBAL_MAGMATIC_EVENTS = [
    MagmaticEvent("太古宙TTG岩石", 2500, 4000, 3200, "全球", "太古宙地壳生长", 0.9,
                   ["Condie, 2005"]),
    MagmaticEvent("新太古代岩浆事件", 2500, 2800, 2650, "全球", "太古宙末期岩浆活动", 0.85),
    MagmaticEvent("古元古代岩浆活动", 1800, 2500, 2100, "全球", "Columbia超大陆聚合", 0.8,
                  ["Zhao et al., 2004"]),
    MagmaticEvent("中元古代岩浆事件", 1000, 1800, 1400, "全球", "Rodinia超大陆演化", 0.75),
    MagmaticEvent("Grenville期造山", 900, 1300, 1100, "北美/欧洲", "Grenville造山带", 0.9,
                  ["Rivers, 1997"]),
    MagmaticEvent("新元古代岩浆活动", 541, 1000, 750, "全球", "Rodinia裂解", 0.85),
    MagmaticEvent("Pan-African造山", 500, 750, 620, "冈瓦纳大陆", "Pan-African造山事件", 0.9,
                  ["Stern, 1994"]),
    MagmaticEvent("Caledonian造山", 390, 500, 440, "欧洲/北美东部", "Caledonian造山带", 0.9,
                  ["Soper & Woodcock, 1990"]),
    MagmaticEvent("加里东期岩浆", 400, 500, 450, "中国华南/华北", "早古生代岩浆活动", 0.75),
    MagmaticEvent("Variscan造山", 290, 390, 340, "欧洲", "Variscan造山带", 0.9,
                  ["Matte, 2001"]),
    MagmaticEvent("海西期岩浆活动", 250, 380, 300, "中国", "晚古生代岩浆活动", 0.75),
    MagmaticEvent("Indosinian造山", 200, 250, 220, "东南亚", "印支运动", 0.85,
                  ["Lepvrier et al., 2004"]),
    MagmaticEvent("古特提斯洋俯冲", 220, 280, 250, "中国西南/东南亚", "古特提斯演化", 0.8),
    MagmaticEvent("燕山期岩浆活动", 90, 200, 140, "中国东部", "太平洋俯冲", 0.9,
                  ["Zhou & Li, 2000"]),
    MagmaticEvent("晚中生代岩浆活动", 65, 180, 120, "环太平洋", "太平洋板块俯冲", 0.85),
    MagmaticEvent("Himalayan造山", 0, 65, 40, "青藏高原", "印度-亚洲碰撞", 0.95,
                  ["Yin & Harrison, 2000"]),
    MagmaticEvent("新生代岩浆活动", 0, 65, 25, "环太平洋/阿尔卑斯", "新生代岩浆", 0.8),
    MagmaticEvent("阿尔卑斯造山", 0, 65, 35, "欧洲", "非洲-欧洲碰撞", 0.9,
                  ["Schmid et al., 2004"]),
    MagmaticEvent("安第斯山脉岩浆", 0, 200, 50, "南美", "Nazca板块俯冲", 0.85),
    MagmaticEvent("北美科迪勒拉", 0, 200, 80, "北美西部", "Farallon板块俯冲", 0.85),
    MagmaticEvent("二叠纪-三叠纪岩浆", 200, 300, 250, "泛大陆", "Pangea聚合", 0.8),
    MagmaticEvent("白垩纪岩浆岩省", 70, 140, 110, "全球", "白垩纪大火成岩省", 0.8,
                  ["Courtillot et al., 2003"]),
    MagmaticEvent("侏罗纪岩浆活动", 145, 200, 170, "全球", "Pangea裂解", 0.75),
    MagmaticEvent("三叠纪岩浆", 200, 250, 225, "全球", "Pangea裂解初期", 0.7),
    MagmaticEvent("西伯利亚暗色岩", 251, 252, 251.5, "西伯利亚", "二叠-三叠纪边界LIP", 0.95,
                  ["Campbell & Griffiths, 1992"]),
    MagmaticEvent("峨眉山玄武岩", 258, 263, 260, "中国西南", "中二叠世LIP", 0.9,
                  ["Xu et al., 2004"]),
    MagmaticEvent("哥伦比亚溢流玄武岩", 16, 17, 16.5, "北美西北部", "中新世LIP", 0.9,
                  ["Hooper, 1997"]),
    MagmaticEvent("德干暗色岩", 65, 67, 66, "印度", "K-T边界LIP", 0.95,
                  ["Courtillot, 1999"]),
    MagmaticEvent("华北克拉通破坏", 110, 140, 125, "中国东部", "克拉通破坏", 0.85,
                  ["Wu et al., 2019"]),
    MagmaticEvent("长江中下游成矿带", 120, 150, 135, "中国东部", "岩浆-成矿作用", 0.8,
                  ["Mao et al., 2011"]),
    MagmaticEvent("秦岭造山带", 200, 400, 300, "中国中部", "三叠纪碰撞", 0.85,
                  ["Meng & Zhang, 1999"]),
    MagmaticEvent("天山造山带", 250, 350, 300, "中国西北", "古亚洲洋闭合", 0.8,
                  ["Xiao et al., 2004"]),
    MagmaticEvent("青藏高原羌塘地块", 180, 280, 230, "青藏高原", "古特提斯", 0.8,
                  ["Kapp et al., 2003"]),
    MagmaticEvent("松潘-甘孜造山带", 190, 220, 205, "中国西南", "三叠纪碰撞", 0.8,
                  ["Weislogel et al., 2006"]),
]


PROVENANCE_REGIONS = [
    ProvenanceRegion(
        name="太古宙地壳",
        description="年龄>2500 Ma的古老地壳物质",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS if e.age_min >= 2500],
        color="#8B4513",
    ),
    ProvenanceRegion(
        name="古元古代",
        description="1800-2500 Ma的古元古代岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 1800 and e.age_max < 2500],
        color="#A0522D",
    ),
    ProvenanceRegion(
        name="中元古代",
        description="1000-1800 Ma的中元古代岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 1000 and e.age_max < 1800],
        color="#CD853F",
    ),
    ProvenanceRegion(
        name="新元古代",
        description="541-1000 Ma的新元古代岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 541 and e.age_max < 1000],
        color="#DAA520",
    ),
    ProvenanceRegion(
        name="寒武纪-奥陶纪",
        description="443-541 Ma的早古生代早期岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 443 and e.age_max < 541],
        color="#B8860B",
    ),
    ProvenanceRegion(
        name="志留纪-泥盆纪",
        description="359-443 Ma的早古生代晚期岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 359 and e.age_max < 443],
        color="#9ACD32",
    ),
    ProvenanceRegion(
        name="石炭纪-二叠纪",
        description="252-359 Ma的晚古生代岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 252 and e.age_max < 359],
        color="#6B8E23",
    ),
    ProvenanceRegion(
        name="三叠纪",
        description="201-252 Ma的三叠纪岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 201 and e.age_max < 252],
        color="#2E8B57",
    ),
    ProvenanceRegion(
        name="侏罗纪",
        description="145-201 Ma的侏罗纪岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 145 and e.age_max < 201],
        color="#3CB371",
    ),
    ProvenanceRegion(
        name="白垩纪",
        description="66-145 Ma的白垩纪岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 66 and e.age_max < 145],
        color="#20B2AA",
    ),
    ProvenanceRegion(
        name="古近纪-新近纪",
        description="2.6-66 Ma的古近纪-新近纪岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_min >= 2.6 and e.age_max < 66],
        color="#4682B4",
    ),
    ProvenanceRegion(
        name="第四纪",
        description="0-2.6 Ma的第四纪岩浆活动",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if e.age_max < 2.6 or e.age_min < 2.6],
        color="#1E90FF",
    ),
    ProvenanceRegion(
        name="Pan-African/Gondwana",
        description="500-750 Ma冈瓦纳大陆聚合相关岩浆",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if "Pan-African" in e.name or "冈瓦纳" in e.name],
        color="#8B008B",
    ),
    ProvenanceRegion(
        name="Grenville期",
        description="900-1300 Ma Grenville造山带相关",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if "Grenville" in e.name],
        color="#9932CC",
    ),
    ProvenanceRegion(
        name="Caledonian期",
        description="390-500 Ma Caledonian造山带相关",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if "Caledonian" in e.name or "加里东" in e.name],
        color="#BA55D3",
    ),
    ProvenanceRegion(
        name="Variscan/海西期",
        description="290-390 Ma Variscan/海西造山带相关",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if "Variscan" in e.name or "海西" in e.name],
        color="#C71585",
    ),
    ProvenanceRegion(
        name="燕山期",
        description="90-200 Ma中国东部燕山期岩浆",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if "燕山" in e.name or "Yanshan" in e.name],
        color="#FF1493",
    ),
    ProvenanceRegion(
        name="喜马拉雅期",
        description="0-65 Ma喜马拉雅造山带相关",
        events=[e for e in GLOBAL_MAGMATIC_EVENTS
                if "Himalayan" in e.name or "喜马拉雅" in e.name],
        color="#FF6347",
    ),
    ProvenanceRegion(
        name="未匹配",
        description="无法匹配到已知物源区的年龄",
        events=[],
        color="#808080",
    ),
]


def match_age_to_events(age: float, tolerance: float = 0.1) -> List[MagmaticEvent]:
    """
    将单个年龄匹配到岩浆事件

    参数:
        age: 年龄 (Ma)
        tolerance: 容差（年龄的百分比）

    返回:
        匹配的岩浆事件列表（按匹配度排序）
    """
    matches = []
    tolerance_ma = max(age * tolerance, 10.0)

    for event in GLOBAL_MAGMATIC_EVENTS:
        if event.age_min - tolerance_ma <= age <= event.age_max + tolerance_ma:
            distance = abs(age - event.age_peak)
            matches.append((event, distance))

    matches.sort(key=lambda x: x[1])
    return [m[0] for m in matches]


def match_peak_to_provenance(
    peak_age: float,
    peak_sigma: float,
) -> Tuple[Optional[ProvenanceRegion], List[ProvenanceRegion]]:
    """
    将年龄峰匹配到物源区

    参数:
        peak_age: 峰中心年龄 (Ma)
        peak_sigma: 峰的标准偏差 (Ma)

    返回:
        (最佳匹配物源区, 所有候选物源区列表)
    """
    candidates = []
    weights = []

    for region in PROVENANCE_REGIONS:
        if region.name == "未匹配":
            continue

        max_match_score = 0.0
        for event in region.events:
            if event.age_min <= peak_age <= event.age_max:
                center_distance = abs(peak_age - event.age_peak)
                age_range = max(event.age_max - event.age_min, 1.0)
                event_score = (1.0 - center_distance / age_range) * event.confidence
                event_score = max(event_score, 0.0)
                max_match_score = max(max_match_score, event_score)

        if max_match_score > 0.3:
            candidates.append(region)
            weights.append(max_match_score)

    if not candidates:
        return get_provenance_by_name("未匹配"), []

    sorted_indices = sorted(range(len(candidates)), key=lambda i: weights[i], reverse=True)
    sorted_candidates = [candidates[i] for i in sorted_indices]

    return sorted_candidates[0], sorted_candidates


def get_provenance_by_name(name: str) -> Optional[ProvenanceRegion]:
    """根据名称获取物源区"""
    for region in PROVENANCE_REGIONS:
        if region.name == name:
            return region
    return None


GEOLOGICAL_TIMESCALE = [
    ("第四纪", 0, 2.6),
    ("新近纪", 2.6, 23.03),
    ("古近纪", 23.03, 66.0),
    ("白垩纪", 66.0, 145.0),
    ("侏罗纪", 145.0, 201.3),
    ("三叠纪", 201.3, 252.17),
    ("二叠纪", 252.17, 298.9),
    ("石炭纪", 298.9, 358.9),
    ("泥盆纪", 358.9, 419.2),
    ("志留纪", 419.2, 443.8),
    ("奥陶纪", 443.8, 485.4),
    ("寒武纪", 485.4, 541.0),
    ("新元古代", 541.0, 1000.0),
    ("中元古代", 1000.0, 1600.0),
    ("古元古代", 1600.0, 2500.0),
    ("新太古代", 2500.0, 2800.0),
    ("中太古代", 2800.0, 3200.0),
    ("古太古代", 3200.0, 3600.0),
    ("始太古代", 3600.0, 4000.0),
]


def get_geological_period(age: float) -> str:
    """获取年龄对应的地质年代"""
    for name, start, end in GEOLOGICAL_TIMESCALE:
        if start <= age < end:
            return name
    return "未知"
