@echo off
echo ========================================
echo 地下水污染羽流可视化系统 - 前端启动
echo ========================================

echo.
echo 正在启动前端HTTP服务器...
echo 前端页面将在 http://localhost:3000 提供服务
echo.
echo 请确保后端服务已启动
echo 按 Ctrl+C 停止服务
echo.

cd /d "%~dp0"
python -m http.server 3000
pause
