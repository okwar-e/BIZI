#!/bin/sh
set -eu

artifact_dir=/app/Bizi_model_export
missing=0

if [ ! -f "$artifact_dir/feature_config.json" ]; then
    printf 'Downloading private model artifacts from Hugging Face.\n'
    python /app/download_model.py
fi

for artifact in \
    feature_config.json \
    final_model.joblib \
    tfidf_vectorizer.joblib \
    creator_profiles.csv \
    all-MiniLM-L6-v2/config.json \
    all-MiniLM-L6-v2/modules.json \
    all-MiniLM-L6-v2/1_Pooling/config.json \
    all-MiniLM-L6-v2/model.safetensors \
    all-MiniLM-L6-v2/tokenizer.json
do
    if [ ! -f "$artifact_dir/$artifact" ]; then
        printf 'Required model artifact is missing: %s\n' "$artifact_dir/$artifact" >&2
        missing=1
    fi
done

if [ "$missing" -ne 0 ]; then
    printf 'Mount the approved model artifacts at %s before starting the ML service.\n' "$artifact_dir" >&2
    exit 1
fi

exec uvicorn ml.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
