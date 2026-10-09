"""NVIDIA Lyra 2.0 on Modal: one photo -> exploration video -> 3D Gaussian splat.

Steps (each is a separate entrypoint so costs stay visible):
  modal run modal_download.py            # 97 GB of checkpoints into a volume, CPU only
  modal run modal_lyra.py::smoke         # import check on a GPU (~1 min)
  modal run modal_lyra.py::generate      # runs A (zoom) and B (orbit) in parallel on two H100s
Results land in the "lyra2-outputs" volume; fetch them with `modal volume get lyra2-outputs / <dir>`.
"""
import json
import os
import subprocess
from pathlib import Path

import modal

HERE = Path(__file__).parent
app = modal.App("lyra2-palm-house")
ckpt_vol = modal.Volume.from_name("lyra2-checkpoints", create_if_missing=True)
out_vol = modal.Volume.from_name("lyra2-outputs", create_if_missing=True)

image = (
    modal.Image.micromamba(python_version="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0", "wget")
    .micromamba_install("cmake", "ninja", "ffmpeg", "packaging", "gcc=13.3.0", "gxx=13.3.0", "eigen", "zlib",
                        channels=["conda-forge"])
    .micromamba_install("cuda", channels=["nvidia/label/cuda-12.8.0", "conda-forge"])
    .pip_install("torch==2.7.1", "torchvision==0.22.1", extra_index_url="https://download.pytorch.org/whl/cu128")
    .add_local_file(HERE / "build_env.sh", "/opt/build_env.sh", copy=True)
    .add_local_file(HERE / "build_stage1.sh", "/opt/build_stage1.sh", copy=True)
    .run_commands("bash /opt/build_stage1.sh")  # deps, transformer-engine, flash-attn, VIPE (slow)
    .add_local_file(HERE / "build_stage2.sh", "/opt/build_stage2.sh", copy=True)
    .run_commands("bash /opt/build_stage2.sh")  # Depth-Anything-3 + import check
    .env({"HF_HOME": "/ckpt/hf", "HF_HUB_ENABLE_HF_TRANSFER": "1",
          "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True", "PYTHONPATH": "/opt/lyra/Lyra-2"})
)

REPO = "/opt/lyra/Lyra-2"

RUNS = {
    # Robust preset: push in towards the stair, then pull back to reveal the glasshouse.
    "A_zoom": dict(caption="zoom", args=["--zoom_in_trajectory", "horizontal_zoom", "--zoom_in_strength", "0.5",
                                         "--zoom_out_trajectory", "horizontal_zoom", "--zoom_out_strength", "1.5"]),
    # Approach, then orbit ~70 degrees around the image-centre depth (the staircase) to see its far side.
    "B_orbit": dict(caption="orbit", args=["--zoom_in_trajectory", "horizontal_zoom", "--zoom_in_strength", "0.35",
                                           "--zoom_out_trajectory", "orbit_horizontal", "--zoom_out_direction", "right",
                                           "--zoom_out_strength", "1.2"]),
}


def sh(cmd, **kw):
    print("+", " ".join(cmd), flush=True)
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = Path("/opt/lyra_ld_path").read_text().strip() + ":" + env.get("LD_LIBRARY_PATH", "")
    subprocess.run(cmd, check=True, cwd=REPO, env=env, **kw)


@app.function(image=image, timeout=600)
def deps_check():
    """CPU-only: find every top-level module imported by the inference code that is not installed."""
    import ast
    import importlib.util
    import sys
    roots = [Path(REPO) / "lyra_2", Path(REPO) / "lyra_2/_src/inference/vipe", Path(REPO) / "lyra_2/_src/inference/depth_anything_3"]
    names = set()
    for root in roots:
        for f in root.rglob("*.py"):
            if "/test" in str(f) or "/gui/" in str(f):
                continue
            try:
                tree = ast.parse(f.read_text(errors="ignore"))
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    names.update(a.name.split(".")[0] for a in node.names)
                elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                    names.add(node.module.split(".")[0])
    sys.path.insert(0, REPO)
    missing = sorted(n for n in names if n and importlib.util.find_spec(n) is None)
    print("MISSING:", " ".join(missing))
    return missing


PIP_NAME = {"sklearn": "scikit-learn", "yt_dlp": "yt-dlp", "faiss": "faiss-cpu", "ffmpeg": "ffmpeg-python"}


@app.function(image=image, timeout=1800, gpu="L4")
def resolve_imports():
    """Import the real entry points; on each ModuleNotFoundError pip-install that module and retry.
    Needs a GPU only because Triton (inside transformer-engine) refuses to import without one."""
    prefix = subprocess.run(["python", "-c", "import sys; print(sys.prefix)"], capture_output=True, text=True).stdout.strip()
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = ":".join([Path("/opt/lyra_ld_path").read_text().strip(), f"{prefix}/lib/stubs",
                                       f"{prefix}/targets/x86_64-linux/lib/stubs", env.get("LD_LIBRARY_PATH", "")])
    entry = ("import importlib; [importlib.import_module(m) for m in ("
             "'lyra_2._src.inference.lyra2_zoomgs_inference', 'lyra_2._src.inference.vipe_da3_gs_recon', "
             "'lyra_2._src.inference.depth_utils', 'depth_anything_3.api', 'vipe_ext', 'vipe', 'moge.model.v1', 'flash_attn', "
             "'depth_anything_3.api', 'depth_anything_3.model.utils.gs_renderer', 'depth_anything_3.registry', 'depth_anything_3.specs', 'depth_anything_3.utils.geometry', 'depth_anything_3.utils.gsply_helpers', 'depth_anything_3.utils.pose_align', 'hydra', 'hydra.core.global_hydra', 'lyra_2._src.inference.depth_utils', 'lyra_2._src.inference.get_t5_emb', 'megatron.core', 'moge.model.v1', 'moviepy.video.io.ImageSequenceClip', 'scipy.spatial.transform', 'torch.distributed', 'vipe.pipeline', 'vipe.streams.base')]; print('IMPORTS OK')")
    needed = []
    for _ in range(30):
        r = subprocess.run(["python", "-c", entry], cwd=REPO, env=env, capture_output=True, text=True)
        if r.returncode == 0:
            print("IMPORTS OK; needed:", needed)
            return needed
        err = r.stderr.strip().splitlines()
        last = err[-1] if err else ""
        print(">>", last)
        if "No module named" not in last:
            print("\n".join(err[-25:]))
            return needed + ["<non-import error>"]
        mod = last.split("No module named")[1].strip(" '\"").split(".")[0]
        pkg = PIP_NAME.get(mod, mod)
        needed.append(pkg)
        subprocess.run(["pip", "install", "-q", pkg], check=True)
    return needed


@app.function(image=image, gpu="L4", volumes={"/ckpt": ckpt_vol}, timeout=900)
def smoke():
    sh(["python", "-c", "import torch, flash_attn, transformer_engine.pytorch, vipe_ext, depth_anything_3.api, moge.model.v1;"
        "print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.get_device_name(0))"])
    sh(["python", "-m", "lyra_2._src.inference.lyra2_zoomgs_inference", "--help"], stdout=subprocess.DEVNULL)
    print("smoke OK")


@app.function(image=image, gpu="H100", volumes={"/ckpt": ckpt_vol, "/out": out_vol}, timeout=3 * 3600, memory=65536)
def run(name: str, image_png: bytes, caption: str):
    fast = name.endswith("_fast")  # DMD-distilled: ~15x faster, slightly weaker prompt following
    cfg = RUNS[name.removesuffix("_fast")]
    link = Path(REPO) / "checkpoints"
    if not link.exists():
        link.symlink_to("/ckpt/lyra/checkpoints")
    inp = Path(f"/tmp/in_{name}")
    inp.mkdir(exist_ok=True)
    (inp / "palm_house.png").write_bytes(image_png)
    (inp / "palm_house.txt").write_text(caption)
    out = Path(f"/out/{name}")
    out.mkdir(parents=True, exist_ok=True)

    sh(["python", "-m", "lyra_2._src.inference.lyra2_zoomgs_inference",
        "--input_image_path", str(inp), "--prompt_dir", str(inp), "--sample_id", "0",
        "--experiment", "lyra2", "--checkpoint_dir", "checkpoints/model", "--output_path", str(out),
        "--num_frames_zoom_in", "81", "--num_frames_zoom_out", "241", *cfg["args"], *(["--use_dmd"] if fast else [])])
    out_vol.commit()
    videos = sorted(out.rglob("videos/*.mp4"))
    print("videos:", videos, flush=True)
    return reconstruct_dir(out)


def reconstruct_dir(out: Path):
    """Video -> 3D Gaussian splat. A failure here is reported, not raised, so a parallel run keeps going."""
    video = sorted(out.rglob("videos/*.mp4"))[0]
    try:
        sh(["python", "-m", "lyra_2._src.inference.vipe_da3_gs_recon", "--input_video_path", str(video)])
    except subprocess.CalledProcessError as e:
        print(f"RECON FAILED for {out.name}: {e}", flush=True)
    out_vol.commit()
    files = [str(p.relative_to("/out")) for p in out.rglob("*") if p.is_file()]
    print(json.dumps(files, indent=1))
    return files


@app.function(image=image, gpu="H100", volumes={"/ckpt": ckpt_vol, "/out": out_vol}, timeout=3600, memory=65536)
def recon(name: str):
    """Re-run only the 3D reconstruction for a finished video (no regeneration)."""
    link = Path(REPO) / "checkpoints"
    if not link.exists():
        link.symlink_to("/ckpt/lyra/checkpoints")
    out_vol.reload()
    return reconstruct_dir(Path(f"/out/{name}"))


@app.local_entrypoint()
def recon_only(which: str = "A_zoom_fast,B_orbit_fast"):
    names = which.split(",")
    for name, files in zip(names, recon.map(names)):
        print(name, "->", files)


@app.local_entrypoint()
def generate(which: str = "A_zoom_fast,B_orbit_fast,A_zoom,B_orbit"):
    png = (HERE / "inputs/palm_house.png").read_bytes()
    caps = json.loads((HERE / "inputs/captions.json").read_text())
    names = which.split(",")
    for name, files in zip(names, run.starmap([(n, png, caps[RUNS[n.removesuffix("_fast")]["caption"]]) for n in names])):
        print(name, "->", files)
