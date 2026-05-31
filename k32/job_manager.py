import os
import json
import threading
import time
from typing import List, Dict, Optional, Callable
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed

from config import UPLOAD_DIR, RESULT_DIR, JOB_EXPIRY_HOURS, NUM_WORKERS
from utils import generate_job_id, get_current_time
from database import (
    create_job,
    update_job_status,
    get_job,
    get_search_results,
    delete_job,
)
from spectrum_parser import parse_spectrum_file, filter_spectra_by_quality
from search_engine import perform_search
from output_formatter import save_results_to_file
from ptm_handler import ptm_handler


class JobManager:
    def __init__(self):
        self._jobs: Dict[str, threading.Thread] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=min(4, NUM_WORKERS))

    def create_search_job(
        self,
        file_path: str,
        fasta_db_id: int,
        params: dict,
        mod_ids: List[str] = None,
    ) -> str:
        job_id = generate_job_id()

        create_job(
            job_id=job_id,
            parameters=json.dumps(params),
            input_file=file_path,
            fasta_db=str(fasta_db_id),
        )

        future = self._executor.submit(
            self._run_search_job,
            job_id,
            file_path,
            fasta_db_id,
            params,
            mod_ids,
        )

        with self._lock:
            self._jobs[job_id] = future

        return job_id

    def _run_search_job(
        self,
        job_id: str,
        file_path: str,
        fasta_db_id: int,
        params: dict,
        mod_ids: List[str],
    ):
        try:
            update_job_status(job_id, "running", progress=5, message="Parsing spectrum file...")

            if not os.path.exists(file_path):
                update_job_status(job_id, "failed", message=f"File not found: {file_path}")
                return

            spectra = parse_spectrum_file(file_path)

            if not spectra:
                update_job_status(job_id, "failed", message="No spectra found in file")
                return

            update_job_status(job_id, "running", progress=20,
                               message=f"Parsed {len(spectra)} spectra")

            filtered_spectra = filter_spectra_by_quality(spectra)

            update_job_status(job_id, "running", progress=30,
                               message=f"Filtered to {len(filtered_spectra)} spectra")

            if not filtered_spectra:
                update_job_status(job_id, "completed", progress=100,
                                   result_count=0, message="No spectra passed quality filtering")
                return

            update_job_status(job_id, "running", progress=40,
                               message="Starting database search...")

            search_results = perform_search(
                spectra=filtered_spectra,
                fasta_id=fasta_db_id,
                params=params,
                mod_ids=mod_ids,
                job_id=job_id,
            )

            update_job_status(job_id, "running", progress=90,
                               message=f"Found {search_results['total_count']} matches")

            passed = search_results.get("filtered_results", [])
            output_format = params.get("output_format", "tsv")

            if passed:
                output_file = save_results_to_file(passed, job_id, output_format)
                update_job_status(
                    job_id, "completed",
                    progress=100,
                    result_count=len(passed),
                    message=f"Search complete: {len(passed)} peptides identified (FDR<{params.get('fdr_threshold', 0.01)*100:.0f}%)",
                )
            else:
                update_job_status(
                    job_id, "completed",
                    progress=100,
                    result_count=0,
                    message="Search complete: No peptides passed FDR threshold",
                )

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            update_job_status(
                job_id, "failed",
                message=f"Error: {str(e)}",
            )
            print(f"Job {job_id} failed: {error_detail}")

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        job_info = get_job(job_id)
        if not job_info:
            return None

        result_summary = {}
        if job_info.get("result_summary"):
            try:
                result_summary = json.loads(job_info["result_summary"])
            except json.JSONDecodeError:
                pass

        results = []
        if job_info["status"] == "completed":
            results = get_search_results(job_id, passed_fdr_only=True)

        return {
            "job_id": job_info["job_id"],
            "status": job_info["status"],
            "progress": job_info["progress"],
            "message": job_info["message"],
            "created_at": job_info["created_at"],
            "started_at": job_info["started_at"],
            "completed_at": job_info["completed_at"],
            "result_count": job_info["result_count"],
            "results": results,
            "result_summary": result_summary,
        }

    def get_job_results(self, job_id: str, passed_fdr_only: bool = True) -> List[Dict]:
        return get_search_results(job_id, passed_fdr_only=passed_fdr_only)

    def cancel_job(self, job_id: str) -> bool:
        with self._lock:
            if job_id in self._jobs:
                future = self._jobs[job_id]
                if not future.done():
                    future.cancel()
                del self._jobs[job_id]

        job_info = get_job(job_id)
        if job_info and job_info["status"] in ("pending", "running"):
            update_job_status(job_id, "cancelled", message="Job cancelled by user")
            return True
        return False

    def delete_job(self, job_id: str) -> bool:
        self.cancel_job(job_id)
        delete_job(job_id)

        result_file_tsv = os.path.join(RESULT_DIR, f"{job_id}_results.tsv")
        result_file_xml = os.path.join(RESULT_DIR, f"{job_id}_results.xml")
        for f in [result_file_tsv, result_file_xml]:
            if os.path.exists(f):
                os.remove(f)

        return True

    def cleanup_expired_jobs(self):
        current_time = get_current_time()
        expiry_seconds = JOB_EXPIRY_HOURS * 3600

        from database import get_all_jobs
        jobs = get_all_jobs()

        for job in jobs:
            if job["created_at"] and (current_time - job["created_at"]) > expiry_seconds:
                if job["status"] in ("completed", "failed", "cancelled"):
                    self.delete_job(job["job_id"])

    def get_active_jobs_count(self) -> int:
        with self._lock:
            return len(self._jobs)


job_manager = JobManager()


def cleanup_thread():
    while True:
        try:
            job_manager.cleanup_expired_jobs()
        except Exception:
            pass
        time.sleep(3600)


def start_cleanup_thread():
    thread = threading.Thread(target=cleanup_thread, daemon=True)
    thread.start()
