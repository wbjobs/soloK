import shlex
from typing import Any, Dict, List, Optional
from fuzzer.models import (
    ApiEndpoint, FuzzConfig, ParamLocation, RequestResult,
    TestCase, VulnerabilityFinding,
)


class CurlGenerator:
    def __init__(self, config: FuzzConfig):
        self.config = config

    def _shell_escape(self, value: str) -> str:
        if not value:
            return "''"
        needs_quote = any(c in value for c in ' \t\n\'"\\$`!#&|;(){}[]<>?*~')
        if needs_quote:
            return "'" + value.replace("'", "'\\''") + "'"
        return value

    def generate(
        self,
        endpoint: ApiEndpoint,
        test_case: TestCase,
        url: str,
        response_status: int = 0,
        minimal_payload: Optional[str] = None,
    ) -> str:
        parts = [f"curl -X {endpoint.method}"]

        parts.append(self._shell_escape(url))

        headers = self.config.get_merged_headers()

        for param in endpoint.parameters:
            if param.name not in test_case.modified_params:
                continue
            value = test_case.modified_params[param.name]
            if param.location == ParamLocation.HEADER:
                headers[param.name] = str(value)

        if response_status and response_status != 200:
            parts.append(f"-o /dev/null -w '%{{http_code}}'")

        for key, val in headers.items():
            parts.insert(-1 if not response_status or response_status == 200 else -2,
                         f"-H {self._shell_escape(f'{key}: {val}')}")

        if "_body" in test_case.modified_params and endpoint.request_body_schema:
            body = test_case.modified_params["_body"]
            import json
            try:
                body_str = json.dumps(body, ensure_ascii=False)
            except (TypeError, ValueError):
                body_str = str(body)

            if minimal_payload:
                for param in endpoint.parameters:
                    if param.location == ParamLocation.BODY:
                        continue
                body_str = body_str.replace(
                    self._shell_escape(test_case.payload or "").strip("'"),
                    self._shell_escape(minimal_payload).strip("'"),
                )

            idx = -1 if not response_status or response_status == 200 else -2
            parts.insert(idx, f"-H {self._shell_escape('Content-Type: application/json')}")
            parts.insert(idx + 1, f"-d {self._shell_escape(body_str)}")

        if self.config.timeout:
            parts.append(f"--max-time {self.config.timeout}")

        parts.append("-s")

        return " \\\n  ".join(parts)

    def generate_from_result(
        self,
        result: RequestResult,
        minimal_payload: Optional[str] = None,
    ) -> str:
        return self.generate(
            endpoint=result.test_case.endpoint,
            test_case=result.test_case,
            url=result.url,
            response_status=result.status_code,
            minimal_payload=minimal_payload,
        )
