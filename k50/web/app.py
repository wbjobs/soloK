import asyncio
import json
import uuid
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from fuzzer.models import FuzzConfig, VulnType, FuzzReport
from fuzzer.engine import FuzzEngine
from fuzzer.reporter import ReportGenerator

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="API Fuzz Engine", version="1.0.0")

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

active_engines: Dict[str, FuzzEngine] = {}
report_store: Dict[str, dict] = {}


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/parse-spec")
async def parse_spec(
    spec_file: UploadFile = File(None),
    spec_text: str = Form(""),
    spec_format: str = Form("auto"),
):
    content = ""
    if spec_file:
        raw = await spec_file.read()
        content = raw.decode("utf-8", errors="replace")
    elif spec_text.strip():
        content = spec_text.strip()
    else:
        raise HTTPException(400, "No spec content provided")

    try:
        from fuzzer.parser import OpenApiParser
        parser = OpenApiParser(content, spec_format)
        endpoints = parser.parse_endpoints()
        base_url = parser.get_base_url()

        result_endpoints = []
        for ep in endpoints:
            params = []
            for p in ep.parameters:
                params.append({
                    "name": p.name,
                    "in": p.location.value,
                    "type": p.param_type,
                    "required": p.required,
                    "enum": p.enum_values,
                })
            has_body = ep.request_body_schema is not None
            result_endpoints.append({
                "path": ep.path,
                "method": ep.method,
                "summary": ep.summary,
                "parameters": params,
                "has_body": has_body,
            })

        return JSONResponse({
            "success": True,
            "base_url": base_url,
            "endpoints": result_endpoints,
            "total_endpoints": len(result_endpoints),
        })
    except Exception as e:
        raise HTTPException(400, f"Failed to parse spec: {str(e)}")


@app.post("/api/start-fuzz")
async def start_fuzz(
    spec_file: UploadFile = File(None),
    spec_text: str = Form(""),
    base_url: str = Form(""),
    concurrency: int = Form(5),
    delay_ms: int = Form(100),
    timeout: int = Form(30),
    vuln_types: str = Form("sql_injection,xss,idor,param_pollution"),
    headers: str = Form("{}"),
    bearer_token: str = Form(""),
    cookie: str = Form(""),
    api_key_header: str = Form("X-API-Key"),
    api_key_value: str = Form(""),
    spec_format: str = Form("auto"),
):
    content = ""
    if spec_file:
        raw = await spec_file.read()
        content = raw.decode("utf-8", errors="replace")
    elif spec_text.strip():
        content = spec_text.strip()
    else:
        raise HTTPException(400, "No spec content provided")

    try:
        parsed_vuln_types = []
        for vt in vuln_types.split(","):
            vt = vt.strip()
            if vt:
                parsed_vuln_types.append(VulnType(vt))

        if not parsed_vuln_types:
            parsed_vuln_types = list(VulnType)

        parsed_headers = {}
        if headers.strip():
            parsed_headers = json.loads(headers)

        config = FuzzConfig(
            base_url=base_url.rstrip("/"),
            concurrency=max(1, min(concurrency, 20)),
            delay_ms=max(0, delay_ms),
            timeout=max(5, timeout),
            headers=parsed_headers,
            vuln_types=parsed_vuln_types,
            bearer_token=bearer_token.strip(),
            cookie=cookie.strip(),
            api_key_header=api_key_header.strip() or "X-API-Key",
            api_key_value=api_key_value.strip(),
        )

        task_id = str(uuid.uuid4())[:8]
        engine = FuzzEngine(config)
        engine.load_spec(content, spec_format)
        active_engines[task_id] = engine

        asyncio.create_task(_run_fuzz(task_id, engine))

        return JSONResponse({"success": True, "task_id": task_id})
    except Exception as e:
        raise HTTPException(400, f"Failed to start fuzz: {str(e)}")


async def _run_fuzz(task_id: str, engine: FuzzEngine):
    progress_data = {"message": "Starting...", "progress": 0.0}

    def on_progress(msg: str, pct: float):
        progress_data["message"] = msg
        progress_data["progress"] = pct

    engine.set_progress_callback(on_progress)

    report = await engine.run()
    reporter = ReportGenerator(report)
    report_store[task_id] = {
        "report": reporter.to_dict(),
        "html": reporter.to_html(),
        "json": reporter.to_json(),
        "progress": 1.0,
        "message": "Completed",
    }

    active_engines.pop(task_id, None)


@app.get("/api/fuzz-status/{task_id}")
async def fuzz_status(task_id: str):
    if task_id in report_store:
        data = report_store[task_id]
        return JSONResponse({
            "status": "completed",
            "progress": 1.0,
            "message": data["report"]["total_findings"],
            "report": data["report"],
        })

    engine = active_engines.get(task_id)
    if engine:
        total_cases = sum(
            len(engine.generator.generate_test_cases(ep)) for ep in engine.endpoints
        ) if engine.endpoints else 0
        done = len(engine.results)
        progress = done / max(total_cases, 1)
        return JSONResponse({
            "status": "running",
            "progress": round(progress, 3),
            "message": f"{done}/{total_cases} requests",
        })

    return JSONResponse({"status": "not_found", "progress": 0}, status_code=404)


@app.get("/api/fuzz-report/{task_id}")
async def fuzz_report(task_id: str, format: str = "json"):
    if task_id not in report_store:
        raise HTTPException(404, "Report not found")

    data = report_store[task_id]
    if format == "html":
        return HTMLResponse(data["html"])
    return JSONResponse(data["report"])


@app.post("/api/stop-fuzz/{task_id}")
async def stop_fuzz(task_id: str):
    engine = active_engines.get(task_id)
    if engine:
        engine.cancel()
        return JSONResponse({"success": True, "message": "Fuzz task cancelled"})
    return JSONResponse({"success": False, "message": "Task not found or already completed"})
