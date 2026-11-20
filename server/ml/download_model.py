import os

from huggingface_hub import snapshot_download


def main() -> None:
    repo_id = os.environ.get("HF_MODEL_REPO_ID")
    token = os.environ.get("HF_TOKEN")
    if not repo_id or not token:
        raise RuntimeError("HF_MODEL_REPO_ID and HF_TOKEN are required to download the private model export")

    snapshot_download(
        repo_id=repo_id,
        repo_type="model",
        token=token,
        local_dir="/app/Bizi_model_export",
    )


if __name__ == "__main__":
    main()
