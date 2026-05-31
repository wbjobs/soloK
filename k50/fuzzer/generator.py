import random
import string
import re
from typing import Any, Dict, List, Optional
from fuzzer.models import (
    ApiEndpoint, ApiParameter, ParamLocation,
    TestCase, VulnType, FuzzConfig,
)
from fuzzer.payloads import (
    SQL_INJECTION_PAYLOADS, XSS_PAYLOADS,
    IDOR_PAYLOADS, PARAM_POLLUTION_PAYLOADS, get_payloads_for_type,
)


class TestDataGenerator:
    def __init__(self, config: FuzzConfig):
        self.config = config

    def _random_string(self, length: int = 8) -> str:
        return "".join(random.choices(string.ascii_letters + string.digits, k=length))

    def _generate_value_for_type(self, param_type: str, param: ApiParameter) -> Any:
        if param.enum_values:
            return random.choice(param.enum_values)

        if param.default is not None:
            return param.default

        if param_type == "string":
            fmt = getattr(param, "format", None)
            if fmt == "email" or (param.name and "email" in param.name.lower()):
                return f"test_{self._random_string(4)}@example.com"
            if fmt == "uri" or fmt == "url":
                return "https://example.com"
            if fmt == "date":
                return "2024-01-15"
            if fmt == "date-time":
                return "2024-01-15T10:30:00Z"
            if fmt == "uuid":
                return "550e8400-e29b-41d4-a716-446655440000"
            if fmt == "password":
                return "TestP@ss123"
            length = param.min_length or 8
            if param.max_length and length > param.max_length:
                length = param.max_length
            return self._random_string(length)

        elif param_type == "integer":
            min_val = int(param.min_value) if param.min_value is not None else 1
            max_val = int(param.max_value) if param.max_value is not None else 1000
            if min_val > max_val:
                max_val = min_val + 100
            return random.randint(min_val, max_val)

        elif param_type == "number":
            min_val = param.min_value if param.min_value is not None else 0.1
            max_val = param.max_value if param.max_value is not None else 999.99
            return round(random.uniform(min_val, max_val), 2)

        elif param_type == "boolean":
            return random.choice([True, False])

        elif param_type == "array":
            items = param.items or {}
            item_type = items.get("type", "string")
            item_param = ApiParameter(name="item", location=ParamLocation.BODY, param_type=item_type)
            return [self._generate_value_for_type(item_type, item_param) for _ in range(2)]

        elif param_type == "object":
            return self._generate_object_from_properties(param.properties)

        return self._random_string()

    def _generate_object_from_properties(self, properties: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not properties:
            return {"key": "value"}
        obj = {}
        for prop_name, prop_schema in properties.items():
            prop_type = prop_schema.get("type", "string")
            if "$ref" in prop_schema:
                prop_type = "string"
            prop_param = ApiParameter(
                name=prop_name,
                location=ParamLocation.BODY,
                param_type=prop_type,
                required=prop_schema.get("required", False),
                enum_values=prop_schema.get("enum"),
                min_value=prop_schema.get("minimum"),
                max_value=prop_schema.get("maximum"),
                min_length=prop_schema.get("minLength"),
                max_length=prop_schema.get("maxLength"),
                default=prop_schema.get("default"),
                properties=prop_schema.get("properties"),
                items=prop_schema.get("items"),
            )
            obj[prop_name] = self._generate_value_for_type(prop_type, prop_param)
        return obj

    def generate_baseline_params(self, endpoint: ApiEndpoint) -> Dict[str, Any]:
        params: Dict[str, Any] = {}

        for param in endpoint.parameters:
            if param.required or random.random() < 0.7:
                params[param.name] = self._generate_value_for_type(param.param_type, param)

        if endpoint.request_body_schema:
            body_type = endpoint.request_body_schema.get("type", "object")
            if body_type == "object":
                params["_body"] = self._generate_object_from_properties(
                    endpoint.request_body_schema.get("properties")
                )
            elif body_type == "array":
                items = endpoint.request_body_schema.get("items", {})
                item_type = items.get("type", "string")
                item_param = ApiParameter(name="item", location=ParamLocation.BODY, param_type=item_type)
                params["_body"] = [self._generate_value_for_type(item_type, item_param) for _ in range(2)]
            else:
                params["_body"] = self._generate_value_for_type(body_type, ApiParameter(
                    name="body", location=ParamLocation.BODY, param_type=body_type
                ))

        return params

    def _is_likely_id_param(self, param: ApiParameter) -> bool:
        name_lower = param.name.lower()
        id_patterns = ["id", "_id", "uid", "uuid", "userid", "user_id", "accountid"]
        return any(p in name_lower for p in id_patterns) and param.param_type in ("string", "integer")

    def generate_sql_injection_cases(self, endpoint: ApiEndpoint, baseline: Dict[str, Any]) -> List[TestCase]:
        cases = []
        string_params = [
            p for p in endpoint.parameters
            if p.param_type == "string" and p.location in (ParamLocation.QUERY, ParamLocation.PATH, ParamLocation.BODY)
        ]

        if endpoint.request_body_schema:
            props = endpoint.request_body_schema.get("properties", {})
            for prop_name, prop_schema in props.items():
                if prop_schema.get("type") == "string":
                    string_params.append(ApiParameter(
                        name=prop_name, location=ParamLocation.BODY, param_type="string"
                    ))

        for param in string_params:
            for payload in SQL_INJECTION_PAYLOADS[:5]:
                modified = dict(baseline)
                modified[param.name] = payload
                cases.append(TestCase(
                    endpoint=endpoint,
                    vuln_type=VulnType.SQL_INJECTION,
                    test_name=f"sql_injection_{param.name}",
                    modified_params=modified,
                    description=f"SQL injection test on parameter '{param.name}' with payload: {payload}",
                    payload=payload,
                ))

        return cases

    def generate_xss_cases(self, endpoint: ApiEndpoint, baseline: Dict[str, Any]) -> List[TestCase]:
        cases = []
        string_params = [
            p for p in endpoint.parameters
            if p.param_type == "string" and p.location in (ParamLocation.QUERY, ParamLocation.PATH, ParamLocation.BODY)
        ]

        if endpoint.request_body_schema:
            props = endpoint.request_body_schema.get("properties", {})
            for prop_name, prop_schema in props.items():
                if prop_schema.get("type") == "string":
                    string_params.append(ApiParameter(
                        name=prop_name, location=ParamLocation.BODY, param_type="string"
                    ))

        for param in string_params:
            for payload in XSS_PAYLOADS[:5]:
                modified = dict(baseline)
                modified[param.name] = payload
                cases.append(TestCase(
                    endpoint=endpoint,
                    vuln_type=VulnType.XSS,
                    test_name=f"xss_{param.name}",
                    modified_params=modified,
                    description=f"XSS test on parameter '{param.name}' with payload: {payload[:50]}",
                    payload=payload,
                ))

        return cases

    def generate_idor_cases(self, endpoint: ApiEndpoint, baseline: Dict[str, Any]) -> List[TestCase]:
        cases = []
        id_params = [p for p in endpoint.parameters if self._is_likely_id_param(p)]

        for param in id_params:
            for strategy in IDOR_PAYLOADS["numeric_id"]:
                modified = dict(baseline)
                current_val = baseline.get(param.name, 1)
                try:
                    current = int(current_val)
                except (ValueError, TypeError):
                    current = 1

                if strategy["action"] == "increment":
                    new_val = current + strategy["offset"]
                elif strategy["action"] == "decrement":
                    new_val = max(0, current - strategy["offset"])
                elif strategy["action"] == "set_zero":
                    new_val = 0
                elif strategy["action"] == "set_negative":
                    new_val = -1
                elif strategy["action"] == "set_large":
                    new_val = strategy["value"]
                else:
                    continue

                modified[param.name] = new_val
                cases.append(TestCase(
                    endpoint=endpoint,
                    vuln_type=VulnType.IDOR,
                    test_name=f"idor_{param.name}_{strategy['action']}",
                    modified_params=modified,
                    description=f"IDOR test on '{param.name}': {strategy['action']} (value: {new_val})",
                    payload=str(new_val),
                ))

        return cases

    def generate_param_pollution_cases(self, endpoint: ApiEndpoint, baseline: Dict[str, Any]) -> List[TestCase]:
        cases = []

        all_params = list(endpoint.parameters)
        if endpoint.request_body_schema:
            props = endpoint.request_body_schema.get("properties", {})
            for prop_name, prop_schema in props.items():
                all_params.append(ApiParameter(
                    name=prop_name, location=ParamLocation.BODY, param_type=prop_schema.get("type", "string")
                ))

        oversized = PARAM_POLLUTION_PAYLOADS["oversized"]
        modified = dict(baseline)
        target = all_params[0] if all_params else None
        if target:
            modified[target.name] = oversized
            cases.append(TestCase(
                endpoint=endpoint,
                vuln_type=VulnType.PARAM_POLLUTION,
                test_name=f"param_pollution_oversized_{target.name}",
                modified_params=modified,
                description=f"Oversized value ({len(oversized)} chars) for '{target.name}'",
                payload=f"[oversized: {len(oversized)} chars]",
            ))

        null_byte = PARAM_POLLUTION_PAYLOADS["null_byte"]
        for param in all_params[:3]:
            if param.param_type == "string":
                modified = dict(baseline)
                modified[param.name] = null_byte
                cases.append(TestCase(
                    endpoint=endpoint,
                    vuln_type=VulnType.PARAM_POLLUTION,
                    test_name=f"param_pollution_nullbyte_{param.name}",
                    modified_params=modified,
                    description=f"Null byte injection in '{param.name}'",
                    payload=null_byte,
                ))

        for special in PARAM_POLLUTION_PAYLOADS["special_chars"][:3]:
            target = all_params[0] if all_params else None
            if target:
                modified = dict(baseline)
                modified[target.name] = special
                cases.append(TestCase(
                    endpoint=endpoint,
                    vuln_type=VulnType.PARAM_POLLUTION,
                    test_name=f"param_pollution_special_{target.name}",
                    modified_params=modified,
                    description=f"Special characters in '{target.name}': {special[:30]}",
                    payload=special,
                ))

        return cases

    def generate_test_cases(self, endpoint: ApiEndpoint) -> List[TestCase]:
        baseline = self.generate_baseline_params(endpoint)
        cases = []

        if VulnType.SQL_INJECTION in self.config.vuln_types:
            cases.extend(self.generate_sql_injection_cases(endpoint, baseline))

        if VulnType.XSS in self.config.vuln_types:
            cases.extend(self.generate_xss_cases(endpoint, baseline))

        if VulnType.IDOR in self.config.vuln_types:
            cases.extend(self.generate_idor_cases(endpoint, baseline))

        if VulnType.PARAM_POLLUTION in self.config.vuln_types:
            cases.extend(self.generate_param_pollution_cases(endpoint, baseline))

        if self.config.max_cases_per_endpoint and len(cases) > self.config.max_cases_per_endpoint:
            cases = cases[:self.config.max_cases_per_endpoint]

        return cases
