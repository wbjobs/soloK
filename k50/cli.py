import asyncio
import json
import sys
from pathlib import Path

import click

from fuzzer.models import FuzzConfig, VulnType
from fuzzer.engine import FuzzEngine
from fuzzer.reporter import ReportGenerator


@click.group()
def cli():
    pass


@cli.command()
@click.option("--spec", "-s", required=True, type=click.Path(exists=True), help="OpenAPI/Swagger 规范文件路径")
@click.option("--base-url", "-u", required=True, help="目标 API Base URL")
@click.option("--concurrency", "-c", default=5, help="并发请求数 (默认: 5)")
@click.option("--delay", "-d", default=100, help="请求间隔毫秒数 (默认: 100)")
@click.option("--timeout", "-t", default=30, help="请求超时秒数 (默认: 30)")
@click.option("--vuln-types", "-v", default="sql_injection,xss,idor,param_pollution",
              help="测试的漏洞类型，逗号分隔 (默认: 全部)")
@click.option("--output", "-o", default=None, help="报告输出路径 (不带扩展名)")
@click.option("--format", "-f", "report_format", default="both",
              type=click.Choice(["json", "html", "both"]), help="报告格式 (默认: both)")
@click.option("--headers", "-h", "custom_headers", default=None, help="自定义 Headers JSON 字符串")
@click.option("--bearer-token", "-b", default=None, help="Bearer Token (JWT)")
@click.option("--cookie", "-k", default=None, help="Cookie 字符串，如: sessionId=abc; userId=123")
@click.option("--api-key-header", default="X-API-Key", help="API Key Header 名称 (默认: X-API-Key)")
@click.option("--api-key", default=None, help="API Key 值")
def run(spec, base_url, concurrency, delay, timeout, vuln_types, output, report_format,
        custom_headers, bearer_token, cookie, api_key_header, api_key):
    """运行 API 模糊测试"""
    spec_path = Path(spec)
    content = spec_path.read_text(encoding="utf-8")

    if spec_path.suffix.lower() == ".json":
        spec_format = "json"
    elif spec_path.suffix.lower() in (".yaml", ".yml"):
        spec_format = "yaml"
    else:
        spec_format = "auto"

    parsed_vuln_types = []
    for vt in vuln_types.split(","):
        vt = vt.strip()
        if vt:
            try:
                parsed_vuln_types.append(VulnType(vt))
            except ValueError:
                click.echo(f"未知漏洞类型: {vt}", err=True)

    if not parsed_vuln_types:
        parsed_vuln_types = list(VulnType)

    parsed_headers = {}
    if custom_headers:
        try:
            parsed_headers = json.loads(custom_headers)
        except json.JSONDecodeError:
            click.echo("Headers JSON 格式错误", err=True)
            return

    config = FuzzConfig(
        base_url=base_url.rstrip("/"),
        concurrency=max(1, min(concurrency, 20)),
        delay_ms=max(0, delay),
        timeout=max(5, timeout),
        headers=parsed_headers,
        vuln_types=parsed_vuln_types,
        bearer_token=bearer_token or "",
        cookie=cookie or "",
        api_key_header=api_key_header or "X-API-Key",
        api_key_value=api_key or "",
    )

    engine = FuzzEngine(config)

    def on_progress(msg, pct):
        bar_len = 30
        filled = int(bar_len * pct)
        bar = "█" * filled + "░" * (bar_len - filled)
        click.echo(f"\r  [{bar}] {pct:.0%} {msg}", nl=False)
        if pct >= 1.0:
            click.echo()

    engine.set_progress_callback(on_progress)

    click.echo(f"\n🚀 API Fuzz Engine")
    click.echo(f"  规范文件: {spec}")
    click.echo(f"  目标 URL: {base_url}")
    click.echo(f"  并发数:   {concurrency}")
    click.echo(f"  漏洞类型: {', '.join(vt.value for vt in parsed_vuln_types)}")
    click.echo()

    try:
        engine.load_spec(content, spec_format)
    except Exception as e:
        click.echo(f"\n❌ 解析规范失败: {e}", err=True)
        return

    click.echo(f"  解析到 {len(engine.endpoints)} 个端点")
    click.echo()

    report = asyncio.run(engine.run())

    click.echo(f"\n📊 测试完成!")
    click.echo(f"  端点数:   {report.total_endpoints}")
    click.echo(f"  请求数:   {report.total_requests}")
    click.echo(f"  发现漏洞: {report.total_findings}")
    click.echo(f"  耗时:     {report.duration_seconds:.2f}s")

    if report.auth_warning:
        click.echo(f"\n⚠️  {report.auth_warning}")

    if report.findings:
        click.echo(f"\n⚠️  漏洞发现:")
        for i, f in enumerate(report.findings, 1):
            click.echo(f"  {i}. [{f.severity.value.upper()}] {f.vuln_type.value} "
                       f"on {f.method} {f.endpoint}")
            click.echo(f"     证据: {f.evidence}")
            if f.minimal_payload and f.minimal_payload != f.payload:
                click.echo(f"     最小 Payload: {f.minimal_payload}")
                click.echo(f"     缩减步数: {f.reduction_steps}")
            if f.curl_command:
                click.echo(f"     复现命令:")
                for line in f.curl_command.split("\n"):
                    click.echo(f"       {line}")

    reporter = ReportGenerator(report)

    if output is None:
        output = f"fuzz-report-{spec_path.stem}"

    if report_format in ("json", "both"):
        json_path = output + ".json"
        Path(json_path).write_text(reporter.to_json(), encoding="utf-8")
        click.echo(f"\n  JSON 报告: {json_path}")

    if report_format in ("html", "both"):
        html_path = output + ".html"
        Path(html_path).write_text(reporter.to_html(), encoding="utf-8")
        click.echo(f"  HTML 报告: {html_path}")


@cli.command()
@click.option("--spec", "-s", required=True, type=click.Path(exists=True), help="OpenAPI/Swagger 规范文件路径")
def parse(spec):
    """解析并展示 API 规范中的端点信息"""
    spec_path = Path(spec)
    content = spec_path.read_text(encoding="utf-8")

    from fuzzer.parser import OpenApiParser

    if spec_path.suffix.lower() == ".json":
        fmt = "json"
    elif spec_path.suffix.lower() in (".yaml", ".yml"):
        fmt = "yaml"
    else:
        fmt = "auto"

    try:
        parser = OpenApiParser(content, fmt)
        endpoints = parser.parse_endpoints()
        base_url = parser.get_base_url()

        click.echo(f"\n📡 API 规范解析结果")
        click.echo(f"  Base URL: {base_url or '(未指定)'}")
        click.echo(f"  端点数:   {len(endpoints)}")
        click.echo()

        for ep in endpoints:
            params_str = ""
            if ep.parameters:
                params_str = " | ".join(
                    f"{p.name}({p.location.value}:{p.param_type})"
                    + ("*" if p.required else "")
                    for p in ep.parameters
                )
                params_str = f"  参数: {params_str}"

            body_str = ""
            if ep.request_body_schema:
                body_str = "  [有请求体]"

            click.echo(f"  {ep.method:7s} {ep.path}")
            if ep.summary:
                click.echo(f"          {ep.summary}")
            if params_str:
                click.echo(f"  {params_str}")
            if body_str:
                click.echo(f"  {body_str}")
            click.echo()

    except Exception as e:
        click.echo(f"❌ 解析失败: {e}", err=True)


@cli.command()
@click.option("--host", default="0.0.0.0", help="监听地址 (默认: 0.0.0.0)")
@click.option("--port", "-p", default=8000, help="监听端口 (默认: 8000)")
def web(host, port):
    """启动 Web 界面"""
    click.echo(f"🌐 启动 Web 界面: http://{host}:{port}")
    import uvicorn
    uvicorn.run("web.app:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    cli()
