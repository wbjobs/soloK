@echo off
echo ========================================
echo 地下水污染羽流可视化系统 - 完整启动
echo ========================================

echo.
echo 正在启动后端服务...
start "后端服务" cmd /k "cd backend && start.bat"

echo.
echo 等待5秒让后端服务启动...
timeout /t 5 /nobreak

echo.
echo 正在启动前端服务...
start "前端服务" cmd /k "cd frontend && start.bat"

echo.
echo ========================================
echo 启动完成！
echo ========================================
echo API服务: http://localhost:8000
echo API文档: http://localhost:8000/docs
echo Socket.IO: http://localhost:5000
echo 前端页面: http://localhost:3000
echo.
echo 请在浏览器中打开 http://localhost:3000
echo ========================================
echo.
pause
