# ICT engine — pure-stdlib HTTP backtester + ICT Training (AI authoring,
# calibration, optimisation). The core needs nothing beyond stdlib; the
# optional features need the packages installed below so they work in cloud.
#
# Build (context = engine/):  docker build -t engine .
# Run:                        docker run -e PORT=8080 -p 8080:8080 engine
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# ICT Training extras. Kept out of requirements.txt (which documents the
# stdlib-first local philosophy) and installed explicitly for the container.
RUN pip install --no-cache-dir \
    "anthropic>=0.40" \
    "optuna>=3.6" \
    "numpy>=1.26" \
    "scikit-learn>=1.4" \
    "firebase-admin>=6.5"

COPY . .

# Cloud Run injects PORT (default 8080) and expects the server on 0.0.0.0.
# server.py reads PORT and binds 0.0.0.0 when PORT is set.
ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]
