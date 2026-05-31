@echo off
echo ========================================
echo 导入地震波形模拟数据
echo ========================================

cd /d "%~dp0backend"

set /p DAYS="请输入要生成的天数 (默认7): "
if "%DAYS%"=="" set DAYS=7

echo.
echo 开始生成 %DAYS% 天的模拟数据...
echo 每分钟数据点: 10000
echo 预计数据量: %DAYS% x 1440 x 10000 = %DAYS% x 14,400,000 点
echo.

python import_data.py %DAYS%

echo.
echo 数据导入完成!
pause
