import os
import json
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

from config import UPLOAD_DIR, FASTA_DIR, FDR_THRESHOLD
from database import (
    init_db,
    get_job,
    get_search_results,
    get_fasta_db_by_name,
    get_all_fasta_dbs,
    get_all_jobs,
)
from models import (
    SearchRequest,
    SearchResponse,
    JobStatus,
    PeptideResult,
    FastaUploadRequest,
    FastaDatabaseInfo,
    Modification,
    DeNovoRequest,
    DeNovoResponse,
    DeNovoResult,
    DeNovoCandidate,
    SpectrumPredictionRequest,
    SpectrumPredictionResponse,
    SpectrumValidationRequest,
    SpectrumValidationResponse,
    IonAnnotation,
)
from fasta_db import (
    build_fasta_database,
    is_fasta_db_ready,
    save_fasta_file,
    parse_fasta,
)
from ptm_handler import ptm_handler
from job_manager import job_manager, start_cleanup_thread
from utils import get_current_time
from de_novo import de_novo_batch, DeNovoSequencer
from spectrum_predict import SpectrumPredictor, predict_spectrum, validate_identification
from spectrum_parser import parse_spectrum_file, filter_spectra_by_quality


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_cleanup_thread()
    yield


app = FastAPI(
    title="蛋白质质谱多肽鉴定API服务",
    description="基于FastAPI+NumPy+SQLite的蛋白质质谱多肽鉴定引擎，支持MGF/mzXML格式、FASTA数据库搜索、PTM鉴定、FDR过滤",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["info"])
async def root():
    return {
        "name": "蛋白质质谱多肽鉴定API服务",
        "version": "1.2.0",
        "endpoints": {
            "POST /search": "提交质谱文件进行多肽鉴定",
            "GET /job/{job_id}": "查询任务状态和结果",
            "GET /jobs": "查询所有任务列表",
            "POST /fasta/upload": "上传FASTA数据库文件",
            "POST /fasta/build": "构建FASTA数据库索引",
            "GET /fasta/databases": "查询可用FASTA数据库",
            "GET /modifications": "查询支持的修饰类型",
            "POST /modifications": "添加自定义修饰",
            "DELETE /job/{job_id}": "删除任务",
            "GET /result/{job_id}": "下载结果文件",
            "POST /denovo": "从头测序 - 上传MGF/mzXML文件",
            "POST /denovo/spectrum": "从头测序 - 直接输入谱图数据",
            "POST /predict/spectrum": "谱图预测 - 预测MS/MS谱图",
            "POST /validate/spectrum": "谱图验证 - 比对实验谱图与预测谱图",
            "POST /predict/batch": "批量预测MS/MS谱图",
        },
    }


@app.post("/search", response_model=SearchResponse, tags=["search"])
async def search_proteins(
    file: UploadFile = File(..., description="MGF或mzXML格式的质谱数据文件"),
    fasta_db: str = Form("default", description="FASTA数据库名称"),
    precursor_mz_tolerance_ppm: float = Form(5.0),
    fragment_mz_tolerance_da: float = Form(0.5),
    min_peptide_length: int = Form(6),
    max_peptide_length: int = Form(30),
    max_missed_cleavages: int = Form(2),
    fdr_threshold: float = Form(0.01),
    enzyme: str = Form("trypsin"),
    ion_types: str = Form("b,y"),
    max_charge: int = Form(2),
    modifications: str = Form("", description="修饰类型ID列表,逗号分隔"),
    output_format: str = Form("tsv", description="输出格式: tsv或xml"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供文件")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".mgf", ".mzxml"]:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}。支持: .mgf, .mzxml")

    file_path = os.path.join(UPLOAD_DIR, f"{get_current_time()}_{file.filename}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    fasta_info = get_fasta_db_by_name(fasta_db)
    if not fasta_info:
        raise HTTPException(status_code=400, detail=f"FASTA数据库 '{fasta_db}' 不存在")

    if fasta_info["peptide_count"] == 0:
        raise HTTPException(status_code=400, detail=f"FASTA数据库 '{fasta_db}' 尚未构建索引")

    params = {
        "fasta_db": fasta_db,
        "precursor_mz_tolerance_ppm": precursor_mz_tolerance_ppm,
        "fragment_mz_tolerance_da": fragment_mz_tolerance_da,
        "min_peptide_length": min_peptide_length,
        "max_peptide_length": max_peptide_length,
        "max_missed_cleavages": max_missed_cleavages,
        "fdr_threshold": fdr_threshold,
        "enzyme": enzyme,
        "ion_types": ion_types.split(","),
        "max_charge": max_charge,
        "output_format": output_format,
    }

    mod_ids = []
    if modifications:
        mod_ids = [m.strip() for m in modifications.split(",") if m.strip()]

    available_mods = ptm_handler.get_all_modifications()
    valid_mod_ids = []
    for mod_id in mod_ids:
        if mod_id in available_mods:
            valid_mod_ids.append(mod_id)

    job_id = job_manager.create_search_job(
        file_path=file_path,
        fasta_db_id=fasta_info["id"],
        params=params,
        mod_ids=valid_mod_ids,
    )

    return SearchResponse(
        job_id=job_id,
        status="submitted",
        message="任务已提交，请使用GET /job/{job_id}查询进度",
    )


@app.get("/job/{job_id}", response_model=JobStatus, tags=["jobs"])
async def get_job_status(job_id: str):
    job_info = job_manager.get_job_status(job_id)
    if not job_info:
        raise HTTPException(status_code=404, detail=f"任务 '{job_id}' 不存在")
    return JobStatus(**job_info)


@app.get("/jobs", tags=["jobs"])
async def list_jobs():
    jobs = get_all_jobs()
    return {"jobs": jobs}


@app.delete("/job/{job_id}", tags=["jobs"])
async def delete_job_endpoint(job_id: str):
    success = job_manager.delete_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"任务 '{job_id}' 不存在")
    return {"status": "success", "message": f"任务 '{job_id}' 已删除"}


@app.get("/result/{job_id}", tags=["results"])
async def download_result(job_id: str, format: str = Query("tsv", description="输出格式")):
    from config import RESULT_DIR

    if format.lower() == "xml":
        filepath = os.path.join(RESULT_DIR, f"{job_id}_results.xml")
    else:
        filepath = os.path.join(RESULT_DIR, f"{job_id}_results.tsv")

    if not os.path.exists(filepath):
        results = get_search_results(job_id, passed_fdr_only=True)
        if results:
            from output_formatter import save_results_to_file
            filepath = save_results_to_file(results, job_id, format)
        else:
            raise HTTPException(status_code=404, detail=f"任务 '{job_id}' 没有结果或尚未完成")

    return FileResponse(filepath, filename=os.path.basename(filepath))


@app.post("/fasta/upload", tags=["fasta"])
async def upload_fasta(
    file: UploadFile = File(..., description="FASTA格式的蛋白质序列文件"),
    name: str = Form(..., description="数据库名称"),
):
    if not file.filename or not file.filename.endswith(".fasta"):
        raise HTTPException(status_code=400, detail="请上传.fasta格式的文件")

    content = await file.read()
    file_path = save_fasta_file(name + ".fasta", content)

    try:
        proteins = parse_fasta(file_path)
        protein_count = len(proteins)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"FASTA文件解析失败: {e}")

    return {
        "status": "success",
        "name": name,
        "file_path": file_path,
        "protein_count": protein_count,
        "message": f"FASTA文件上传成功，包含 {protein_count} 个蛋白质，请使用 /fasta/build 构建索引",
    }


@app.post("/fasta/build", tags=["fasta"])
async def build_fasta(
    name: str = Form(..., description="数据库名称"),
    file_path: str = Form(..., description="FASTA文件路径"),
    enzyme: str = Form("trypsin", description="酶切酶"),
    include_reverse: bool = Form(True, description="是否包含反向数据库"),
):
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail=f"文件不存在: {file_path}")

    try:
        result = build_fasta_database(
            fasta_path=file_path,
            db_name=name,
            enzyme=enzyme,
            include_reverse=include_reverse,
        )
        return {
            "status": "success",
            "message": f"FASTA数据库 '{name}' 构建完成",
            "protein_count": result["protein_count"],
            "peptide_count": result["peptide_count"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库构建失败: {e}")


@app.get("/fasta/databases", response_model=List[FastaDatabaseInfo], tags=["fasta"])
async def list_fasta_databases():
    dbs = get_all_fasta_dbs()
    return [FastaDatabaseInfo(**db) for db in dbs]


@app.get("/modifications", tags=["modifications"])
async def list_modifications():
    return {"modifications": ptm_handler.to_list()}


@app.post("/modifications", tags=["modifications"])
async def add_modification(mod: Modification):
    mod_id = ptm_handler.add_modification(
        name=mod.name,
        mass_shift=mod.mass_shift,
        residues=mod.residues,
        mod_type=mod.type,
    )
    return {
        "status": "success",
        "mod_id": mod_id,
        "message": f"修饰 '{mod.name}' 已添加",
    }


@app.delete("/modifications/{mod_id}", tags=["modifications"])
async def remove_modification(mod_id: str):
    success = ptm_handler.remove_modification(mod_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"修饰 '{mod_id}' 不存在")
    return {"status": "success", "message": f"修饰 '{mod_id}' 已删除"}


@app.post("/denovo", response_model=DeNovoResponse, tags=["denovo"])
async def denovo_sequencing(
    file: UploadFile = File(..., description="MGF或mzXML格式的质谱数据文件"),
    fragment_tolerance_da: float = Form(0.02, description="碎片质量容差(Da)"),
    min_peptide_length: int = Form(4, description="最小肽段长度"),
    max_peptide_length: int = Form(30, description="最大肽段长度"),
    top_n: int = Form(3, description="每个谱图返回的候选序列数量"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供文件")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".mgf", ".mzxml"]:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}")

    file_path = os.path.join(UPLOAD_DIR, f"denovo_{get_current_time()}_{file.filename}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    try:
        spectra = parse_spectrum_file(file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"质谱文件解析失败: {e}")

    filtered_spectra = filter_spectra_by_quality(spectra)

    if not filtered_spectra:
        return DeNovoResponse(
            results={},
            total_spectra=len(spectra),
            processed_spectra=0,
        )

    sequencer = DeNovoSequencer(
        fragment_tolerance_da=fragment_tolerance_da,
        min_peptide_length=min_peptide_length,
        max_peptide_length=max_peptide_length,
        top_n=top_n,
    )

    results = {}
    for spec in filtered_spectra:
        candidates = sequencer.sequence(spec)
        results[spec.spectrum_id] = DeNovoResult(
            spectrum_id=spec.spectrum_id,
            precursor_mz=spec.precursor_mz,
            charge=spec.charge,
            candidates=[DeNovoCandidate(**c) for c in candidates],
        )

    return DeNovoResponse(
        results=results,
        total_spectra=len(spectra),
        processed_spectra=len(filtered_spectra),
    )


@app.post("/denovo/spectrum", response_model=DeNovoResult, tags=["denovo"])
async def denovo_single_spectrum(
    precursor_mz: float = Form(..., description="母离子m/z"),
    charge: int = Form(..., description="母离子电荷"),
    ms2_mz: str = Form(..., description="MS2 m/z值列表，逗号分隔"),
    ms2_intensity: str = Form(..., description="MS2强度列表，逗号分隔"),
    fragment_tolerance_da: float = Form(0.02, description="碎片质量容差(Da)"),
    min_peptide_length: int = Form(4, description="最小肽段长度"),
    max_peptide_length: int = Form(30, description="最大肽段长度"),
    top_n: int = Form(3, description="返回的候选序列数量"),
):
    from models import SpectrumInfo

    try:
        mz_list = [float(x.strip()) for x in ms2_mz.split(",") if x.strip()]
        int_list = [float(x.strip()) for x in ms2_intensity.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="m/z或强度值格式错误")

    if len(mz_list) != len(int_list):
        raise HTTPException(status_code=400, detail="m/z和强度列表长度不一致")

    spectrum = SpectrumInfo(
        spectrum_id="direct_input",
        precursor_mz=precursor_mz,
        charge=charge,
        ms2_mz=mz_list,
        ms2_intensity=int_list,
    )

    sequencer = DeNovoSequencer(
        fragment_tolerance_da=fragment_tolerance_da,
        min_peptide_length=min_peptide_length,
        max_peptide_length=max_peptide_length,
        top_n=top_n,
    )

    candidates = sequencer.sequence(spectrum)

    return DeNovoResult(
        spectrum_id="direct_input",
        precursor_mz=precursor_mz,
        charge=charge,
        candidates=[DeNovoCandidate(**c) for c in candidates],
    )


@app.post("/predict/spectrum", response_model=SpectrumPredictionResponse, tags=["prediction"])
async def predict_ms2_spectrum(request: SpectrumPredictionRequest):
    if not request.peptide_sequence or not request.peptide_sequence.isalpha():
        raise HTTPException(status_code=400, detail="无效的肽段序列")

    if request.precursor_charge < 1 or request.precursor_charge > 6:
        raise HTTPException(status_code=400, detail="电荷状态应在1-6之间")

    if request.collision_energy < 5 or request.collision_energy > 50:
        raise HTTPException(status_code=400, detail="碰撞能量应在5-50%之间")

    predictor = SpectrumPredictor()
    result = predictor.predict(
        peptide_sequence=request.peptide_sequence,
        precursor_charge=request.precursor_charge,
        collision_energy=request.collision_energy,
        ion_types=request.ion_types,
        modifications=request.modifications,
    )

    annotations = [
        IonAnnotation(**ann) for ann in result["ion_annotations"]
    ]

    return SpectrumPredictionResponse(
        peptide_sequence=result["peptide_sequence"],
        precursor_charge=result["precursor_charge"],
        precursor_mz=result["precursor_mz"],
        precursor_mass=result["precursor_mass"],
        collision_energy=result["collision_energy"],
        mz=result["mz"],
        intensity=result["intensity"],
        ion_annotations=annotations,
        num_peaks=result["num_peaks"],
    )


@app.post("/validate/spectrum", response_model=SpectrumValidationResponse, tags=["prediction"])
async def validate_spectrum_match(request: SpectrumValidationRequest):
    if not request.peptide_sequence or not request.peptide_sequence.isalpha():
        raise HTTPException(status_code=400, detail="无效的肽段序列")

    if len(request.experimental_mz) != len(request.experimental_intensity):
        raise HTTPException(status_code=400, detail="m/z和强度列表长度不一致")

    predictor = SpectrumPredictor()
    predicted = predictor.predict(
        peptide_sequence=request.peptide_sequence,
        precursor_charge=request.precursor_charge,
        collision_energy=request.collision_energy,
    )

    comparison = predictor.compare_spectra(
        predicted,
        request.experimental_mz,
        request.experimental_intensity,
    )

    annotations = [
        IonAnnotation(**ann) for ann in predicted["ion_annotations"]
    ]

    predicted_resp = SpectrumPredictionResponse(
        peptide_sequence=predicted["peptide_sequence"],
        precursor_charge=predicted["precursor_charge"],
        precursor_mz=predicted["precursor_mz"],
        precursor_mass=predicted["precursor_mass"],
        collision_energy=predicted["collision_energy"],
        mz=predicted["mz"],
        intensity=predicted["intensity"],
        ion_annotations=annotations,
        num_peaks=predicted["num_peaks"],
    )

    return SpectrumValidationResponse(
        dot_product=comparison["dot_product"],
        matched_peaks=comparison["matched_peaks"],
        predicted_peaks=comparison["predicted_peaks"],
        coverage=comparison["coverage"],
        is_valid=comparison["dot_product"] >= request.threshold,
        threshold=request.threshold,
        predicted_spectrum=predicted_resp,
    )


@app.post("/predict/batch", tags=["prediction"])
async def predict_batch_spectra(
    peptides: str = Form(..., description="肽段序列列表，逗号分隔"),
    charges: str = Form(..., description="电荷状态列表，逗号分隔"),
    collision_energies: Optional[str] = Form(None, description="碰撞能量列表，逗号分隔"),
):
    peptide_list = [p.strip() for p in peptides.split(",") if p.strip()]
    charge_list = [int(c.strip()) for c in charges.split(",") if c.strip()]

    if len(peptide_list) != len(charge_list):
        raise HTTPException(status_code=400, detail="肽段和电荷列表长度不一致")

    if collision_energies:
        ce_list = [float(ce.strip()) for ce in collision_energies.split(",") if ce.strip()]
        if len(ce_list) != len(peptide_list):
            ce_list = [27.0] * len(peptide_list)
    else:
        ce_list = [27.0] * len(peptide_list)

    predictor = SpectrumPredictor()
    results = []

    for pep, charge, ce in zip(peptide_list, charge_list, ce_list):
        result = predictor.predict(pep, charge, ce)
        results.append(result)

    return {"results": results, "count": len(results)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=1)
