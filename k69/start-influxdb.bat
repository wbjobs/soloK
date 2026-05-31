@echo off
echo ========================================
echo 启动InfluxDB数据库
echo ========================================

cd /d "%~dp0"

echo.
echo 启动InfluxDB容器...
docker-compose up -d

echo.
echo 等待InfluxDB启动...
timeout /t 10 /nobreak

echo.
echo InfluxDB已启动!
echo Web UI: http://localhost:8086
echo 用户名: admin
echo 密码: admin123456
echo.

pause
