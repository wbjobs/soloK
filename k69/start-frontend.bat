@echo off
echo ========================================
echo 启动地震监测系统前端
echo ========================================

cd /d "%~dp0frontend"

echo.
echo 检查Node.js依赖...
if not exist "node_modules" (
    echo 首次运行，安装依赖...
    npm install
)

echo.
echo 启动Vue开发服务器...
echo 访问地址: http://localhost:8080
echo.

npm run serve

pause
