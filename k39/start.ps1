$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  K39 项目启动脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] 检查 Docker 是否运行..." -ForegroundColor Yellow
try {
    $null = docker info 2>&1
    Write-Host "  Docker 正在运行" -ForegroundColor Green
} catch {
    Write-Host "  错误: Docker 未运行，请先启动 Docker Desktop" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/4] 检查 .env 配置文件..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    Write-Host "  创建 backend/.env 文件..." -ForegroundColor Gray
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "  已从 .env.example 复制，请根据需要修改配置" -ForegroundColor Green
} else {
    Write-Host "  backend/.env 已存在" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3/4] 构建 Docker 镜像并启动服务..." -ForegroundColor Yellow
docker-compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "  错误: Docker Compose 启动失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[4/4] 等待服务就绪..." -ForegroundColor Yellow
$maxRetries = 30
$retry = 0
$backendReady = $false

while ($retry -lt $maxRetries) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
            break
        }
    } catch {}
    $retry++
    Write-Host "  等待后端服务启动... ($retry/$maxRetries)" -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($backendReady) {
    Write-Host "  所有服务已启动!" -ForegroundColor Green
} else {
    Write-Host "  后端服务可能仍在初始化中" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  前端访问:     http://localhost:5173" -ForegroundColor White
Write-Host "  Nginx代理:    http://localhost:80" -ForegroundColor White
Write-Host "  后端API:      http://localhost:8000" -ForegroundColor White
Write-Host "  API文档:      http://localhost:8000/docs" -ForegroundColor White
Write-Host "  数据库:       localhost:5432" -ForegroundColor White
Write-Host ""
Write-Host "  停止服务:     docker-compose down" -ForegroundColor Gray
Write-Host "  查看日志:     docker-compose logs -f" -ForegroundColor Gray
Write-Host ""
