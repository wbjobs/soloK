@echo off
echo ========================================
echo 地下水污染羽流可视化系统 - 后端启动
echo ========================================

echo.
echo [1/3] 检查Python环境...
python --version
if errorlevel 1 (
    echo 错误: 未找到Python，请先安装Python 3.9+
    pause
    exit /b 1
)

echo.
echo [2/3] 安装依赖...
pip install -r requirements.txt
if errorlevel 1 (
    echo 错误: 依赖安装失败
    pause
    exit /b 1
)

echo.
echo [3/3] 启动服务...
echo API服务将在 http://localhost:8000 启动
echo Socket.IO服务将在 http://localhost:5000 启动
echo API文档: http://localhost:8000/docs
echo.
echo 按 Ctrl+C 停止服务
echo.

python main.py
pause
