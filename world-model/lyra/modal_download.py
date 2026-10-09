"""Download Lyra 2.0 checkpoints (97 GB) and the DA3 depth model into the "lyra2-checkpoints" volume. CPU only.

Usage: modal run --detach modal_download.py
"""
import subprocess

import modal

app = modal.App("lyra2-download")
ckpt_vol = modal.Volume.from_name("lyra2-checkpoints", create_if_missing=True)
image = modal.Image.debian_slim(python_version="3.10").pip_install("huggingface_hub[hf_transfer]==0.35.3").env(
    {"HF_HOME": "/ckpt/hf", "HF_HUB_ENABLE_HF_TRANSFER": "1"})


@app.function(image=image, volumes={"/ckpt": ckpt_vol}, timeout=4 * 3600, cpu=4, memory=16384)
def download():
    from huggingface_hub import snapshot_download
    snapshot_download("nvidia/Lyra-2.0", allow_patterns=["checkpoints/*"], local_dir="/ckpt/lyra", max_workers=16)
    snapshot_download("depth-anything/DA3NESTED-GIANT-LARGE-1.1")  # fetched at runtime by the pipeline
    ckpt_vol.commit()
    print(subprocess.run(["du", "-sh", "/ckpt/lyra", "/ckpt/hf"], capture_output=True, text=True).stdout)


@app.local_entrypoint()
def main():
    download.remote()
