#!/usr/bin/env python
import sys
import subprocess
import time


def run_command(cmd, description):
    print(f"\n{'='*60}")
    print(f"Running: {description}")
    print(f"Command: {cmd}")
    print('='*60)
    try:
        result = subprocess.run(cmd, shell=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        return False


def check_postgres():
    try:
        import psycopg2
        from config import settings
        conn = psycopg2.connect(settings.DATABASE_URL)
        conn.close()
        print("PostgreSQL connection: OK")
        return True
    except Exception as e:
        print(f"PostgreSQL connection failed: {e}")
        print("Please make sure PostgreSQL is running and database is created.")
        return False


def check_redis():
    try:
        import redis
        from config import settings
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        print("Redis connection: OK")
        return True
    except Exception as e:
        print(f"Redis connection failed: {e}")
        print("Please make sure Redis is running.")
        return False


def main():
    print("""
╔═══════════════════════════════════════════════════════════════╗
║          古陶瓷成分分析溯源API服务 - 初始化脚本                 ║
╚═══════════════════════════════════════════════════════════════╝
""")

    print("Step 1: Checking dependencies...")
    try:
        import fastapi
        import sklearn
        import numpy
        import sqlalchemy
        print("All Python dependencies are installed.")
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Please run: pip install -r requirements.txt")
        return 1

    print("\nStep 2: Checking database connections...")
    postgres_ok = check_postgres()
    redis_ok = check_redis()

    if not postgres_ok:
        print("\nPlease create the database first:")
        print("  CREATE DATABASE ceramic_analysis;")
        return 1

    print("\nStep 3: Initializing database and loading standard kiln samples...")
    try:
        from init_kiln_data import generate_kiln_samples
        generate_kiln_samples()
        print("Database initialization completed.")
    except Exception as e:
        print(f"Database initialization error: {e}")
        return 1

    print("\nStep 4: Training machine learning models...")
    try:
        from ml_models import ml_model
        if ml_model.is_trained:
            print("Models trained successfully.")
        else:
            print("Warning: Models were not trained.")
    except Exception as e:
        print(f"Model training error: {e}")
        return 1

    print("\n" + "="*60)
    print("Initialization completed successfully!")
    print("\nTo start the API server, run:")
    print("  python main.py")
    print("\nOr with uvicorn:")
    print("  uvicorn main:app --host 0.0.0.0 --port 8000 --reload")
    print("\nAPI documentation will be available at:")
    print("  http://localhost:8000/docs")
    print("="*60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
