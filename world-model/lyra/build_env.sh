# Build Lyra 2.0 inside the Modal image, following Lyra-2/INSTALL.md.
# Runs at image-build time (no GPU), so CUDA extensions are compiled for H100 (sm_90) only.

PREFIX=$(python -c 'import sys; print(sys.prefix)')
SITE=$(python -c 'import site; print(site.getsitepackages()[0])')
export CUDA_HOME=$PREFIX
export CC=$PREFIX/bin/x86_64-conda-linux-gnu-gcc
export CXX=$PREFIX/bin/x86_64-conda-linux-gnu-g++
export CPATH="$CUDA_HOME/include:$SITE/nvidia/cudnn/include:$SITE/nvidia/nccl/include:${CPATH:-}"
# Building transformer-engine also needs the pip-installed nvrtc and nvtx headers (nv-tlabs/lyra#47).
export CPATH="$SITE/nvidia/cuda_nvrtc/include:$SITE/nvidia/nvtx/include:$CPATH"
export LD_LIBRARY_PATH="$PREFIX/lib:$SITE/torch/lib:$SITE/nvidia/cuda_runtime/lib:$SITE/nvidia/cudnn/lib:$CUDA_HOME/lib64:${LD_LIBRARY_PATH:-}"
export TORCH_CUDA_ARCH_LIST="9.0"
export NVTE_CUDA_ARCHS="90"
export NVTE_FRAMEWORK=pytorch
export MAX_JOBS=${MAX_JOBS:-16}

