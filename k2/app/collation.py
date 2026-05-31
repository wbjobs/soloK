from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from .variant_data import get_variant_dict
from .corrector import correct_text, ChangeItem


@dataclass
class EditionDifference:
    position: int
    char_a: str
    char_b: str
    difference_type: str
    is_variant_relation: bool
    standard_char: Optional[str]
    note: str


@dataclass
class CollationResult:
    book_name: str
    edition_a: str
    edition_b: str
    total_characters: int
    differing_positions: int
    variant_relations: int
    differences: List[EditionDifference]
    summary: Dict[str, int]


class EditionCollator:
    def __init__(self):
        self.variant_dict = get_variant_dict()
        self.variant_relations = self._build_variant_relations()

    def _build_variant_relations(self) -> Dict[str, set]:
        relations = {}
        for variant, (standard, vtype) in self.variant_dict.items():
            if standard not in relations:
                relations[standard] = set()
            relations[standard].add(variant)
            if variant not in relations:
                relations[variant] = set()
            relations[variant].add(standard)
        return relations

    def _is_variant_pair(self, char_a: str, char_b: str) -> Tuple[bool, Optional[str]]:
        if char_a == char_b:
            return True, char_a
        
        if char_a in self.variant_dict:
            std_a, _ = self.variant_dict[char_a]
            if std_a == char_b:
                return True, std_a
            if char_b in self.variant_dict:
                std_b, _ = self.variant_dict[char_b]
                if std_a == std_b:
                    return True, std_a
        
        if char_b in self.variant_dict:
            std_b, _ = self.variant_dict[char_b]
            if std_b == char_a:
                return True, std_b
        
        if char_a in self.variant_relations and char_b in self.variant_relations[char_a]:
            common = self.variant_relations[char_a] & self.variant_relations[char_b]
            if common:
                return True, list(common)[0]
        
        return False, None

    def _classify_difference(self, char_a: str, char_b: str, 
                               is_variant: bool, standard: Optional[str]) -> Tuple[str, str]:
        if is_variant:
            if char_a in self.variant_dict:
                _, type_a = self.variant_dict[char_a]
                return "异体字关系", f"{char_a}({type_a})与{char_b}为异体字关系，标准字: {standard}"
            elif char_b in self.variant_dict:
                _, type_b = self.variant_dict[char_b]
                return "异体字关系", f"{char_a}与{char_b}({type_b})为异体字关系，标准字: {standard}"
            else:
                return "异体字关系", f"{char_a}与{char_b}为异体字关系，标准字: {standard}"
        
        if char_a == "" or char_b == "":
            return "脱漏/衍文", f"存在文字脱漏或衍文差异"
        
        if ord(char_a) > 127 and ord(char_b) > 127:
            return "文字差异", f"不同用字: {char_a} vs {char_b}"
        elif ord(char_a) <= 127 or ord(char_b) <= 127:
            return "格式差异", f"包含非汉字字符差异"
        else:
            return "其他差异", f"未知类型差异"

    def collate_editions(self, book_name: str, edition_a_name: str, 
                          edition_b_name: str, text_a: str, 
                          text_b: str) -> CollationResult:
        corrected_a = correct_text(text_a, book_name)
        corrected_b = correct_text(text_b, book_name)
        
        chars_a = list(corrected_a.corrected_text)
        chars_b = list(corrected_b.corrected_text)
        
        max_len = max(len(chars_a), len(chars_b))
        differences = []
        summary = {
            "异体字关系": 0,
            "文字差异": 0,
            "脱漏/衍文": 0,
            "格式差异": 0,
            "其他差异": 0
        }
        variant_count = 0
        
        for i in range(max_len):
            char_a = chars_a[i] if i < len(chars_a) else ""
            char_b = chars_b[i] if i < len(chars_b) else ""
            
            if char_a != char_b:
                is_variant, standard = self._is_variant_pair(char_a, char_b)
                diff_type, note = self._classify_difference(char_a, char_b, is_variant, standard)
                
                if is_variant:
                    variant_count += 1
                
                summary[diff_type] = summary.get(diff_type, 0) + 1
                
                differences.append(EditionDifference(
                    position=i,
                    char_a=char_a,
                    char_b=char_b,
                    difference_type=diff_type,
                    is_variant_relation=is_variant,
                    standard_char=standard,
                    note=note
                ))
        
        return CollationResult(
            book_name=book_name,
            edition_a=edition_a_name,
            edition_b=edition_b_name,
            total_characters=max_len,
            differing_positions=len(differences),
            variant_relations=variant_count,
            differences=differences,
            summary=summary
        )

    def multi_edition_collate(self, book_name: str, editions: List[Tuple[str, str]]) -> Dict:
        if len(editions) < 2:
            raise ValueError("至少需要两个版本进行校勘")
        
        base_name, base_text = editions[0]
        results = []
        
        for name, text in editions[1:]:
            result = self.collate_editions(book_name, base_name, name, base_text, text)
            results.append({
                "comparison_with": name,
                "result": result
            })
        
        return {
            "book_name": book_name,
            "base_edition": base_name,
            "comparisons": results,
            "total_comparisons": len(results)
        }


collator = EditionCollator()


def collate_two_editions(book_name: str, edition_a_name: str, 
                          edition_b_name: str, text_a: str, 
                          text_b: str) -> CollationResult:
    return collator.collate_editions(book_name, edition_a_name, edition_b_name, text_a, text_b)


def collate_multiple_editions(book_name: str, editions: List[Tuple[str, str]]) -> Dict:
    return collator.multi_edition_collate(book_name, editions)
