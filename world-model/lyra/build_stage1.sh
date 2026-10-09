#!/usr/bin/env bash
# Build Lyra 2.0 inside the Modal image, following Lyra-2/INSTALL.md. Split in two cached stages.
set -euxo pipefail
source /opt/build_env.sh

# 0. Source: only the two submodules inference needs (the GUI ones are large and unused).
git clone --depth 1 https://github.com/nv-tlabs/lyra.git /opt/lyra
cd /opt/lyra
git submodule update --init --depth 1 Lyra-2/lyra_2/_src/inference/depth_anything_3 Lyra-2/lyra_2/_src/inference/vipe
cd Lyra-2

# 5. Python dependencies
pip install --no-deps -r requirements.txt
pip install "git+https://github.com/microsoft/MoGe.git"
# Pin transformer-engine to the release current when Lyra 2 shipped (2026-04-15). Unpinned, pip takes
# v2.20+, which since 2026-09-21 requires cuDNN >= 9.12 and so fails against torch 2.7.1's bundled cuDNN.
pip install --no-build-isolation "transformer_engine[pytorch]==2.13.0"
pip install wcwidth==0.6.0  # needed at inference but missing from requirements.txt (nv-tlabs/lyra#47)
ln -sf "$SITE/nvidia/cuda_runtime" "$SITE/nvidia/cudart"

# 6. Flash Attention: prefer a prebuilt wheel matching this torch's C++ ABI, else build 2.6.3 as documented.
ABI=$(python -c 'import torch; print("TRUE" if torch._C._GLIBCXX_USE_CXX11_ABI else "FALSE")')
WHEEL="https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu12torch2.7cxx11abi${ABI}-cp310-cp310-linux_x86_64.whl"
pip install --no-deps "$WHEEL" || MAX_JOBS=$MAX_JOBS pip install --no-build-isolation --no-binary :all: flash-attn==2.6.3

# 7. Vendored CUDA extensions
USE_SYSTEM_EIGEN=1 pip install --no-build-isolation -e lyra_2/_src/inference/vipe
