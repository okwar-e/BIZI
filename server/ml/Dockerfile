FROM python:3.12-slim

WORKDIR /app

COPY ml/requirements.txt ml/requirements.txt

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    PORT=8000

RUN python -m pip install --no-cache-dir \
      --index-url https://download.pytorch.org/whl/cpu \
      torch \
    && apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir -r ml/requirements.txt

COPY ml/app /app/ml/app
COPY ml/entrypoint.sh /app/entrypoint.sh
COPY ml/download_model.py /app/download_model.py

EXPOSE 8000

CMD ["sh", "/app/entrypoint.sh"]
