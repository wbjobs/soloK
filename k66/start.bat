@echo off
echo ========================================
echo Remote Desktop System - Startup Script
echo ========================================
echo.

echo [1/5] Starting MongoDB...
start "MongoDB" mongod --dbpath="%CD%\mongodb-data"

timeout /t 5 /nobreak >nul

echo.
echo [2/5] Installing backend dependencies...
cd backend
if not exist "node_modules" (
    call npm install
)

echo.
echo [3/5] Starting Node.js backend...
start "Node Backend" cmd /k "npm run dev"
cd ..

timeout /t 3 /nobreak >nul

echo.
echo [4/5] Installing frontend dependencies...
cd frontend
if not exist "node_modules" (
    call npm install
)

echo.
echo [5/5] Starting React frontend...
start "React Frontend" cmd /k "npm start"
cd ..

echo.
echo ========================================
echo Services starting...
echo - Backend: http://localhost:3001
echo - Frontend: http://localhost:3000
echo.
echo To start Python service, run:
echo   cd python-service
echo   pip install -r requirements.txt
echo   python main.py
echo ========================================
pause
