from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
import json
import numpy as np

from utils.audio_utils import load_audio, compute_spectrogram
from utils.report_generator import PDFReportGenerator

router = APIRouter()

report_generator = PDFReportGenerator()
UPLOAD_DIR = Path("uploads")
REPORT_DIR = Path("reports")

@router.post("/generate")
async def generate_report(
    file_id: str = Query(..., description="音频文件ID"),
    result_json: str = Query(..., description="检测结果JSON字符串")
):
    try:
        wav_path = list(UPLOAD_DIR.glob(f"{file_id}.*"))
        if not wav_path:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        file_path = str(wav_path[0])
        
        audio, sr, duration = load_audio(file_path, target_sr=16000, max_duration=60)
        mag_db, phase, D = compute_spectrogram(audio, sr)
        
        result = json.loads(result_json)
        
        overall_score = result['overall_result']['fake_probability'] / 100
        model_scores = {k: v/100 for k, v in result['model_scores'].items()}
        confidence = result['overall_result']['confidence'] / 100
        suspicious_segments = result['localization']['suspicious_segments']
        engine_result = result['traceability']['tts_engine']
        recompression_result = result['traceability']['recompression']
        
        report_path = report_generator.generate_report(
            filename=f"report_{file_id}",
            audio=audio,
            sr=sr,
            mag_db=mag_db,
            hop_length=256,
            overall_score=overall_score,
            model_scores=model_scores,
            confidence=confidence,
            suspicious_segments=suspicious_segments,
            engine_result=engine_result,
            recompression_result=recompression_result
        )
        
        return {
            'status': 'success',
            'report_id': file_id,
            'report_path': report_path
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"报告生成失败: {str(e)}")

@router.get("/download/{report_id}")
async def download_report(report_id: str):
    try:
        report_path = REPORT_DIR / f"report_{report_id}.pdf"
        
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="报告不存在")
        
        return FileResponse(
            path=str(report_path),
            filename=f"forgery_detection_report_{report_id}.pdf",
            media_type="application/pdf"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")
