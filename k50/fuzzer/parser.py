import yaml
import json
import re
from typing import Any, Dict, List, Optional
from fuzzer.models import ApiEndpoint, ApiParameter, ParamLocation


class OpenApiParser:
    def __init__(self, spec_content: str, spec_format: str = "auto"):
        self.raw = spec_content
        self.spec: Dict[str, Any] = {}
        self.spec_version: str = ""
        self.schemas: Dict[str, Any] = {}
        self._load_spec(spec_format)

    def _load_spec(self, spec_format: str):
        content = self.raw.strip()
        if spec_format == "json" or (spec_format == "auto" and content.startswith("{")):
            self.spec = json.loads(content)
        else:
            self.spec = yaml.safe_load(content)

        if "openapi" in self.spec:
            self.spec_version = "3"
            self._load_openapi3_schemas()
        elif "swagger" in self.spec:
            self.spec_version = "2"
            self._load_swagger2_schemas()
        else:
            raise ValueError("Unsupported spec format: missing 'openapi' or 'swagger' field")

    def _load_openapi3_schemas(self):
        components = self.spec.get("components", {})
        self.schemas = components.get("schemas", {})

    def _load_swagger2_schemas(self):
        definitions = self.spec.get("definitions", {})
        self.schemas = definitions

    def get_base_url(self) -> str:
        if self.spec_version == "3":
            servers = self.spec.get("servers", [])
            if servers:
                return servers[0].get("url", "")
        else:
            host = self.spec.get("host", "")
            base_path = self.spec.get("basePath", "")
            schemes = self.spec.get("schemes", ["http"])
            if host:
                return f"{schemes[0]}://{host}{base_path}"
        return ""

    def resolve_ref(self, ref: str) -> Dict[str, Any]:
        parts = ref.lstrip("#/").split("/")
        obj = self.spec
        for part in parts:
            obj = obj.get(part, {})
        return obj

    def _resolve_schema(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        if "$ref" in schema:
            return self._resolve_schema(self.resolve_ref(schema["$ref"]))
        if "allOf" in schema:
            merged = {}
            for sub in schema["allOf"]:
                resolved = self._resolve_schema(sub)
                merged.update(resolved.get("properties", {}))
            return {"type": "object", "properties": merged}
        return schema

    def _parse_param_schema(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        resolved = self._resolve_schema(schema)
        result = {"type": resolved.get("type", "string")}

        for key in ["enum", "pattern", "minLength", "maxLength", "minimum", "maximum",
                     "default", "properties", "items", "format"]:
            if key in resolved:
                mapped = key
                if key == "minimum":
                    mapped = "min_value"
                elif key == "maximum":
                    mapped = "max_value"
                elif key == "minLength":
                    mapped = "min_length"
                elif key == "maxLength":
                    mapped = "max_length"
                result[mapped] = resolved[key]

        return result

    def _parse_parameter_v3(self, param: Dict[str, Any]) -> ApiParameter:
        schema_info = self._parse_param_schema(param.get("schema", {}))

        return ApiParameter(
            name=param.get("name", ""),
            location=ParamLocation(param.get("in", "query")),
            param_type=schema_info.get("type", "string"),
            required=param.get("required", False),
            enum_values=schema_info.get("enum"),
            pattern=schema_info.get("pattern"),
            min_value=schema_info.get("min_value"),
            max_value=schema_info.get("max_value"),
            min_length=schema_info.get("min_length"),
            max_length=schema_info.get("max_length"),
            default=schema_info.get("default"),
            properties=schema_info.get("properties"),
            items=schema_info.get("items"),
        )

    def _parse_parameter_v2(self, param: Dict[str, Any]) -> ApiParameter:
        schema_info = {}
        if "schema" in param:
            schema_info = self._parse_param_schema(param["schema"])
        else:
            schema_info = {
                "type": param.get("type", "string"),
                "enum": param.get("enum"),
                "pattern": param.get("pattern"),
                "min_value": param.get("minimum"),
                "max_value": param.get("maximum"),
                "min_length": param.get("minLength"),
                "max_length": param.get("maxLength"),
                "default": param.get("default"),
            }

        return ApiParameter(
            name=param.get("name", ""),
            location=ParamLocation(param.get("in", "query")),
            param_type=schema_info.get("type", "string"),
            required=param.get("required", False),
            enum_values=schema_info.get("enum"),
            pattern=schema_info.get("pattern"),
            min_value=schema_info.get("min_value"),
            max_value=schema_info.get("max_value"),
            min_length=schema_info.get("min_length"),
            max_length=schema_info.get("max_length"),
            default=schema_info.get("default"),
        )

    def _extract_path_params(self, path: str) -> List[ApiParameter]:
        params = []
        for match in re.findall(r"\{(\w+)\}", path):
            params.append(ApiParameter(
                name=match,
                location=ParamLocation.PATH,
                param_type="string",
                required=True,
            ))
        return params

    def _parse_request_body_v3(self, operation: Dict[str, Any]) -> tuple:
        body = operation.get("requestBody", {})
        if not body:
            return None, False, "application/json"

        required = body.get("required", False)
        content = body.get("content", {})
        content_type = "application/json"
        schema = None

        for ct, ct_info in content.items():
            content_type = ct
            raw_schema = ct_info.get("schema", {})
            schema = self._resolve_schema(raw_schema)
            break

        return schema, required, content_type

    def _parse_body_param_v2(self, operation: Dict[str, Any]) -> Optional[ApiParameter]:
        for param in operation.get("parameters", []):
            if param.get("in") == "body":
                schema = param.get("schema", {})
                resolved = self._resolve_schema(schema)
                return ApiParameter(
                    name="body",
                    location=ParamLocation.BODY,
                    param_type="object",
                    required=param.get("required", False),
                    properties=resolved.get("properties"),
                )
        return None

    def parse_endpoints(self) -> List[ApiEndpoint]:
        endpoints = []
        paths = self.spec.get("paths", {})

        for path, path_item in paths.items():
            path_params = []
            if "parameters" in path_item:
                for p in path_item["parameters"]:
                    if self.spec_version == "3":
                        path_params.append(self._parse_parameter_v3(p))
                    else:
                        path_params.append(self._parse_parameter_v2(p))

            for method in ["get", "post", "put", "patch", "delete", "options", "head"]:
                if method not in path_item:
                    continue

                operation = path_item[method]
                params = list(path_params)

                for p in operation.get("parameters", []):
                    if "$ref" in p:
                        p = self.resolve_ref(p["$ref"])
                    if self.spec_version == "3":
                        parsed = self._parse_parameter_v3(p)
                    else:
                        parsed = self._parse_parameter_v2(p)
                    existing = [pp for pp in params if pp.name == parsed.name and pp.location == parsed.location]
                    if not existing:
                        params.append(parsed)

                endpoint = ApiEndpoint(
                    path=path,
                    method=method.upper(),
                    summary=operation.get("summary", ""),
                    parameters=params,
                    responses=operation.get("responses", {}),
                    security=operation.get("security", []),
                )

                if self.spec_version == "3":
                    body_schema, body_req, ct = self._parse_request_body_v3(operation)
                    endpoint.request_body_schema = body_schema
                    endpoint.request_body_required = body_req
                    endpoint.content_type = ct
                else:
                    body_param = self._parse_body_param_v2(operation)
                    if body_param:
                        endpoint.request_body_schema = {
                            "type": "object",
                            "properties": body_param.properties or {},
                        }
                        endpoint.request_body_required = body_param.required

                endpoints.append(endpoint)

        return endpoints
