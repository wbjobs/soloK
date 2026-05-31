from fastapi import APIRouter, HTTPException, Query, File, UploadFile, Form
from pathlib import Path
import numpy as np

from utils.audio_utils import load_audio
from models.speaker_verifier import SpeakerVerifier

router = APIRouter()

speaker_verifier = SpeakerVerifier()
UPLOAD_DIR = Path("uploads")

@router.post("/register")
async def register_speaker(
    speaker_id: str = Form(...),
    file: UploadFile = File(...)
):
    try:
        file_id = speaker_id
        file_path = UPLOAD_DIR / f"{file_id}_register.wav"
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        audio, sr, duration = load_audio(str(file_path), target_sr=16000)
        
        if duration < 2:
            raise HTTPException(status_code=400, detail="注册音频至少需要2秒")
        
        result = speaker_verifier.register_speaker(speaker_id, audio, sr)
        
        return {
            'status': 'success',
            'speaker_id': result['speaker_id'],
            'num_enrollments': result['num_enrollments'],
            'duration': round(duration, 2)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"注册失败: {str(e)}")

@router.post("/verify")
async def verify_speaker(
    file_id: str = Query(..., description="待验证音频文件ID"),
    speaker_id: str = Query(None, description="指定验证的说话人ID，不指定则自动匹配")
):
    try:
        wav_path = list(UPLOAD_DIR.glob(f"{file_id}.*"))
        if not wav_path:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        file_path = str(wav_path[0])
        
        audio, sr, duration = load_audio(file_path, target_sr=16000)
        
        result = speaker_verifier.verify_speaker(audio, sr, speaker_id)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"验证失败: {str(e)}")

@router.get("/speakers")
async def get_registered_speakers():
    try:
        speakers = speaker_verifier.get_registered_speakers()
        return {
            'speakers': speakers,
            'count': len(speakers)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取列表失败: {str(e)}")

@router.delete("/speaker/{speaker_id}")
async def delete_speaker(speaker_id: str):
    try:
        result = speaker_verifier.delete_speaker(speaker_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")

@router.post("/anti-spoofing")
async def anti_spoofing_check(
    file_id: str = Query(..., description="音频文件ID"),
    fake_prob: float = Query(0.5, description="伪造概率")
):
    try:
        wav_path = list(UPLOAD_DIR.glob(f"{file_id}.*"))
        if not wav_path:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        file_path = str(wav_path[0])
        
        audio, sr, duration = load_audio(file_path, target_sr=16000)
        
        result = speaker_verifier.detect_spoofing(audio, sr, fake_prob)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"反欺骗检测失败: {str(e)}")
