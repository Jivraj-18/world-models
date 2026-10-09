#!/usr/bin/env bash
# Build Lyra 2.0 inside the Modal image, following Lyra-2/INSTALL.md. Split in two cached stages.
set -euxo pipefail
source /opt/build_env.sh

cd /opt/lyra/Lyra-2
# hatchling is pinned by requirements.txt but installed with --no-deps, so its own deps are missing.
pip install pathspec pluggy trove-classifiers
pip install --no-build-isolation -e "lyra_2/_src/inference/depth_anything_3[gs]"
pip install hf_transfer addict  # addict: imported by Depth-Anything-3 but missing from requirements
# VIPE fetches its DROID-SLAM weights from Google Drive with gdown (keyword args need gdown >= 5).
# Fetch them now so runs never depend on Drive at runtime; VIPE looks in torch.hub's dir.
pip install "gdown>=5.2"
python - <<'PY'
import gdown, torch
from pathlib import Path
p = Path(torch.hub.get_dir()) / "droid_slam" / "droid.pth"
p.parent.mkdir(parents=True, exist_ok=True)
if not p.exists():
    gdown.download(id="1PpqVt1H4maBa_GbPJp4NwxRsd9jk-elh", output=str(p))
print("droid weights:", p, p.stat().st_size)
PY

# Persist the runtime library path for later container starts.
echo "$PREFIX/lib:$SITE/torch/lib:$SITE/nvidia/cuda_runtime/lib:$SITE/nvidia/cudnn/lib" > /opt/lyra_ld_path
# Real imports need a GPU driver (absent at build time); smoke() tests them on a GPU.
pip show transformer_engine flash_attn depth_anything_3 moge vipe > /dev/null && echo "build packages OK"
