from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from typing import List
import uuid
from datetime import datetime

from .database import get_db
from .models import CorrectionHistory, BatchTask, VariantMapping
from .schemas import (
    CorrectRequest, CorrectResponse, ChangeItem,
    BatchCorrectRequest, BatchCorrectResponse,
    HistoryResponse, BatchHistoryResponse,
    AddVariantRequest, AddVariantResponse,
    CollationRequest, CollationResponse, EditionDifference,
    MultiCollationRequest, MultiCollationResponse,
    CorrectWithConfidenceRequest, CorrectWithConfidenceResponse,
    BertCorrectionItem
)
from .corrector import correct_text, add_variant_mapping, corrector
from .celery_tasks import batch_correct_task, clean_text
from .collation import collate_two_editions, collate_multiple_editions
from .bert_corrector import enhance_with_bert, bert_corrector

router = APIRouter(prefix="", tags=["矫正服务"])


@router.post("/correct", response_model=CorrectResponse, summary="单篇文本矫正")
async def correct_single_text(
    request: CorrectRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    task_id = str(uuid.uuid4())
    ip_address = req.client.host if req.client else "127.0.0.1"
    
    cleaned_text = clean_text(request.text)
    result = correct_text(cleaned_text, request.book_id)
    
    changes = [{"position": c.position, "from": c.from_char, "to": c.to_char} 
               for c in result.changes]
    
    try:
        history = CorrectionHistory(
            task_id=task_id,
            book_id=request.book_id,
            original_text=clean_text(request.text),
            corrected_text=clean_text(result.corrected_text),
            changes=changes,
            ip_address=ip_address
        )
        db.add(history)
        db.commit()
    except Exception as e:
        db.rollback()
    
    return CorrectResponse(
        corrected_text=result.corrected_text,
        changes=[ChangeItem(**c) for c in changes],
        task_id=task_id
    )


@router.post("/batch_correct", response_model=BatchCorrectResponse, summary="批量文本矫正")
async def correct_batch_text(
    request: BatchCorrectRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    ip_address = req.client.host if req.client else "127.0.0.1"
    
    articles_data = [{"text": a.text, "book_id": a.book_id} for a in request.articles]
    
    task = batch_correct_task.delay(articles_data, ip_address)
    
    batch_task = BatchTask(
        task_id=task.id,
        status="pending",
        total_count=len(request.articles),
        ip_address=ip_address
    )
    db.add(batch_task)
    db.commit()
    
    return BatchCorrectResponse(
        task_id=task.id,
        status="pending",
        message=f"批量矫正任务已提交，共{len(request.articles)}篇文章"
    )


@router.get("/history/{task_id}", response_model=HistoryResponse, summary="查询矫正历史")
async def get_history(task_id: str, db: Session = Depends(get_db)):
    history = db.query(CorrectionHistory).filter(
        CorrectionHistory.task_id == task_id
    ).first()
    
    if not history:
        raise HTTPException(status_code=404, detail="未找到该任务记录")
    
    return HistoryResponse(
        task_id=history.task_id,
        book_id=history.book_id,
        original_text=history.original_text,
        corrected_text=history.corrected_text,
        changes=[ChangeItem(**c) for c in history.changes] if history.changes else [],
        created_at=history.created_at
    )


@router.get("/batch_history/{task_id}", response_model=BatchHistoryResponse, summary="查询批量矫正历史")
async def get_batch_history(task_id: str, db: Session = Depends(get_db)):
    batch_task = db.query(BatchTask).filter(
        BatchTask.task_id == task_id
    ).first()
    
    if not batch_task:
        raise HTTPException(status_code=404, detail="未找到该批量任务记录")
    
    return BatchHistoryResponse(
        task_id=batch_task.task_id,
        status=batch_task.status,
        total_count=batch_task.total_count,
        success_count=batch_task.success_count,
        failed_count=batch_task.failed_count,
        results=batch_task.results,
        error_message=batch_task.error_message,
        created_at=batch_task.created_at,
        completed_at=batch_task.completed_at
    )


@router.post("/add_variant", response_model=AddVariantResponse, summary="添加异体字映射")
async def add_variant(
    request: AddVariantRequest,
    db: Session = Depends(get_db)
):
    existing = db.query(VariantMapping).filter(
        VariantMapping.variant == request.variant
    ).first()
    
    if existing:
        existing.standard = request.standard
        existing.variant_type = request.variant_type
        existing.source = request.source or "用户提交"
        db.commit()
    else:
        new_mapping = VariantMapping(
            variant=request.variant,
            standard=request.standard,
            variant_type=request.variant_type,
            source=request.source or "用户提交"
        )
        db.add(new_mapping)
        db.commit()
    
    success = add_variant_mapping(request.variant, request.standard, request.variant_type)
    
    return AddVariantResponse(
        success=success,
        message="异体字映射已添加/更新" if success else "添加失败",
        variant=request.variant,
        standard=request.standard
    )


@router.get("/stats", summary="获取系统统计信息")
async def get_stats(db: Session = Depends(get_db)):
    variant_count = corrector.get_variant_count()
    history_count = db.query(CorrectionHistory).count()
    batch_count = db.query(BatchTask).count()
    
    return {
        "variant_mappings": variant_count,
        "total_corrections": history_count,
        "total_batch_tasks": batch_count,
        "bert_available": bert_corrector is not None
    }


@router.post("/collate", response_model=CollationResponse, summary="两版本刻本校勘比对")
async def collate_editions(
    request: CollationRequest,
    req: Request
):
    text_a = clean_text(request.edition_a.text)
    text_b = clean_text(request.edition_b.text)
    
    result = collate_two_editions(
        book_name=request.book_name,
        edition_a_name=request.edition_a.edition_name,
        edition_b_name=request.edition_b.edition_name,
        text_a=text_a,
        text_b=text_b
    )
    
    return CollationResponse(
        book_name=result.book_name,
        edition_a=result.edition_a,
        edition_b=result.edition_b,
        total_characters=result.total_characters,
        differing_positions=result.differing_positions,
        variant_relations=result.variant_relations,
        differences=[
            EditionDifference(
                position=d.position,
                char_a=d.char_a,
                char_b=d.char_b,
                difference_type=d.difference_type,
                is_variant_relation=d.is_variant_relation,
                standard_char=d.standard_char,
                note=d.note
            )
            for d in result.differences
        ],
        summary=result.summary
    )


@router.post("/multi_collate", response_model=MultiCollationResponse, summary="多版本刻本校勘比对")
async def multi_collate_editions(
    request: MultiCollationRequest,
    req: Request
):
    editions = [(e.edition_name, clean_text(e.text)) for e in request.editions]
    
    result = collate_multiple_editions(
        book_name=request.book_name,
        editions=editions
    )
    
    return result


@router.post("/correct_with_bert", response_model=CorrectWithConfidenceResponse, 
             summary="带BERT增强的文本矫正")
async def correct_with_bert_enhancement(
    request: CorrectWithConfidenceRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    task_id = str(uuid.uuid4())
    ip_address = req.client.host if req.client else "127.0.0.1"
    
    cleaned_text = clean_text(request.text)
    
    base_result = correct_text(cleaned_text, request.book_id)
    
    used_bert = False
    bert_enhancements = []
    
    if bert_corrector is not None and request.confidence_scores:
        conf_scores = request.confidence_scores
        threshold = request.confidence_threshold or 0.7
        
        enhanced_text, enhancements = enhance_with_bert(
            base_result.corrected_text,
            conf_scores,
            threshold
        )
        
        if enhancements:
            used_bert = True
            bert_enhancements = enhancements
            
            base_changes = {c.position: c for c in base_result.changes}
            
            for enh in enhancements:
                if enh.position in base_changes:
                    base_changes[enh.position].to_char = enh.predicted_char
                else:
                    from .corrector import ChangeItem as ChangeItemInternal
                    base_changes[enh.position] = ChangeItemInternal(
                        position=enh.position,
                        from_char=enh.original_char,
                        to_char=enh.predicted_char
                    )
            
            base_result.changes = list(base_changes.values())
            base_result.corrected_text = enhanced_text
    
    changes = [{"position": c.position, "from": c.from_char, "to": c.to_char} 
               for c in base_result.changes]
    
    try:
        history = CorrectionHistory(
            task_id=task_id,
            book_id=request.book_id,
            original_text=clean_text(request.text),
            corrected_text=clean_text(base_result.corrected_text),
            changes=changes,
            ip_address=ip_address
        )
        db.add(history)
        db.commit()
    except Exception as e:
        db.rollback()
    
    return CorrectWithConfidenceResponse(
        corrected_text=base_result.corrected_text,
        changes=[ChangeItem(**c) for c in changes],
        bert_enhancements=[
            BertCorrectionItem(
                position=e.position,
                original_char=e.original_char,
                predicted_char=e.predicted_char,
                confidence=e.confidence,
                context_before=e.context_before,
                context_after=e.context_after,
                source=e.source
            )
            for e in bert_enhancements
        ],
        task_id=task_id,
        used_bert_enhancement=used_bert
    )


@router.get("/bert_status", summary="获取BERT模型状态")
async def get_bert_status():
    return {
        "available": bert_corrector is not None,
        "use_mock": bert_corrector.use_mock if bert_corrector else False,
        "confidence_threshold": bert_corrector.confidence_threshold if bert_corrector else 0.7
    }
