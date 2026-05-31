from typing import List, Dict, Any
from .celery_app import celery
from .corrector import correct_text
from .database import SessionLocal
from .models import BatchTask, CorrectionHistory
import json
from datetime import datetime
import re


def clean_text(text: str) -> str:
    if not text:
        return text
    
    cleaned = text
    
    cleaned = re.sub(r'[\x00-\x1F\x7F]', '', cleaned)
    
    try:
        cleaned = cleaned.encode('utf-8', errors='replace').decode('utf-8')
    except:
        pass
    
    return cleaned


def safe_serialize(obj: Any) -> Any:
    if isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, (list, tuple)):
        return [safe_serialize(item) for item in obj]
    elif isinstance(obj, dict):
        return {str(k): safe_serialize(v) for k, v in obj.items()}
    else:
        return str(obj)


@celery.task(bind=True, name="batch_correct_task", max_retries=0)
def batch_correct_task(self, articles: List[Dict[str, str]], ip_address: str = None):
    task_id = self.request.id
    
    db = SessionLocal()
    try:
        batch_task = BatchTask(
            task_id=task_id,
            status="processing",
            total_count=len(articles),
            ip_address=ip_address
        )
        db.add(batch_task)
        db.commit()
        
        results = []
        success_count = 0
        failed_count = 0
        
        for i, article in enumerate(articles):
            try:
                original_text = article.get("text", "")
                book_id = article.get("book_id", "")
                
                cleaned_text = clean_text(original_text)
                
                correction_result = correct_text(cleaned_text, book_id)
                
                changes = [{"position": c.position, "from": c.from_char, "to": c.to_char} 
                           for c in correction_result.changes]
                
                try:
                    history = CorrectionHistory(
                        task_id=f"{task_id}_{i}",
                        book_id=book_id,
                        original_text=clean_text(original_text),
                        corrected_text=clean_text(correction_result.corrected_text),
                        changes=changes,
                        ip_address=ip_address
                    )
                    db.add(history)
                    db.commit()
                except Exception as db_error:
                    db.rollback()
                    pass
                
                results.append(safe_serialize({
                    "index": i,
                    "book_id": book_id,
                    "original_text": clean_text(original_text),
                    "corrected_text": clean_text(correction_result.corrected_text),
                    "changes": changes,
                    "status": "success"
                }))
                success_count += 1
                
            except Exception as e:
                results.append(safe_serialize({
                    "index": i,
                    "book_id": article.get("book_id", ""),
                    "original_text": clean_text(article.get("text", "")),
                    "error": str(e),
                    "status": "failed"
                }))
                failed_count += 1
            
            if (i + 1) % 10 == 0:
                try:
                    batch_task.success_count = success_count
                    batch_task.failed_count = failed_count
                    db.commit()
                except:
                    db.rollback()
        
        try:
            batch_task.status = "completed"
            batch_task.success_count = success_count
            batch_task.failed_count = failed_count
            batch_task.completed_at = datetime.now()
            try:
                batch_task.results = safe_serialize(results)
            except:
                batch_task.results = safe_serialize(results[:100])
            db.commit()
        except Exception as final_error:
            db.rollback()
            batch_task.status = "completed"
            batch_task.success_count = success_count
            batch_task.failed_count = failed_count
            batch_task.completed_at = datetime.now()
            batch_task.results = None
            batch_task.error_message = f"部分结果保存失败: {str(final_error)}"
            db.commit()
        
        return safe_serialize({
            "task_id": task_id,
            "status": "completed",
            "total_count": len(articles),
            "success_count": success_count,
            "failed_count": failed_count,
            "results": results
        })
        
    except Exception as e:
        try:
            batch_task.status = "failed"
            batch_task.error_message = str(e)
            batch_task.success_count = success_count if 'success_count' in locals() else 0
            batch_task.failed_count = failed_count if 'failed_count' in locals() else 0
            db.commit()
        except:
            db.rollback()
        
        return safe_serialize({
            "task_id": task_id,
            "status": "failed",
            "error": str(e),
            "partial_success": success_count if 'success_count' in locals() else 0,
            "partial_failed": failed_count if 'failed_count' in locals() else 0
        })
    finally:
        db.close()
