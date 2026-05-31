from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime


class ChangeItem(BaseModel):
    position: int
    from_char: str = Field(..., alias="from")
    to_char: str = Field(..., alias="to")

    class Config:
        populate_by_name = True


class CorrectRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="OCR原始文本")
    book_id: str = Field(..., min_length=1, max_length=100, description="书籍ID")


class CorrectResponse(BaseModel):
    corrected_text: str
    changes: List[ChangeItem]
    task_id: str


class BatchCorrectRequest(BaseModel):
    articles: List[CorrectRequest] = Field(..., description="文章列表，最多100篇")

    @field_validator("articles")
    def check_articles_limit(cls, v):
        if len(v) > 100:
            raise ValueError("最多支持100篇文章")
        if len(v) == 0:
            raise ValueError("至少提交1篇文章")
        return v


class BatchCorrectResponse(BaseModel):
    task_id: str
    status: str
    message: str


class HistoryResponse(BaseModel):
    task_id: str
    book_id: str
    original_text: str
    corrected_text: str
    changes: List[ChangeItem]
    created_at: datetime


class BatchHistoryResponse(BaseModel):
    task_id: str
    status: str
    total_count: int
    success_count: int
    failed_count: int
    results: Optional[List[Dict[str, Any]]] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class AddVariantRequest(BaseModel):
    variant: str = Field(..., min_length=1, max_length=10, description="异体字")
    standard: str = Field(..., min_length=1, max_length=10, description="标准繁体字")
    variant_type: str = Field(..., description="异体字类型：康熙字典体/俗体/简笔变体/其他")
    source: Optional[str] = Field("用户提交", description="来源")

    @field_validator("variant_type")
    def check_variant_type(cls, v):
        valid_types = ["康熙字典体", "俗体", "简笔变体", "其他"]
        if v not in valid_types:
            raise ValueError(f"异体字类型必须是: {', '.join(valid_types)}")
        return v


class AddVariantResponse(BaseModel):
    success: bool
    message: str
    variant: str
    standard: str


class ErrorResponse(BaseModel):
    detail: str


class EditionInput(BaseModel):
    edition_name: str = Field(..., min_length=1, max_length=50, description="刻本名称")
    text: str = Field(..., min_length=1, max_length=50000, description="刻本文本")


class CollationRequest(BaseModel):
    book_name: str = Field(..., min_length=1, max_length=100, description="古籍名称")
    edition_a: EditionInput = Field(..., description="版本A")
    edition_b: EditionInput = Field(..., description="版本B")


class EditionDifference(BaseModel):
    position: int
    char_a: str
    char_b: str
    difference_type: str
    is_variant_relation: bool
    standard_char: Optional[str]
    note: str


class CollationResponse(BaseModel):
    book_name: str
    edition_a: str
    edition_b: str
    total_characters: int
    differing_positions: int
    variant_relations: int
    differences: List[EditionDifference]
    summary: Dict[str, int]


class MultiCollationRequest(BaseModel):
    book_name: str = Field(..., min_length=1, max_length=100, description="古籍名称")
    editions: List[EditionInput] = Field(..., min_length=2, max_length=10, description="多个刻本版本")


class MultiCollationResponse(BaseModel):
    book_name: str
    base_edition: str
    total_comparisons: int
    comparisons: List[Dict[str, Any]]


class CorrectWithConfidenceRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="OCR原始文本")
    book_id: str = Field(..., min_length=1, max_length=100, description="书籍ID")
    confidence_scores: Optional[List[float]] = Field(None, description="每个字符的OCR置信度，0-1之间")
    confidence_threshold: Optional[float] = Field(0.7, ge=0.0, le=1.0, description="BERT增强阈值")


class BertCorrectionItem(BaseModel):
    position: int
    original_char: str
    predicted_char: str
    confidence: float
    context_before: str
    context_after: str
    source: str


class CorrectWithConfidenceResponse(BaseModel):
    corrected_text: str
    changes: List[ChangeItem]
    bert_enhancements: List[BertCorrectionItem]
    task_id: str
    used_bert_enhancement: bool
