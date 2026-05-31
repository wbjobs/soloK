@echo off
echo ========================================
echo 启动地震监测系统后端
echo ========================================

cd /d "%~dp0backend"

echo.
echo 检查Python依赖...
pip install -r requirements.txt

echo.
echo 启动FastAPI服务...
echo API文档: http://localhost:8000/docs
echo.

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
