import json
import html
from datetime import datetime
from typing import List
from fuzzer.models import FuzzReport, VulnerabilityFinding, Severity, VulnType


class ReportGenerator:
    def __init__(self, report: FuzzReport):
        self.report = report

    def to_dict(self) -> dict:
        return {
            "target_url": self.report.target_url,
            "spec_file": self.report.spec_file,
            "total_endpoints": self.report.total_endpoints,
            "total_requests": self.report.total_requests,
            "total_findings": self.report.total_findings,
            "auth_failed_requests": self.report.auth_failed_requests,
            "auth_failed_rate": round(self.report.auth_failed_rate, 3),
            "auth_warning": self.report.auth_warning,
            "duration_seconds": round(self.report.duration_seconds, 2),
            "findings": [
                {
                    "vuln_type": f.vuln_type.value,
                    "severity": f.severity.value,
                    "endpoint": f.endpoint,
                    "method": f.method,
                    "test_name": f.test_name,
                    "description": f.description,
                    "payload": f.payload,
                    "minimal_payload": f.minimal_payload,
                    "curl_command": f.curl_command,
                    "reduction_steps": f.reduction_steps,
                    "request_url": f.request_url,
                    "response_status": f.response_status,
                    "evidence": f.evidence,
                }
                for f in self.report.findings
            ],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    def _severity_badge(self, severity: Severity) -> str:
        colors = {
            Severity.CRITICAL: "#dc3545",
            Severity.HIGH: "#fd7e14",
            Severity.MEDIUM: "#ffc107",
            Severity.LOW: "#0dcaf0",
            Severity.INFO: "#6c757d",
        }
        color = colors.get(severity, "#6c757d")
        return f'<span style="background:{color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">{severity.value.upper()}</span>'

    def _vuln_type_badge(self, vuln_type: VulnType) -> str:
        colors = {
            VulnType.SQL_INJECTION: "#e74c3c",
            VulnType.XSS: "#9b59b6",
            VulnType.IDOR: "#e67e22",
            VulnType.PARAM_POLLUTION: "#3498db",
        }
        color = colors.get(vuln_type, "#6c757d")
        return f'<span style="background:{color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">{vuln_type.value.replace("_", " ").upper()}</span>'

    def _count_by_severity(self) -> dict:
        counts = {s.value: 0 for s in Severity}
        for f in self.report.findings:
            counts[f.severity.value] += 1
        return counts

    def _count_by_vuln_type(self) -> dict:
        counts = {v.value: 0 for v in VulnType}
        for f in self.report.findings:
            counts[f.vuln_type.value] += 1
        return counts

    def to_html(self) -> str:
        severity_counts = self._count_by_severity()
        vuln_type_counts = self._count_by_vuln_type()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        auth_warning_html = ""
        if self.report.auth_warning:
            auth_warning_html = f"""
<div class="auth-warning">
    <span class="icon">⚠️</span>
    <strong>认证警告：</strong>{html.escape(self.report.auth_warning)}
</div>"""

        findings_rows = ""
        for i, f in enumerate(self.report.findings, 1):
            snippet_escaped = html.escape(f.response_snippet[:200])
            payload_display = html.escape(f.payload[:80])
            minimal_display = ""
            if f.minimal_payload and f.minimal_payload != f.payload:
                minimal_display = f'<br><span style="color:#27ae60;font-size:11px;">→ 最小: <code>{html.escape(f.minimal_payload[:80])}</code></span>'

            curl_cell = ""
            if f.curl_command:
                curl_escaped = html.escape(f.curl_command)
                curl_cell = f'<button onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent)" style="font-size:10px;padding:2px 6px;cursor:pointer;border:1px solid #ccc;border-radius:3px;background:#f8f9fa;">复制</button><pre style="display:none">{curl_escaped}</pre><code style="font-size:10px;word-break:break-all;display:block;max-height:60px;overflow:auto;">{curl_escaped[:200]}</code>'

            findings_rows += f"""
            <tr>
                <td>{i}</td>
                <td>{self._vuln_type_badge(f.vuln_type)}</td>
                <td>{self._severity_badge(f.severity)}</td>
                <td><code>{html.escape(f.method)} {html.escape(f.endpoint)}</code></td>
                <td>{html.escape(f.test_name)}</td>
                <td><code>{payload_display}</code>{minimal_display}</td>
                <td>{f.response_status}</td>
                <td>{html.escape(f.evidence)}</td>
                <td>{curl_cell}</td>
            </tr>"""

        return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API Fuzz Test Report</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f0f2f5; color:#333; padding:20px; }}
.container {{ max-width:1200px; margin:0 auto; }}
h1 {{ text-align:center; margin-bottom:30px; color:#1a1a2e; }}
.summary-cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-bottom:30px; }}
.card {{ background:#fff; border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.08); text-align:center; }}
.card .number {{ font-size:32px; font-weight:700; }}
.card .label {{ font-size:14px; color:#666; margin-top:4px; }}
.card.critical .number {{ color:#dc3545; }}
.card.high .number {{ color:#fd7e14; }}
.card.medium .number {{ color:#ffc107; }}
.card.low .number {{ color:#0dcaf0; }}
.info-section {{ background:#fff; border-radius:12px; padding:24px; margin-bottom:24px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }}
.info-section h2 {{ margin-bottom:16px; color:#1a1a2e; font-size:18px; border-bottom:2px solid #e9ecef; padding-bottom:8px; }}
.info-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }}
.info-item {{ padding:8px 0; }}
.info-item .key {{ color:#666; font-size:13px; }}
.info-item .value {{ font-weight:600; }}
.severity-bar {{ display:flex; gap:12px; flex-wrap:wrap; margin-top:12px; }}
.severity-item {{ display:flex; align-items:center; gap:6px; }}
.severity-dot {{ width:12px; height:12px; border-radius:50%; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th {{ background:#1a1a2e; color:#fff; padding:12px 8px; text-align:left; position:sticky; top:0; }}
td {{ padding:10px 8px; border-bottom:1px solid #e9ecef; vertical-align:top; }}
tr:hover {{ background:#f8f9fa; }}
.table-wrapper {{ overflow-x:auto; max-height:600px; overflow-y:auto; border-radius:8px; }}
.footer {{ text-align:center; margin-top:30px; color:#999; font-size:12px; }}
.auth-warning {{ background:#fff3cd; border:1px solid #ffc107; color:#856404; border-radius:12px; padding:16px 20px; margin-bottom:24px; }}
.auth-warning .icon {{ font-size:24px; margin-right:10px; }}
</style>
</head>
<body>
<div class="container">
<h1>🔍 API Fuzz Test Report</h1>
{auth_warning_html}
<div class="summary-cards">
    <div class="card"><div class="number">{self.report.total_endpoints}</div><div class="label">Endpoints Tested</div></div>
    <div class="card"><div class="number">{self.report.total_requests}</div><div class="label">Total Requests</div></div>
    <div class="card critical"><div class="number">{severity_counts['critical']}</div><div class="label">Critical</div></div>
    <div class="card high"><div class="number">{severity_counts['high']}</div><div class="label">High</div></div>
    <div class="card medium"><div class="number">{severity_counts['medium']}</div><div class="label">Medium</div></div>
    <div class="card low"><div class="number">{severity_counts['low']}</div><div class="label">Low</div></div>
</div>
<div class="info-section">
    <h2>Test Information</h2>
    <div class="info-grid">
        <div class="info-item"><div class="key">Target URL</div><div class="value">{html.escape(self.report.target_url)}</div></div>
        <div class="info-item"><div class="key">Spec File</div><div class="value">{html.escape(self.report.spec_file)}</div></div>
        <div class="info-item"><div class="key">Duration</div><div class="value">{self.report.duration_seconds:.2f}s</div></div>
        <div class="info-item"><div class="key">Generated</div><div class="value">{now}</div></div>
    </div>
    <div class="severity-bar">
        <div class="severity-item"><div class="severity-dot" style="background:#e74c3c"></div> SQL Injection: {vuln_type_counts['sql_injection']}</div>
        <div class="severity-item"><div class="severity-dot" style="background:#9b59b6"></div> XSS: {vuln_type_counts['xss']}</div>
        <div class="severity-item"><div class="severity-dot" style="background:#e67e22"></div> IDOR: {vuln_type_counts['idor']}</div>
        <div class="severity-item"><div class="severity-dot" style="background:#3498db"></div> Param Pollution: {vuln_type_counts['param_pollution']}</div>
    </div>
</div>
<div class="info-section">
    <h2>Vulnerability Findings ({self.report.total_findings})</h2>
    <div class="table-wrapper">
    <table>
        <thead><tr><th>#</th><th>Type</th><th>Severity</th><th>Endpoint</th><th>Test</th><th>Payload</th><th>Status</th><th>Evidence</th><th>cURL</th></tr></thead>
        <tbody>{findings_rows or '<tr><td colspan="9" style="text-align:center;padding:40px;color:#999;">No vulnerabilities found</td></tr>'}</tbody>
    </table>
    </div>
</div>
<div class="footer">Generated by API Fuzz Engine · {now}</div>
</div>
</body>
</html>"""
