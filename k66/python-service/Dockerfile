FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3-tk \
    python3-dev \
    scrot \
    libxext6 \
    libxrender1 \
    libxtst6 \
    libx11-6 \
    libxinerama1 \
    libxrandr2 \
    libxfixes3 \
    libxcursor1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["python", "main.py"]
