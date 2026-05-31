from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class ParamLocation(str, Enum):
    PATH = "path"
    QUERY = "query"
    HEADER = "header"
    COOKIE = "cookie"
    BODY = "body"


class VulnType(str, Enum):
    SQL_INJECTION = "sql_injection"
    XSS = "xss"
    IDOR = "idor"
    PARAM_POLLUTION = "param_pollution"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class ApiParameter:
    name: str
    location: ParamLocation
    param_type: str = "string"
    required: bool = False
    enum_values: Optional[List[str]] = None
    pattern: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    default: Optional[Any] = None
    schema_ref: Optional[str] = None
    properties: Optional[Dict[str, Any]] = None
    items: Optional[Dict[str, Any]] = None


@dataclass
class ApiEndpoint:
    path: str
    method: str
    summary: str = ""
    parameters: List[ApiParameter] = field(default_factory=list)
    request_body_schema: Optional[Dict[str, Any]] = None
    request_body_required: bool = False
    content_type: str = "application/json"
    responses: Dict[str, Any] = field(default_factory=dict)
    security: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class TestCase:
    endpoint: ApiEndpoint
    vuln_type: VulnType
    test_name: str
    modified_params: Dict[str, Any]
    description: str = ""
    payload: Optional[str] = None


@dataclass
class RequestResult:
    test_case: TestCase
    url: str
    method: str
    status_code: int
    response_headers: Dict[str, str] = field(default_factory=dict)
    response_body: str = ""
    response_time_ms: float = 0.0
    error: Optional[str] = None


@dataclass
class VulnerabilityFinding:
    vuln_type: VulnType
    severity: Severity
    endpoint: str
    method: str
    test_name: str
    description: str
    payload: str
    request_url: str
    response_status: int
    response_snippet: str
    evidence: str
    curl_command: str = ""
    minimal_payload: str = ""
    reduction_steps: int = 0


@dataclass
class ReductionResult:
    original_finding: VulnerabilityFinding
    minimal_payload: str = ""
    curl_command: str = ""
    reduction_steps: int = 0
    reduced: bool = False


@dataclass
class FuzzConfig:
    base_url: str
    concurrency: int = 5
    delay_ms: int = 100
    timeout: int = 30
    headers: Dict[str, str] = field(default_factory=dict)
    vuln_types: List[VulnType] = field(default_factory=lambda: list(VulnType))
    max_cases_per_endpoint: int = 50
    bearer_token: str = ""
    cookie: str = ""
    api_key_header: str = "X-API-Key"
    api_key_value: str = ""

    def get_merged_headers(self) -> Dict[str, str]:
        merged = dict(self.headers)
        if self.bearer_token:
            merged["Authorization"] = f"Bearer {self.bearer_token}"
        if self.cookie:
            merged["Cookie"] = self.cookie
        if self.api_key_value:
            merged[self.api_key_header] = self.api_key_value
        return merged


@dataclass
class FuzzReport:
    target_url: str
    spec_file: str
    total_endpoints: int = 0
    total_requests: int = 0
    total_findings: int = 0
    auth_failed_requests: int = 0
    auth_failed_rate: float = 0.0
    auth_warning: str = ""
    findings: List[VulnerabilityFinding] = field(default_factory=list)
    results: List[RequestResult] = field(default_factory=list)
    duration_seconds: float = 0.0
