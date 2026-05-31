import asyncio
import copy
import json
import time
from typing import Any, Callable, Dict, List, Optional

import aiohttp

from fuzzer.models import (
    ApiEndpoint, FuzzConfig, ParamLocation, ReductionResult,
    RequestResult, TestCase, VulnerabilityFinding, VulnType,
)
from fuzzer.analyzer import ResponseAnalyzer
from fuzzer.curl import CurlGenerator
from fuzzer.payloads import VULN_PATTERNS


class PayloadReducer:
    def __init__(self, config: FuzzConfig, results: List[RequestResult]):
        self.config = config
        self.results = results
        self.curl_gen = CurlGenerator(config)
        self._result_map: Dict[str, RequestResult] = {}
        for r in results:
            key = f"{r.test_case.test_name}:{r.url}"
            self._result_map[key] = r

    def _find_result_for_finding(self, finding: VulnerabilityFinding) -> Optional[RequestResult]:
        for r in self.results:
            if (r.test_case.test_name == finding.test_name
                    and r.test_case.endpoint.path == finding.endpoint
                    and r.test_case.endpoint.method == finding.method):
                return r
        return None

    def _build_modified_test_case(self, original: TestCase, new_payload: str,
                                   param_name: str) -> TestCase:
        modified_params = dict(original.modified_params)
        modified_params[param_name] = new_payload

        if "_body" in modified_params and isinstance(modified_params["_body"], dict):
            body = dict(modified_params["_body"])
            if param_name in body:
                body[param_name] = new_payload
                modified_params["_body"] = body

        return TestCase(
            endpoint=original.endpoint,
            vuln_type=original.vuln_type,
            test_name=original.test_name + "_reduced",
            modified_params=modified_params,
            description=f"Reduced: {original.description}",
            payload=new_payload,
        )

    async def _send_probe(self, session: aiohttp.ClientSession,
                           test_case: TestCase) -> RequestResult:
        endpoint = test_case.endpoint
        url_builder = self.config.base_url.rstrip("/") + endpoint.path

        for param in endpoint.parameters:
            if param.location == ParamLocation.PATH:
                val = test_case.modified_params.get(param.name, "1")
                url_builder = url_builder.replace(f"{{{param.name}}}", str(val))

        headers = self.config.get_merged_headers()
        query_params = {}
        body = None

        for param in endpoint.parameters:
            if param.name not in test_case.modified_params:
                continue
            val = test_case.modified_params[param.name]
            if param.location == ParamLocation.QUERY:
                query_params[param.name] = str(val)
            elif param.location == ParamLocation.HEADER:
                headers[param.name] = str(val)
            elif param.location == ParamLocation.COOKIE:
                headers["Cookie"] = headers.get("Cookie", "") + f"; {param.name}={val}"

        if "_body" in test_case.modified_params and endpoint.request_body_schema:
            body = test_case.modified_params["_body"]

        try:
            kwargs = {
                "params": query_params if query_params else None,
                "headers": headers,
                "timeout": aiohttp.ClientTimeout(total=self.config.timeout),
                "allow_redirects": False,
                "ssl": False,
            }
            if body is not None and endpoint.method in ("POST", "PUT", "PATCH"):
                if endpoint.content_type == "application/json":
                    kwargs["json"] = body
                else:
                    kwargs["data"] = body

            start = time.time()
            async with session.request(endpoint.method, url_builder, **kwargs) as resp:
                elapsed = (time.time() - start) * 1000
                try:
                    resp_text = await resp.text()
                except Exception:
                    resp_text = ""
                return RequestResult(
                    test_case=test_case,
                    url=url_builder,
                    method=endpoint.method,
                    status_code=resp.status,
                    response_headers=dict(resp.headers),
                    response_body=resp_text,
                    response_time_ms=elapsed,
                )
        except Exception as e:
            return RequestResult(
                test_case=test_case,
                url=url_builder,
                method=endpoint.method,
                status_code=0,
                error=str(e),
            )

    def _still_vulnerable(self, result: RequestResult, vuln_type: VulnType) -> bool:
        if result.error or result.status_code in (401, 403):
            return False

        body_lower = result.response_body.lower()

        if vuln_type == VulnType.SQL_INJECTION:
            patterns = VULN_PATTERNS[VulnType.SQL_INJECTION]["error_patterns"]
            matched = [p for p in patterns if p.lower() in body_lower]
            if matched:
                return True
            if result.status_code == 500:
                return True
            return False

        elif vuln_type == VulnType.XSS:
            payload = result.test_case.payload or ""
            if payload.lower() in body_lower:
                return True
            reflection_patterns = VULN_PATTERNS[VulnType.XSS]["reflection_patterns"]
            for rp in reflection_patterns:
                if rp.lower() in body_lower and rp.lower() in payload.lower():
                    return True
            return False

        elif vuln_type == VulnType.IDOR:
            return result.status_code == 200

        elif vuln_type == VulnType.PARAM_POLLUTION:
            error_patterns = VULN_PATTERNS[VulnType.PARAM_POLLUTION]["error_patterns"]
            matched = [p for p in error_patterns if p.lower() in body_lower]
            if matched:
                return True
            if result.status_code == 500:
                return True
            if result.response_time_ms > 5000:
                return True
            return False

        return False

    def _identify_payload_param(self, test_case: TestCase) -> Optional[str]:
        payload = test_case.payload or ""
        for param in test_case.endpoint.parameters:
            val = test_case.modified_params.get(param.name)
            if val is not None and str(val) == payload:
                return param.name

        if "_body" in test_case.modified_params:
            body = test_case.modified_params["_body"]
            if isinstance(body, dict):
                for key, val in body.items():
                    if str(val) == payload:
                        return key

        for param in test_case.endpoint.parameters:
            if param.param_type == "string":
                return param.name

        return None

    def _generate_shorter_variants(self, payload: str, vuln_type: VulnType) -> List[str]:
        variants = []

        if vuln_type == VulnType.SQL_INJECTION:
            core_patterns = [
                "' OR 1=1--", "' OR '1'='1", "\" OR \"\"=\"",
                "1 OR 1=1", "' OR 1=1#", "admin'--",
            ]
            for p in core_patterns:
                if len(p) < len(payload) and p not in payload[:3]:
                    variants.append(p)
                elif p in payload:
                    variants.append(p)

            if len(payload) > 4:
                mid = len(payload) // 2
                variants.append(payload[:mid])
                variants.append(payload[mid:])
                variants.append(payload[:len(payload)//3*2])

            chars_to_strip = [" ", "'", '"', ";", "-", "#", "/*"]
            for c in chars_to_strip:
                stripped = payload.strip(c)
                if stripped and stripped != payload:
                    variants.append(stripped)

        elif vuln_type == VulnType.XSS:
            mini_xss = [
                "<script>alert(1)</script>",
                "<img src=x onerror=alert(1)>",
                "<svg onload=alert(1)>",
                "\"><script>alert(1)</script>",
                "'-alert(1)-'",
                "javascript:alert(1)",
            ]
            for p in mini_xss:
                if len(p) < len(payload):
                    variants.append(p)

            if len(payload) > 10:
                variants.append(payload[:len(payload)//2])
                variants.append(payload[:len(payload)//3*2])

        elif vuln_type == VulnType.PARAM_POLLUTION:
            if len(payload) > 100:
                for size in [1000, 500, 200, 100, 50]:
                    if size < len(payload):
                        variants.append(payload[:size])

            if payload.startswith("A" * 10):
                for size in [5000, 1000, 500, 100, 50]:
                    variants.append("A" * size)

            special_variants = [
                "{{7*7}}", "${7*7}", "#{7*7}",
                "__proto__", "constructor",
            ]
            for sv in special_variants:
                if sv in payload:
                    variants.append(sv)

        elif vuln_type == VulnType.IDOR:
            variants.extend(["1", "0", "-1", "2", "999"])

        variants = [v for v in variants if v and len(v) < len(payload)]
        seen = set()
        unique = []
        for v in variants:
            if v not in seen:
                seen.add(v)
                unique.append(v)
        return unique

    async def reduce_finding(self, finding: VulnerabilityFinding,
                              session: aiohttp.ClientSession) -> ReductionResult:
        result = self._find_result_for_finding(finding)
        if not result:
            return ReductionResult(
                original_finding=finding,
                curl_command=self.curl_gen.generate_from_result(result) if result else "",
                reduced=False,
            )

        curl_original = self.curl_gen.generate_from_result(result)

        if not finding.payload:
            finding.curl_command = curl_original
            return ReductionResult(
                original_finding=finding,
                curl_command=curl_original,
                reduced=False,
            )

        param_name = self._identify_payload_param(result.test_case)
        if not param_name:
            finding.curl_command = curl_original
            return ReductionResult(
                original_finding=finding,
                curl_command=curl_original,
                reduced=False,
            )

        shorter_variants = self._generate_shorter_variants(
            finding.payload, finding.vuln_type
        )

        if not shorter_variants:
            finding.curl_command = curl_original
            finding.minimal_payload = finding.payload
            return ReductionResult(
                original_finding=finding,
                minimal_payload=finding.payload,
                curl_command=curl_original,
                reduction_steps=0,
                reduced=False,
            )

        best_payload = finding.payload
        best_result = result
        steps = 0

        for variant in shorter_variants:
            steps += 1
            probe_case = self._build_modified_test_case(
                result.test_case, variant, param_name
            )
            probe_result = await self._send_probe(session, probe_case)

            if self._still_vulnerable(probe_result, finding.vuln_type):
                best_payload = variant
                best_result = probe_result
                break

        minimal = best_payload
        for i in range(3):
            shorter = self._generate_shorter_variants(minimal, finding.vuln_type)
            shorter = [v for v in shorter if len(v) < len(minimal)]
            if not shorter:
                break

            found_shorter = False
            for variant in shorter:
                steps += 1
                probe_case = self._build_modified_test_case(
                    result.test_case, variant, param_name
                )
                probe_result = await self._send_probe(session, probe_case)

                if self._still_vulnerable(probe_result, finding.vuln_type):
                    minimal = variant
                    best_result = probe_result
                    found_shorter = True
                    break

            if not found_shorter:
                break

        reduced = minimal != finding.payload

        probe_case = self._build_modified_test_case(
            result.test_case, minimal, param_name
        )
        curl_minimal = self.curl_gen.generate_from_result(
            best_result, minimal_payload=minimal if reduced else None
        )

        finding.curl_command = curl_minimal
        finding.minimal_payload = minimal
        finding.reduction_steps = steps

        return ReductionResult(
            original_finding=finding,
            minimal_payload=minimal,
            curl_command=curl_minimal,
            reduction_steps=steps,
            reduced=reduced,
        )

    async def reduce_all(self, findings: List[VulnerabilityFinding],
                          progress_callback: Optional[Callable] = None) -> List[ReductionResult]:
        if not findings:
            return []

        connector = aiohttp.TCPConnector(limit=self.config.concurrency, ssl=False)
        results_list = []

        async with aiohttp.ClientSession(connector=connector) as session:
            for i, finding in enumerate(findings):
                reduction = await self.reduce_finding(finding, session)
                results_list.append(reduction)

                if progress_callback:
                    progress_callback(
                        f"缩减 payload: {i+1}/{len(findings)}",
                        (i + 1) / len(findings)
                    )

                if self.config.delay_ms > 0:
                    await asyncio.sleep(self.config.delay_ms / 1000.0)

        return results_list
