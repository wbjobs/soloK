from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from .variant_data import get_variant_dict


@dataclass
class ChangeItem:
    position: int
    from_char: str
    to_char: str


@dataclass
class CorrectionResult:
    corrected_text: str
    changes: List[ChangeItem]


CONTEXT_RULES = {
    ("于", "於"): {
        "prefer_yu": ["至", "至", "於", "是", "在", "由", "从", "自", "以", "及"],
        "prefer_wu": ["鳥", "飛", "歸", "還", "往", "去", "來", "到", "入", "出"],
    },
    ("於", "于"): {
        "prefer_yu": ["至", "至", "於", "是", "在", "由", "从", "自", "以", "及"],
        "prefer_wu": ["鳥", "飛", "歸", "還", "往", "去", "來", "到", "入", "出"],
    },
    ("才", "纔"): {
        "prefer_cai": ["能", "可", "不", "难", "方", "始", "刚", "初"],
        "prefer_shan": ["此", "只", "仅", "但", "犹", "尚", "略", "稍"],
    },
    ("纔", "才"): {
        "prefer_cai": ["能", "可", "不", "难", "方", "始", "刚", "初"],
        "prefer_shan": ["此", "只", "仅", "但", "犹", "尚", "略", "稍"],
    },
    ("以", "已"): {
        "prefer_yi": ["为", "与", "及", "而", "则", "可", "能", "会", "将", "欲"],
        "prefer_yi2": ["经", "曾", "久", "远", "甚", "太", "过", "极"],
    },
    ("已", "以"): {
        "prefer_yi": ["为", "与", "及", "而", "则", "可", "能", "会", "将", "欲"],
        "prefer_yi2": ["经", "曾", "久", "远", "甚", "太", "过", "极"],
    },
}

QING_DYNASTY_PREFERENCES = {
    "於": {"prefer": "於", "context": ["official", "formal", "classical"]},
    "于": {"prefer": "于", "context": ["poetic", "colloquial", "place_names"]},
    "才": {"prefer": "才", "context": ["ability", "talent"]},
    "纔": {"prefer": "纔", "context": ["only", "just_now"]},
    "以": {"prefer": "以", "context": ["using", "by_means_of"]},
    "已": {"prefer": "已", "context": ["already", "past"]},
    "裡": {"prefer": "裡", "context": ["inside", "within"]},
    "里": {"prefer": "里", "context": ["unit", "village", "surname"]},
    "後": {"prefer": "後", "context": ["after", "behind"]},
    "后": {"prefer": "后", "context": ["empress", "queen"]},
    "發": {"prefer": "發", "context": ["send", "emit", "issue"]},
    "髮": {"prefer": "髮", "context": ["hair"]},
    "云": {"prefer": "云", "context": ["say", "speak"]},
    "雲": {"prefer": "雲", "context": ["cloud"]},
    "表": {"prefer": "表", "context": ["surface", "express"]},
    "錶": {"prefer": "錶", "context": ["watch", "clock"]},
    "卷": {"prefer": "卷", "context": ["roll", "volume"]},
    "捲": {"prefer": "捲", "context": ["curl", "roll_up"]},
    "斗": {"prefer": "斗", "context": ["unit", "fight"]},
    "鬥": {"prefer": "鬥", "context": ["struggle", "contest"]},
}


class VariantCorrector:
    def __init__(self):
        self.variant_dict: Dict[str, Tuple[str, str]] = get_variant_dict()
        self.context_rules = CONTEXT_RULES
        self.qing_preferences = QING_DYNASTY_PREFERENCES

    def correct_text(self, text: str, book_id: Optional[str] = None) -> CorrectionResult:
        changes: List[ChangeItem] = []
        chars = list(text)
        
        for i, char in enumerate(chars):
            if char in self.variant_dict:
                standard_char, variant_type = self.variant_dict[char]
                
                context_choice = self._check_context(chars, i, char, standard_char)
                
                if context_choice:
                    target_char = context_choice
                else:
                    target_char = standard_char
                
                if char != target_char:
                    changes.append(ChangeItem(
                        position=i,
                        from_char=char,
                        to_char=target_char
                    ))
                    chars[i] = target_char
        
        corrected_text = ''.join(chars)
        return CorrectionResult(
            corrected_text=corrected_text,
            changes=changes
        )

    def _check_context(self, chars: List[str], position: int, 
                        current_char: str, standard_char: str) -> Optional[str]:
        key = (current_char, standard_char)
        if key not in self.context_rules:
            return None
        
        rules = self.context_rules[key]
        prev_char = chars[position - 1] if position > 0 else ""
        next_char = chars[position + 1] if position < len(chars) - 1 else ""
        
        context_chars = set([prev_char, next_char])
        
        for char in context_chars:
            if char in rules.get("prefer_yu", []):
                return "於" if "於" in key else "于"
            if char in rules.get("prefer_wu", []):
                return "于" if "于" in key else "於"
            if char in rules.get("prefer_cai", []):
                return "才" if "才" in key else "纔"
            if char in rules.get("prefer_shan", []):
                return "纔" if "纔" in key else "才"
            if char in rules.get("prefer_yi", []):
                return "以" if "以" in key else "已"
            if char in rules.get("prefer_yi2", []):
                return "已" if "已" in key else "以"
        
        return None

    def add_variant(self, variant: str, standard: str, variant_type: str) -> bool:
        if variant and len(variant) <= 10 and standard and len(standard) <= 10:
            self.variant_dict[variant] = (standard, variant_type)
            return True
        return False

    def get_variant_count(self) -> int:
        return len(self.variant_dict)


corrector = VariantCorrector()


def correct_text(text: str, book_id: Optional[str] = None) -> CorrectionResult:
    return corrector.correct_text(text, book_id)


def add_variant_mapping(variant: str, standard: str, variant_type: str) -> bool:
    return corrector.add_variant(variant, standard, variant_type)
