import os
import sys
import json
import time
import uuid
import base64
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from image_processor import image_processor
from ocr_engine import ocr_engine
from midi_generator import midi_generator
from vector_search import vector_search
from predictor import ngram_predictor

app = FastAPI(
    title="古琴减字谱识别与打谱编辑器 - Python 后端",
    description="提供古琴减字谱图像识别、打谱编辑、MIDI生成和向量检索服务",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

OUTPUT_DIR = Path("./output")
OUTPUT_DIR.mkdir(exist_ok=True)


class ImageUploadRequest(BaseModel):
    image: str


class ProcessRequest(BaseModel):
    image_id: Optional[str] = None
    preprocess: bool = True
    ocr: bool = True
    extract: bool = True


class RecognizeRequest(BaseModel):
    image: str


class GenerateMidiRequest(BaseModel):
    notation: Dict[str, Any]
    tempo: int = 60
    sound_type: str = "anxian"


class ExportPdfRequest(BaseModel):
    notation: Dict[str, Any]
    title: str = "古琴谱"
    composer: str = ""


class CompareRequest(BaseModel):
    piece_id: str
    versions: List[str] = []


class VectorSearchRequest(BaseModel):
    query: str
    top_k: int = 10
    filters: Optional[Dict[str, Any]] = None


class SaveNotationRequest(BaseModel):
    notation: Dict[str, Any]
    title: Optional[str] = None


class NoteItem(BaseModel):
    finger: str
    hui: int
    string: int


class PredictRequest(BaseModel):
    sequence: List[NoteItem]
    length: int = 6
    num_schemes: int = 3
    style: Optional[str] = None


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "services": {
            "image_processor": True,
            "ocr_engine": ocr_engine.model_loaded,
            "midi_generator": True,
            "vector_search": vector_search.index_built
        }
    }


@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        image_id = str(uuid.uuid4())[:8]
        ext = Path(file.filename).suffix or '.jpg'
        file_path = UPLOAD_DIR / f"{image_id}{ext}"

        contents = await file.read()
        file_path.write_bytes(contents)

        return {
            "success": True,
            "image_id": image_id,
            "file_path": str(file_path),
            "filename": file.filename,
            "size": len(contents)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload-base64")
async def upload_image_base64(request: ImageUploadRequest):
    try:
        image_data = request.image
        if image_data.startswith('data:'):
            image_data = image_data.split(',')[1]

        image_id = str(uuid.uuid4())[:8]
        img_bytes = base64.b64decode(image_data)

        file_path = UPLOAD_DIR / f"{image_id}.jpg"
        file_path.write_bytes(img_bytes)

        return {
            "success": True,
            "image_id": image_id,
            "file_path": str(file_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process")
async def process_image(request: ProcessRequest):
    try:
        start_time = time.time()

        image_id = request.image_id or str(uuid.uuid4())[:8]
        result = {
            "success": True,
            "image_id": image_id,
            "preprocessed": False,
            "ocr_result": None,
            "extracted": False
        }

        image_path = UPLOAD_DIR / f"{image_id}.jpg"
        if not image_path.exists():
            result["warning"] = "Image not found, processing skipped"
            return result

        img = image_processor.decode_image(image_path.read_bytes())

        if request.preprocess:
            preprocessed = image_processor.preprocess(img, {
                'binarization': True,
                'denoise': True,
                'row_segmentation': True,
                'character_localization': True
            })
            result["preprocessed"] = True
            result["preprocess_data"] = {
                "rows": [
                    {k: v for k, v in row.items() if k != 'image'}
                    for row in preprocessed.get('rows', [])
                ],
                "characters": [
                    {k: v for k, v in char.items() if k != 'image'}
                    for char in preprocessed.get('characters', [])
                ]
            }

        if request.ocr:
            ocr_result = ocr_engine.recognize(img, preprocessed if request.preprocess else None)
            result["ocr_result"] = ocr_result

        if request.extract and request.ocr:
            result["extracted"] = True
            result["extracted_notes"] = ocr_result.get("extracted_notes", [])

        result["processing_time"] = round(time.time() - start_time, 2)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recognize")
async def recognize_notation(request: RecognizeRequest):
    try:
        start_time = time.time()

        img = image_processor.decode_image(request.image)

        preprocessed = image_processor.preprocess(img, {
            'binarization': True,
            'denoise': True,
            'row_segmentation': True,
            'character_localization': True
        })

        ocr_result = ocr_engine.recognize(img, preprocessed)

        return {
            "success": True,
            "image_id": str(uuid.uuid4())[:8],
            "preprocessed": True,
            "rows": ocr_result.get("rows", []),
            "extracted_notes": ocr_result.get("extracted_notes", []),
            "confidence": ocr_result.get("confidence", 0),
            "processing_time": round(time.time() - start_time, 2)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-midi")
async def generate_midi(request: GenerateMidiRequest):
    try:
        midi_bytes = midi_generator.generate(request.notation, {
            'tempo': request.tempo,
            'sound_type': request.sound_type
        })

        midi_id = str(uuid.uuid4())[:8]
        midi_path = OUTPUT_DIR / f"guqin_{midi_id}.mid"
        midi_path.write_bytes(midi_bytes)

        return {
            "success": True,
            "file_path": str(midi_path),
            "file_name": midi_path.name,
            "file_size": len(midi_bytes),
            "tempo": request.tempo,
            "sound_type": request.sound_type
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/export-pdf")
async def export_pdf(request: ExportPdfRequest):
    try:
        pdf_id = str(uuid.uuid4())[:8]
        pdf_path = OUTPUT_DIR / f"guqin_score_{pdf_id}.txt"

        content = f"{request.title}\n"
        if request.composer:
            content += f"作曲: {request.composer}\n"
        content += "\n"

        notation = request.notation
        if 'rows' in notation:
            for row in notation['rows']:
                row_chars = ' '.join([c['char'] for c in row.get('characters', [])])
                content += f"第{row.get('row_index', 0) + 1}行: {row_chars}\n"

        if 'extracted_notes' in notation:
            content += "\n提取音符:\n"
            for note in notation['extracted_notes']:
                content += f"  {note.get('finger', '')} {note.get('hui', '')}徽{note.get('string', '')}弦 -> {note.get('pitch', '')}\n"

        pdf_path.write_text(content, encoding='utf-8')

        return {
            "success": True,
            "file_path": str(pdf_path),
            "file_name": pdf_path.name,
            "title": request.title
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compare")
async def compare_scores(request: CompareRequest):
    try:
        versions = request.versions if request.versions else ['v1', 'v2']

        comparison_data = {
            "piece_id": request.piece_id,
            "piece_name": "流水",
            "versions": []
        }

        for version_id in versions:
            version_name = {
                'v1': '神奇秘谱',
                'v2': '西麓堂琴统',
                'v3': '琴学入门',
                'v4': '梅庵琴谱'
            }.get(version_id, version_id)

            rows = []
            for i in range(6):
                hui = 7 if i < 3 else 5
                string = 2 if i < 3 else 4
                diff_types = ['same', 'modified', 'added', 'removed']
                diff = diff_types[i % len(diff_types)] if i > 1 else 'same'

                rows.append({
                    "row": i + 1,
                    "finger": ['挑', '勾', '抹', '剔', '托', '摘'][i],
                    "hui": hui,
                    "string": string,
                    "note": midi_generator.calculate_note(hui, string)['pitch'],
                    "duration": 1,
                    "diff": diff
                })

            comparison_data["versions"].append({
                "version_id": version_id,
                "version_name": version_name,
                "rows": rows
            })

        return comparison_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/learning/{piece_id}")
async def get_learning_material(piece_id: str, section: Optional[str] = None):
    try:
        sample_pieces = {
            'p1': {'name': '流水', 'sections': ['引子', '第一段', '第二段', '尾声']},
            'p2': {'name': '梅花三弄', 'sections': ['引子', '梅花一弄', '梅花二弄', '梅花三弄', '尾声']},
            'p3': {'name': '平沙落雁', 'sections': ['引子', '第一段', '第二段', '第三段', '尾声']}
        }

        piece_info = sample_pieces.get(piece_id, sample_pieces['p2'])
        section_name = section or piece_info['sections'][0]

        notes = []
        for i in range(8):
            finger = ['托', '勾', '抹', '挑', '托', '勾', '抹', '挑'][i]
            hui = [7, 6, 5, 7, 7, 6, 5, 9][i]
            string = [1, 2, 3, 2, 1, 2, 3, 1][i]
            note_info = midi_generator.calculate_note(hui, string)

            notes.append({
                "row": i,
                "finger": finger,
                "hui": hui,
                "string": string,
                "note": note_info['note'],
                "pitch": note_info['pitch'],
                "midi": note_info['midi'],
                "frequency": note_info['frequency'],
                "duration": 1
            })

        return {
            "piece_id": piece_id,
            "piece_name": piece_info['name'],
            "section": section_name,
            "tempo": 60,
            "notes": notes
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/vector-search")
async def vector_search_endpoint(request: VectorSearchRequest):
    try:
        results = vector_search.search(
            request.query,
            top_k=request.top_k,
            filters=request.filters
        )

        return {
            "success": True,
            "query": request.query,
            "total_results": len(results),
            "results": results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/techniques")
async def get_techniques():
    return ocr_engine.get_all_techniques()


@app.post("/save")
async def save_notation(request: SaveNotationRequest):
    try:
        save_id = str(uuid.uuid4())[:8]
        save_path = OUTPUT_DIR / f"notation_{save_id}.json"

        save_data = {
            "id": save_id,
            "title": request.title or "Untitled",
            "notation": request.notation,
            "saved_at": time.time()
        }

        save_path.write_text(json.dumps(save_data, ensure_ascii=False, indent=2), encoding='utf-8')

        return {
            "success": True,
            "id": save_id,
            "file_path": str(save_path)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/load/{notation_id}")
async def load_notation(notation_id: str):
    try:
        save_path = OUTPUT_DIR / f"notation_{notation_id}.json"
        if not save_path.exists():
            raise HTTPException(status_code=404, detail="Notation not found")

        data = json.loads(save_path.read_text(encoding='utf-8'))
        return data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/pieces")
async def get_pieces():
    return {
        "pieces": [
            {"id": "p1", "name": "流水", "composer": "佚名", "dynasty": "明代"},
            {"id": "p2", "name": "梅花三弄", "composer": "桓伊", "dynasty": "东晋"},
            {"id": "p3", "name": "广陵散", "composer": "嵇康", "dynasty": "三国"},
            {"id": "p4", "name": "平沙落雁", "composer": "佚名", "dynasty": "明代"}
        ]
    }


@app.post("/predict")
async def predict_sequence(request: PredictRequest):
    try:
        start_time = time.time()

        sequence = [{"finger": n.finger, "hui": n.hui, "string": n.string} for n in request.sequence]

        schemes = ngram_predictor.generate_schemes(
            seed=sequence,
            length=request.length,
            num_schemes=request.num_schemes
        )

        return {
            "success": True,
            "seed": sequence,
            "predicted_length": request.length,
            "schemes": schemes,
            "corpus_size": 200,
            "processing_time": round(time.time() - start_time, 2)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/corpus/stats")
async def get_corpus_stats():
    try:
        stats = {
            "total_pieces": 200,
            "styles": [
                {"id": "traditional", "name": "传统派", "count": 80},
                {"id": "modern", "name": "现代派", "count": 60},
                {"id": "meian", "name": "梅庵派", "count": 60}
            ],
            "total_notes": 15680,
            "unique_fingers": 8,
            "unique_huis": 13,
            "unique_strings": 7
        }
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PYTHON_PORT", 8000))
    print(f"Starting Guqin Notation Editor Backend on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
