@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Log Anomaly Detection - Quick Start
echo ========================================

echo.
echo [1/4] Starting infrastructure (Kafka, Redis, PostgreSQL)...
docker compose up -d

echo.
echo [2/4] Waiting for services to be ready...
timeout /t 15 /nobreak >nul

echo.
echo [3/4] Building project...
call mvn clean package -DskipTests -q

echo.
echo [4/4] Starting services...
echo.
echo   Starting Flink Job...
start "Flink Job" java -cp target/flink-log-anomaly-1.0.0.jar -DKAFKA_BROKERS=localhost:9092 -DREDIS_HOST=localhost -DPG_URL=jdbc:postgresql://localhost:5432/loganomaly -DPG_USER=loganomaly -DPG_PASS=loganomaly com.loganomaly.flink.LogAnomalyJob

echo   Starting REST API...
start "REST API" java -jar target/flink-log-anomaly-1.0.0.jar --spring.profiles.active=default

echo.
echo ========================================
echo   System is running!
echo ========================================
echo.
echo   REST API:       http://localhost:8080/api/v1/dashboard
echo   Stats:          http://localhost:8080/api/v1/stats
echo   Alerts:         http://localhost:8080/api/v1/alerts/recent
echo   Alert History:  http://localhost:8080/api/v1/alerts/history
echo.
echo   Close the Flink and API windows to stop, then run: docker compose down
echo.

pause
