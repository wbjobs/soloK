from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import logging
from .variant_data import get_variant_dict


logger = logging.getLogger(__name__)


@dataclass
class BertCorrection:
    position: int
    original_char: str
    predicted_char: str
    confidence: float
    context_before: str
    context_after: str
    source: str


class BertAncientTextCorrector:
    def __init__(self, model_path: Optional[str] = None, use_mock: bool = True):
        self.use_mock = use_mock
        self.model = None
        self.tokenizer = None
        self.variant_dict = get_variant_dict()
        self.confidence_threshold = 0.7
        
        self.context_correction_rules = self._build_context_rules()
        
        if not use_mock and model_path:
            self._load_model(model_path)
    
    def _load_model(self, model_path: str):
        try:
            from transformers import AutoTokenizer, AutoModelForMaskedLM
            import torch
            
            self.tokenizer = AutoTokenizer.from_pretrained(model_path)
            self.model = AutoModelForMaskedLM.from_pretrained(model_path)
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.model.to(self.device)
            self.model.eval()
            logger.info(f"BERT model loaded from {model_path}")
        except Exception as e:
            logger.warning(f"Failed to load BERT model, falling back to mock mode: {e}")
            self.use_mock = True
    
    def _build_context_rules(self) -> Dict[str, List[Dict]]:
        return {
            "於于": [
                {"context": ["至於", "於是", "在於", "由於", "歸於", "出於"], "correct": "於"},
                {"context": ["于飛", "于歸", "于役", "于狩"], "correct": "于"},
            ],
            "以已": [
                {"context": ["可以", "足以", "得以", "所以", "以此"], "correct": "以"},
                {"context": ["已經", "而已", "已然", "已知", "已故"], "correct": "已"},
            ],
            "才纔": [
                {"context": ["才能", "才華", "才子", "英才", "口才"], "correct": "才"},
                {"context": ["纔剛", "纔剛剛", "纔開始", "纔不到"], "correct": "纔"},
            ],
            "後后": [
                {"context": ["後來", "後面", "先後", "落後", "後代"], "correct": "後"},
                {"context": ["皇后", "太后", "后妃", "女皇之后"], "correct": "后"},
            ],
            "裡里": [
                {"context": ["裡面", "家裡", "心裡", "夜裡", "這裡"], "correct": "裡"},
                {"context": ["千里", "里長", "鄉里", "鄰里", "里程"], "correct": "里"},
            ],
            "發髮": [
                {"context": ["發現", "發出", "發送", "開發", "啓發"], "correct": "發"},
                {"context": ["頭髮", "毛髮", "黑髮", "白髮", "鬢髮"], "correct": "髮"},
            ],
            "云雲": [
                {"context": ["子曰诗云", "人云", "孔子云", "謂云"], "correct": "云"},
                {"context": ["白雲", "雲彩", "烏雲", "雲端", "雲層"], "correct": "雲"},
            ],
            "表錶": [
                {"context": ["表示", "表現", "表面", "代表", "外表"], "correct": "表"},
                {"context": ["手錶", "鐘錶", "錶盤", "懷錶"], "correct": "錶"},
            ],
            "斗鬥": [
                {"context": ["北斗", "升斗", "斗膽", "斗篷"], "correct": "斗"},
                {"context": ["戰鬥", "鬥爭", "格鬥", "搏鬥"], "correct": "鬥"},
            ],
            "卷捲": [
                {"context": ["書卷", "試卷", "卷宗", "第一卷"], "correct": "卷"},
                {"context": ["捲起", "捲曲", "捲入", "捲簾"], "correct": "捲"},
            ],
        }
    
    def _get_context(self, text: str, position: int, window_size: int = 5) -> Tuple[str, str]:
        start = max(0, position - window_size)
        end = min(len(text), position + window_size + 1)
        
        before = text[start:position]
        after = text[position+1:end]
        
        return before, after
    
    def _mock_bert_inference(self, char: str, context_before: str, 
                              context_after: str) -> Tuple[str, float]:
        context = context_before + char + context_after
        
        for pair, rules in self.context_correction_rules.items():
            for rule in rules:
                for ctx_pattern in rule["context"]:
                    if ctx_pattern in context:
                        if char in pair:
                            correct_char = rule["correct"]
                            if char != correct_char:
                                return correct_char, 0.85
        
        if char in self.variant_dict:
            standard, _ = self.variant_dict[char]
            if char != standard:
                return standard, 0.78
        
        return char, 0.95
    
    def _real_bert_inference(self, text: str, position: int, 
                              candidates: List[str]) -> List[Tuple[str, float]]:
        import torch
        
        masked_text = text[:position] + "[MASK]" + text[position+1:]
        
        inputs = self.tokenizer(masked_text, return_tensors="pt", 
                                truncation=True, max_length=512)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        mask_idx = torch.where(inputs["input_ids"][0] == self.tokenizer.mask_token_id)[0]
        
        if len(mask_idx) == 0:
            return []
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits[0, mask_idx[0]]
            probs = torch.softmax(logits, dim=-1)
        
        results = []
        for candidate in candidates:
            cand_id = self.tokenizer.convert_tokens_to_ids(candidate)
            if cand_id != self.tokenizer.unk_token_id:
                prob = probs[cand_id].item()
                results.append((candidate, prob))
        
        results.sort(key=lambda x: x[1], reverse=True)
        return results
    
    def correct_low_confidence_chars(self, text: str, 
                                       confidence_scores: List[float],
                                       threshold: float = 0.7) -> List[BertCorrection]:
        corrections = []
        
        for i, (char, conf) in enumerate(zip(text, confidence_scores)):
            if conf < threshold and i < len(text):
                context_before, context_after = self._get_context(text, i)
                
                if self.use_mock:
                    predicted_char, predicted_conf = self._mock_bert_inference(
                        char, context_before, context_after
                    )
                else:
                    candidates = [char]
                    if char in self.variant_dict:
                        std, _ = self.variant_dict[char]
                        candidates.append(std)
                    
                    bert_results = self._real_bert_inference(text, i, candidates)
                    if bert_results:
                        predicted_char, predicted_conf = bert_results[0]
                    else:
                        predicted_char, predicted_conf = char, conf
                
                if predicted_char != char and predicted_conf >= threshold:
                    corrections.append(BertCorrection(
                        position=i,
                        original_char=char,
                        predicted_char=predicted_char,
                        confidence=predicted_conf,
                        context_before=context_before,
                        context_after=context_after,
                        source="bert_context"
                    ))
        
        return corrections
    
    def enhance_correction(self, text: str, confidence_scores: Optional[List[float]] = None,
                           threshold: float = 0.7) -> Tuple[str, List[BertCorrection]]:
        if confidence_scores is None:
            confidence_scores = [0.9] * len(text)
        
        while len(confidence_scores) < len(text):
            confidence_scores.append(0.9)
        
        corrections = self.correct_low_confidence_chars(text, confidence_scores, threshold)
        
        chars = list(text)
        for corr in corrections:
            if 0 <= corr.position < len(chars):
                chars[corr.position] = corr.predicted_char
        
        return ''.join(chars), corrections


try:
    bert_corrector = BertAncientTextCorrector(use_mock=True)
except Exception as e:
    logger.warning(f"Failed to initialize BERT corrector: {e}")
    bert_corrector = None


def enhance_with_bert(text: str, confidence_scores: Optional[List[float]] = None,
                      threshold: float = 0.7) -> Tuple[str, List[BertCorrection]]:
    if bert_corrector is None:
        return text, []
    return bert_corrector.enhance_correction(text, confidence_scores, threshold)
