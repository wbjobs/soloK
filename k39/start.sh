#!/bin/bash
set -e

echo "========================================"
echo "  K39 项目启动脚本"
echo "========================================"
echo ""

echo "[1/4] 检查 Docker 是否运行..."
if ! docker info > /dev/null 2>&1; then
    echo "  错误: Docker 未运行，请先启动 Docker"
    exit 1
fi
echo "  Docker 正在运行"

echo ""
echo "[2/4] 检查 .env 配置文件..."
if [ ! -f "backend/.env" ]; then
    echo "  创建 backend/.env 文件..."
    cp backend/.env.example backend/.env
    echo "  已从 .env.example 复制，请根据需要修改配置"
else
    echo "  backend/.env 已存在"
fi

echo ""
echo "[3/4] 构建 Docker 镜像并启动服务..."
docker-compose up -d --build

echo ""
echo "[4/4] 等待服务就绪..."
max_retries=30
retry=0
backend_ready=false

while [ $retry -lt $max_retries ]; do
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        backend_ready=true
        break
    fi
    retry=$((retry + 1))
    echo "  等待后端服务启动... ($retry/$max_retries)"
    sleep 2
done

echo ""
echo "========================================"
if [ "$backend_ready" = true ]; then
    echo "  所有服务已启动!"
else
    echo "  后端服务可能仍在初始化中"
fi
echo "========================================"
echo ""
echo "  前端访问:     http://localhost:5173"
echo "  Nginx代理:    http://localhost:80"
echo "  后端API:      http://localhost:8000"
echo "  API文档:      http://localhost:8000/docs"
echo "  数据库:       localhost:5432"
echo ""
echo "  停止服务:     docker-compose down"
echo "  查看日志:     docker-compose logs -f"
echo ""
