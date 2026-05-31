from typing import List, Optional
from fuzzer.models import (
    RequestResult, VulnerabilityFinding, VulnType, Severity, TestCase,
)
from fuzzer.payloads import VULN_PATTERNS


class ResponseAnalyzer:
    def __init__(self, baseline_results: Optional[List[RequestResult]] = None):
        self.baseline_results = baseline_results or []
        self.baseline_status_map = {}
        self.auth_failed_count = 0
        self.total_results = 0
        for r in self.baseline_results:
            key = f"{r.test_case.endpoint.path}:{r.test_case.endpoint.method}"
            self.baseline_status_map[key] = r.status_code

    def _is_auth_failed(self, status_code: int) -> bool:
        return status_code in (401, 403)

    def _is_auth_issue(self, result: RequestResult) -> bool:
        key = f"{result.test_case.endpoint.path}:{result.test_case.endpoint.method}"
        baseline_status = self.baseline_status_map.get(key)
        if baseline_status and self._is_auth_failed(baseline_status):
            return True
        if self._is_auth_failed(result.status_code):
            return True
        return False

    def _get_severity(self, vuln_type: VulnType, evidence_strength: str) -> Severity:
        severity_map = {
            VulnType.SQL_INJECTION: {"strong": Severity.CRITICAL, "moderate": Severity.HIGH, "weak": Severity.MEDIUM},
            VulnType.XSS: {"strong": Severity.HIGH, "moderate": Severity.MEDIUM, "weak": Severity.LOW},
            VulnType.IDOR: {"strong": Severity.HIGH, "moderate": Severity.MEDIUM, "weak": Severity.LOW},
            VulnType.PARAM_POLLUTION: {"strong": Severity.MEDIUM, "moderate": Severity.LOW, "weak": Severity.INFO},
        }
        return severity_map.get(vuln_type, {}).get(evidence_strength, Severity.INFO)

    def _check_sql_injection(self, result: RequestResult) -> Optional[VulnerabilityFinding]:
        body_lower = result.response_body.lower()
        patterns = VULN_PATTERNS[VulnType.SQL_INJECTION]["error_patterns"]

        matched = []
        for pattern in patterns:
            if pattern.lower() in body_lower:
                matched.append(pattern)

        if not matched:
            if result.status_code == 500 and result.test_case.vuln_type == VulnType.SQL_INJECTION:
                return self._create_finding(result, "strong",
                    f"Server error (500) on SQL injection payload - likely SQL syntax disruption")
            return None

        strength = "strong" if len(matched) >= 2 else "moderate"
        evidence = f"SQL error patterns detected: {', '.join(matched[:3])}"
        return self._create_finding(result, strength, evidence)

    def _check_xss(self, result: RequestResult) -> Optional[VulnerabilityFinding]:
        payload = result.test_case.payload or ""
        body_lower = result.response_body.lower()
        payload_lower = payload.lower()

        reflected = False
        reflection_patterns = VULN_PATTERNS[VulnType.XSS]["reflection_patterns"]
        for rp in reflection_patterns:
            if rp.lower() in body_lower and rp.lower() in payload_lower:
                reflected = True
                break

        if not reflected:
            if payload_lower in body_lower:
                reflected = True

        if not reflected:
            return None

        content_type = result.response_headers.get("content-type", "")
        if "text/html" in content_type:
            strength = "strong"
        elif "json" in content_type:
            strength = "moderate"
        else:
            strength = "weak"

        snippet = result.response_body[:200]
        evidence = f"Payload reflected in response (context: {content_type or 'unknown'})"
        return self._create_finding(result, strength, evidence)

    def _check_idor(self, result: RequestResult) -> Optional[VulnerabilityFinding]:
        if result.status_code != 200:
            return None

        key = f"{result.test_case.endpoint.path}:{result.test_case.endpoint.method}"
        baseline_status = self.baseline_status_map.get(key)

        if baseline_status and baseline_status in (403, 404):
            strength = "strong"
            evidence = f"Status changed from {baseline_status} to 200 - possible unauthorized access"
        else:
            body_lower = result.response_body.lower()
            sensitive_fields = ["email", "password", "token", "secret", "ssn", "credit_card", "phone"]
            found_sensitive = [f for f in sensitive_fields if f in body_lower]
            if found_sensitive:
                strength = "moderate"
                evidence = f"Response contains sensitive fields: {', '.join(found_sensitive[:3])}"
            else:
                strength = "weak"
                evidence = "Successfully accessed resource with modified ID"

        return self._create_finding(result, strength, evidence)

    def _check_param_pollution(self, result: RequestResult) -> Optional[VulnerabilityFinding]:
        findings = []
        body_lower = result.response_body.lower()

        error_patterns = VULN_PATTERNS[VulnType.PARAM_POLLUTION]["error_patterns"]
        matched_errors = [p for p in error_patterns if p.lower() in body_lower]

        if matched_errors:
            strength = "strong" if len(matched_errors) >= 2 else "moderate"
            evidence = f"Error information leaked: {', '.join(matched_errors[:3])}"
            findings.append(self._create_finding(result, strength, evidence))

        if result.status_code == 500:
            findings.append(self._create_finding(result, "moderate",
                "Server error (500) on parameter pollution payload"))

        if result.response_time_ms > 5000:
            findings.append(self._create_finding(result, "weak",
                f"Abnormal response time: {result.response_time_ms:.0f}ms (possible DoS vector)"))

        return findings[0] if findings else None

    def _create_finding(self, result: RequestResult, evidence_strength: str,
                        evidence: str) -> VulnerabilityFinding:
        snippet = result.response_body[:500] if result.response_body else ""
        return VulnerabilityFinding(
            vuln_type=result.test_case.vuln_type,
            severity=self._get_severity(result.test_case.vuln_type, evidence_strength),
            endpoint=result.test_case.endpoint.path,
            method=result.test_case.endpoint.method,
            test_name=result.test_case.test_name,
            description=result.test_case.description,
            payload=result.test_case.payload or "",
            request_url=result.url,
            response_status=result.status_code,
            response_snippet=snippet,
            evidence=evidence,
        )

    def analyze(self, result: RequestResult) -> Optional[VulnerabilityFinding]:
        self.total_results += 1

        if result.error:
            return None

        if self._is_auth_failed(result.status_code):
            self.auth_failed_count += 1

        if self._is_auth_issue(result):
            if result.test_case.vuln_type != VulnType.IDOR:
                return None

        vuln_type = result.test_case.vuln_type

        if vuln_type == VulnType.SQL_INJECTION:
            if self._is_auth_failed(result.status_code):
                return None
            return self._check_sql_injection(result)
        elif vuln_type == VulnType.XSS:
            if self._is_auth_failed(result.status_code):
                return None
            return self._check_xss(result)
        elif vuln_type == VulnType.IDOR:
            return self._check_idor_auth_aware(result)
        elif vuln_type == VulnType.PARAM_POLLUTION:
            if self._is_auth_failed(result.status_code):
                return None
            return self._check_param_pollution(result)

        return None

    def _check_idor_auth_aware(self, result: RequestResult) -> Optional[VulnerabilityFinding]:
        if result.status_code != 200:
            return None

        key = f"{result.test_case.endpoint.path}:{result.test_case.endpoint.method}"
        baseline_status = self.baseline_status_map.get(key)

        if baseline_status and self._is_auth_failed(baseline_status):
            return None

        if baseline_status and baseline_status in (403, 404):
            strength = "strong"
            evidence = f"Status changed from {baseline_status} to 200 - possible unauthorized access"
        else:
            body_lower = result.response_body.lower()
            sensitive_fields = ["email", "password", "token", "secret", "ssn", "credit_card", "phone"]
            found_sensitive = [f for f in sensitive_fields if f in body_lower]
            if found_sensitive:
                strength = "moderate"
                evidence = f"Response contains sensitive fields: {', '.join(found_sensitive[:3])}"
            else:
                strength = "weak"
                evidence = "Successfully accessed resource with modified ID"

        return self._create_finding(result, strength, evidence)
