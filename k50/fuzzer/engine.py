import asyncio
import time
import re
from typing import Callable, List, Optional
from urllib.parse import urljoin

import aiohttp

from fuzzer.models import (
    ApiEndpoint, FuzzConfig, FuzzReport, ParamLocation,
    RequestResult, TestCase, VulnType, VulnerabilityFinding,
)
from fuzzer.parser import OpenApiParser
from fuzzer.generator import TestDataGenerator
from fuzzer.analyzer import ResponseAnalyzer
from fuzzer.reporter import ReportGenerator
from fuzzer.reducer import PayloadReducer
from fuzzer.curl import CurlGenerator


class FuzzEngine:
    def __init__(self, config: FuzzConfig):
        self.config = config
        self.parser: Optional[OpenApiParser] = None
        self.endpoints: List[ApiEndpoint] = []
        self.generator = TestDataGenerator(config)
        self.analyzer: Optional[ResponseAnalyzer] = None
        self.results: List[RequestResult] = []
        self.findings: List = []
        self._progress_callback: Optional[Callable] = None
        self._cancelled = False

    def set_progress_callback(self, callback: Callable):
        self._progress_callback = callback

    def _notify_progress(self, message: str, progress: float = 0.0):
        if self._progress_callback:
            self._progress_callback(message, progress)

    def load_spec(self, spec_content: str, spec_format: str = "auto"):
        self.parser = OpenApiParser(spec_content, spec_format)
        self.endpoints = self.parser.parse_endpoints()
        spec_base = self.parser.get_base_url()
        if spec_base and not self.config.base_url:
            self.config.base_url = spec_base.rstrip("/")

    def cancel(self):
        self._cancelled = True

    def _build_url(self, endpoint: ApiEndpoint, params: dict) -> str:
        path = endpoint.path
        path_params = {p.name: p for p in endpoint.parameters if p.location == ParamLocation.PATH}
        for param_name, param_obj in path_params.items():
            value = params.get(param_name, "1")
            path = path.replace(f"{{{param_name}}}", str(value))

        base = self.config.base_url.rstrip("/")
        url = base + path
        return url

    def _prepare_request(self, endpoint: ApiEndpoint, test_case: TestCase):
        url = self._build_url(endpoint, test_case.modified_params)
        params = test_case.modified_params

        query_params = {}
        headers = self.config.get_merged_headers()
        body = None

        for param in endpoint.parameters:
            if param.name not in params:
                continue
            if param.location == ParamLocation.QUERY:
                query_params[param.name] = str(params[param.name])
            elif param.location == ParamLocation.HEADER:
                headers[param.name] = str(params[param.name])
            elif param.location == ParamLocation.PATH:
                pass
            elif param.location == ParamLocation.COOKIE:
                headers["Cookie"] = headers.get("Cookie", "") + f"; {param.name}={params[param.name]}"
                if headers["Cookie"].startswith("; "):
                    headers["Cookie"] = headers["Cookie"][2:]

        if "_body" in params and endpoint.request_body_schema:
            body = params["_body"]

        return url, query_params, headers, body

    async def _send_request(self, session: aiohttp.ClientSession,
                            endpoint: ApiEndpoint, test_case: TestCase) -> RequestResult:
        url, query_params, headers, body = self._prepare_request(endpoint, test_case)
        method = endpoint.method

        try:
            start = time.time()
            kwargs = {
                "params": query_params if query_params else None,
                "headers": headers,
                "timeout": aiohttp.ClientTimeout(total=self.config.timeout),
                "allow_redirects": False,
                "ssl": False,
            }

            if body is not None and method in ("POST", "PUT", "PATCH"):
                if endpoint.content_type == "application/json":
                    kwargs["json"] = body
                else:
                    kwargs["data"] = body

            async with session.request(method, url, **kwargs) as resp:
                elapsed = (time.time() - start) * 1000
                try:
                    resp_text = await resp.text()
                except:
                    resp_text = ""

                resp_headers = dict(resp.headers)

                return RequestResult(
                    test_case=test_case,
                    url=url,
                    method=method,
                    status_code=resp.status,
                    response_headers=resp_headers,
                    response_body=resp_text,
                    response_time_ms=elapsed,
                )
        except asyncio.CancelledError:
            raise
        except Exception as e:
            return RequestResult(
                test_case=test_case,
                url=url,
                method=method,
                status_code=0,
                response_body="",
                response_time_ms=0,
                error=str(e),
            )

    async def _run_with_semaphore(self, session, semaphore, endpoint, test_case):
        async with semaphore:
            if self._cancelled:
                return None
            result = await self._send_request(session, endpoint, test_case)
            if self.config.delay_ms > 0:
                await asyncio.sleep(self.config.delay_ms / 1000.0)
            return result

    async def run(self) -> FuzzReport:
        self._cancelled = False
        start_time = time.time()
        self.results = []
        self.findings = []

        all_test_cases = []
        for endpoint in self.endpoints:
            cases = self.generator.generate_test_cases(endpoint)
            all_test_cases.extend(cases)

        total = len(all_test_cases)
        self._notify_progress(f"Generated {total} test cases for {len(self.endpoints)} endpoints", 0.0)

        if total == 0:
            return FuzzReport(
                target_url=self.config.base_url,
                spec_file="",
                total_endpoints=len(self.endpoints),
                total_requests=0,
                total_findings=0,
                duration_seconds=time.time() - start_time,
            )

        semaphore = asyncio.Semaphore(self.config.concurrency)
        connector = aiohttp.TCPConnector(limit=self.config.concurrency, ssl=False)

        async with aiohttp.ClientSession(connector=connector) as session:
            tasks = []
            for i, case in enumerate(all_test_cases):
                if self._cancelled:
                    break
                task = self._run_with_semaphore(session, semaphore, case.endpoint, case)
                tasks.append(task)

            completed = 0
            for coro in asyncio.as_completed(tasks):
                if self._cancelled:
                    break
                result = await coro
                if result is not None:
                    self.results.append(result)
                    completed += 1

                    progress = completed / total
                    self._notify_progress(
                        f"Testing: {completed}/{total} requests completed", progress
                    )

        self.analyzer = ResponseAnalyzer(self.results)
        for result in self.results:
            finding = self.analyzer.analyze(result)
            if finding:
                self.findings.append(finding)

        if self.findings and not self._cancelled:
            self._notify_progress(
                f"Analyzing: reducing {len(self.findings)} payloads...", 0.95
            )
            await self._reduce_findings()

        duration = time.time() - start_time

        auth_warning = ""
        auth_failed_rate = 0.0
        auth_failed_count = self.analyzer.auth_failed_count
        total_count = self.analyzer.total_results

        if total_count > 0:
            auth_failed_rate = auth_failed_count / total_count

        if auth_failed_rate > 0.5:
            auth_warning = (
                f"⚠️  {auth_failed_count}/{total_count} ({auth_failed_rate:.0%}) "
                "请求认证失败，请检查是否正确配置了 Bearer Token、Cookie 或 API Key。"
            )

        report = FuzzReport(
            target_url=self.config.base_url,
            spec_file="",
            total_endpoints=len(self.endpoints),
            total_requests=len(self.results),
            total_findings=len(self.findings),
            auth_failed_requests=auth_failed_count,
            auth_failed_rate=auth_failed_rate,
            auth_warning=auth_warning,
            findings=self.findings,
            results=self.results,
            duration_seconds=duration,
        )

        self._notify_progress(f"Done: {len(self.findings)} findings in {duration:.1f}s", 1.0)
        return report

    async def _reduce_findings(self):
        reducer = PayloadReducer(self.config, self.results)

        def on_reduce_progress(msg, pct):
            self._notify_progress(msg, 0.95 + pct * 0.05)

        reduction_results = await reducer.reduce_all(
            self.findings, progress_callback=on_reduce_progress
        )

        for reduction in reduction_results:
            if reduction.reduced:
                idx = None
                for i, f in enumerate(self.findings):
                    if (f.test_name == reduction.original_finding.test_name
                            and f.endpoint == reduction.original_finding.endpoint
                            and f.method == reduction.original_finding.method):
                        idx = i
                        break
                if idx is not None:
                    self.findings[idx].minimal_payload = reduction.minimal_payload
                    self.findings[idx].curl_command = reduction.curl_command
                    self.findings[idx].reduction_steps = reduction.reduction_steps
