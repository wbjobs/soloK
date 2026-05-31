import subprocess
import sys

if __name__ == "__main__":
    cmd = [
        sys.executable, "-m", "celery",
        "-A", "app.celery_app.celery",
        "worker",
        "--loglevel=info",
        "--pool=solo"
    ]
    subprocess.run(cmd)
